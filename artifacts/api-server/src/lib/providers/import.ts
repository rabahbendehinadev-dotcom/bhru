import {randomUUID} from 'node:crypto';
import {z} from '@workspace/api-zod';
import type {PoolClient} from '@workspace/db';
import {HttpError} from '../auth';
import {parseUsd,rateUnits,RATE_FACTOR} from '../commerce/currency-money';
import {usdText} from '../client-finance/wallet';
import {pricingLock} from '../client-finance/pricing';
import {saveService} from '../client-finance/catalog';
import {policyInput,providerRow,validatePolicyGroups,markupPrice} from './connections';
import {hashValue} from './adapter';
export const importInput=z.object({
  items:z.array(z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(160).optional(),
    priceUsd:z.string().regex(/^\d{1,10}(?:\.\d{1,12})?$/).optional()}).strict()).min(1).max(500),
  pricing:policyInput,groupId:z.string().uuid().nullable().optional(),
  newGroupName:z.string().trim().min(1).max(100).optional(),
  previewHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict().superRefine((v,ctx)=>{
  if(new Set(v.items.map(i=>i.id)).size!==v.items.length)ctx.addIssue({code:'custom',message:'Choose each upstream service once.'});
  if(v.groupId&&v.newGroupName)ctx.addIssue({code:'custom',message:'Choose an existing service group or a new name, not both.'});
});
export async function costFx(sub:string,currency:string,db:PoolClient){
  if(currency==='USD')return {rate:'1.000000',units:RATE_FACTOR};
  const base=(await db.query("SELECT rate FROM subscriber_currencies WHERE subscriber_id=$1 AND code='USD' AND is_base AND rate=1 FOR SHARE",[sub])).rows[0];
  const c=(await db.query('SELECT rate::text,rate_configured,enabled FROM subscriber_currencies WHERE subscriber_id=$1 AND code=$2 FOR SHARE',[sub,currency])).rows[0];
  if(!base||!c?.enabled||!c.rate_configured||rateUnits(c.rate)<=0n)
    throw new HttpError(409,`Configure an explicit USD-based commercial rate for ${currency} before provider pricing.`);
  return {rate:c.rate,units:rateUnits(c.rate)};
}
export function convertCost(units:bigint,rate:bigint){
  if(rate<=0n)throw new HttpError(409,'Provider currency rate is unavailable.');
  return (units*RATE_FACTOR+rate/2n)/rate;
}
function signedText(units:bigint){return units<0n?`-${usdText(-units)}`:usdText(units);}
async function selection(sub:string,id:string,raw:unknown,db:PoolClient,lock:boolean){
  await pricingLock(sub,db,lock);
  const input=importInput.parse(raw),p=await providerRow(sub,id,db,lock);
  if(!p.enabled)throw new HttpError(409,'Enable the provider before importing.');
  await validatePolicyGroups(sub,input.pricing,db);
  if(input.groupId&&!(await db.query('SELECT id FROM manual_service_groups WHERE subscriber_id=$1 AND id=$2 AND enabled FOR SHARE',[sub,input.groupId])).rowCount)
    throw new HttpError(404,'An enabled service group is required.');
  const rows=(await db.query(`SELECT c.*,l.service_id,s.selling_price_usd_units retail_units
    FROM external_provider_catalog c LEFT JOIN external_provider_service_links l
      ON l.subscriber_id=c.subscriber_id AND l.provider_id=c.provider_id AND l.catalog_id=c.id
    LEFT JOIN manual_services s ON s.subscriber_id=l.subscriber_id AND s.id=l.service_id
    WHERE c.subscriber_id=$1 AND c.provider_id=$2 AND c.id=ANY($3::uuid[])
    ${lock?'FOR UPDATE OF c':''}`,[sub,id,input.items.map(i=>i.id)])).rows;
  if(rows.length!==input.items.length)throw new HttpError(404,'One or more selected upstream services are not available in this provider.');
  const ordered=input.items.map(i=>({row:rows.find(r=>r.id===i.id)!,input:i}));
  const items=[];
  for(const {row:r,input:override} of ordered){
    if(r.missing||r.availability===false||r.review_reasons.length||!r.service_type)
      throw new HttpError(409,'A selected service is missing, disabled or requires manual review.');
    const fx=await costFx(sub,r.currency,db),cost=convertCost(BigInt(r.cost_units),fx.units);
    const price=override.priceUsd!==undefined?parseUsd(override.priceUsd):markupPrice(cost,input.pricing.percentage,input.pricing.fixedUsd);
    if(price<=0n||price>9999999999990000000000n)throw new HttpError(400,'Enter a supported positive price.');
    const groupPrices=input.pricing.groups.map(g=>({groupId:g.groupId,priceUsd:usdText(markupPrice(cost,g.percentage,g.fixedUsd))}));
    items.push({id:r.id,name:override.name??r.name,sourceCurrency:r.currency,sourceCost:usdText(r.cost_units),fxRate:fx.rate,
      convertedCostUsd:usdText(cost),proposedPriceUsd:usdText(price),marginUsd:signedText(price-cost),
      currentPriceUsd:r.retail_units?usdText(r.retail_units):null,linkedServiceId:r.service_id??null,groupPrices});
  }
  const {previewHash:_ignored,...canonicalInput}=input;
  const previewHash=hashValue({input:canonicalInput,items,sourceHashes:ordered.map(i=>i.row.source_hash),configVersion:p.config_version});
  return {input,rows,preview:{previewHash,items,formula:'Converted Cost × (1 + Markup%) + Fixed USD Markup',
    visibility:'Inactive / non-orderable until Slice 7B. Linked services and existing overrides are not changed.'}};
}
export async function previewImport(sub:string,id:string,raw:unknown,db:PoolClient){
  return (await selection(sub,id,raw,db,false)).preview;
}
export async function importServices(sub:string,id:string,raw:unknown,db:PoolClient){
  const s=await selection(sub,id,raw,db,true);
  // Retrying a completed selection is a no-op, never a second service or a reprice.
  if(s.rows.every(r=>r.service_id))return {imported:0,existing:s.rows.length,serviceIds:s.rows.map(r=>r.service_id)};
  if(!s.input.previewHash||s.input.previewHash!==s.preview.previewHash)
    throw new HttpError(409,'Preview is missing or changed. Review fresh server prices and confirm again.');
  let groupId=s.input.groupId??null;
  if(s.input.newGroupName){
    groupId=randomUUID();
    await db.query('INSERT INTO manual_service_groups(id,subscriber_id,name) VALUES($1,$2,$3)',[groupId,sub,s.input.newGroupName]);
  }
  const result={imported:0,existing:0,serviceIds:[] as string[]};
  for(const item of s.preview.items){
    const r=s.rows.find(r=>r.id===item.id)!;
    if(r.service_id){result.existing++;result.serviceIds.push(r.service_id);continue;}
    const service=await saveService(sub,undefined,{name:item.name,serviceType:r.service_type,groupId,description:'',
      priceUsd:item.proposedPriceUsd,estimatedTime:r.estimated_time,active:false,displayOrder:0,requirements:r.requirements},db,'external_provider');
    await db.query(`INSERT INTO external_provider_service_links(subscriber_id,provider_id,catalog_id,service_id,
      imported_source_hash,imported_cost_units,imported_currency,imported_fx_rate) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [sub,id,r.id,service.id,r.source_hash,r.cost_units,r.currency,item.fxRate]);
    for(const g of item.groupPrices)await db.query(`INSERT INTO client_group_service_prices(subscriber_id,group_id,service_id,method,value_units)
      VALUES($1,$2,$3,'FIXED_PRICE',$4)`,[sub,g.groupId,service.id,parseUsd(g.priceUsd).toString()]);
    result.imported++;result.serviceIds.push(service.id);
  }
  return result;
}
