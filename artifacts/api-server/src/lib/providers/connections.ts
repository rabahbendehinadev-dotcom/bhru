import {randomUUID} from 'node:crypto';
import {z} from '@workspace/api-zod';
import type {PoolClient} from '@workspace/db';
import {HttpError} from '../auth';
import {encryptToken,providerStorageReady} from './credentials';
import {providerUrl} from './transport';
import {parseUsd} from '../commerce/currency-money';
export const providerInput=z.object({
  name:z.string().trim().min(1).max(100),protocol:z.literal('fusion_rest'),
  baseUrl:z.string().trim().max(300),enabled:z.boolean(),
  token:z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/).optional(),
  currency:z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
}).strict();
export const policyInput=z.object({
  percentage:z.string().regex(/^\d{1,5}(?:\.\d{1,2})?$/),
  fixedUsd:z.string().regex(/^\d{1,10}(?:\.\d{1,12})?$/),
  groups:z.array(z.object({
    groupId:z.string().uuid(),percentage:z.string().regex(/^\d{1,5}(?:\.\d{1,2})?$/),
    fixedUsd:z.string().regex(/^\d{1,10}(?:\.\d{1,12})?$/),
  }).strict()).max(50),
}).strict().superRefine((v,ctx)=>{
  if(new Set(v.groups.map(g=>g.groupId)).size!==v.groups.length)ctx.addIssue({code:'custom',message:'Choose each client group once.'});
  for(const m of [v,...v.groups])if(percentageUnits(m.percentage)>1000000n)ctx.addIssue({code:'custom',message:'Markup may not exceed 10000%.'});
});
export function percentageUnits(s:string){
  const [whole,fraction='']=s.split('.');return BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));
}
export function markupPrice(cost:bigint,percentage:string,fixedUsd:string){
  const price=(cost*(10000n+percentageUnits(percentage))+5000n)/10000n+parseUsd(fixedUsd);
  if(price<=0n||price>9999999999990000000000n)throw new HttpError(400,'Proposed price is outside the supported positive monetary range.');
  return price;
}
export async function providerRow(sub:string,id:string,db:PoolClient,lock=false){
  const row=(await db.query(`SELECT * FROM external_providers WHERE subscriber_id=$1 AND id=$2 ${lock?'FOR UPDATE':''}`,[sub,id])).rows[0];
  if(!row)throw new HttpError(404,'Provider not found.');return row;
}
export function providerView(p:Record<string,any>){
  return {id:p.id,name:p.name,protocol:p.protocol,baseUrl:p.base_url,enabled:p.enabled,
    health:p.enabled?p.health:'DISABLED',credentialSaved:!!p.credentials_encrypted,
    currency:p.currency??null,balance:p.balance??null,serviceCount:Number(p.service_count??0),
    lastTestAt:p.last_test_at??null,lastSyncAt:p.last_sync_at??null,safeError:p.safe_error??null,pricingPolicy:p.pricing_policy};
}
export async function configureProvider(sub:string,id:string|undefined,raw:unknown,db:PoolClient){
  if(!providerStorageReady())throw new HttpError(503,'Configure BHRU_PROVIDER_ENCRYPTION_KEY_V1 before saving providers.');
  const input=providerInput.parse(raw),url=providerUrl(input.baseUrl),key=id??randomUUID();
  const old=id?await providerRow(sub,id,db,true):null;
  if(!old&&!input.token)throw new HttpError(400,'A Bearer token is required for a new connection.');
  const encrypted=input.token?encryptToken(sub,key,input.token):old.credentials_encrypted;
  const currency=input.currency===undefined?old?.currency??null:input.currency;
  if(old){
    const changed=!!input.token||url!==old.base_url||currency!==old.currency||input.enabled!==old.enabled;
    await db.query(`UPDATE external_providers SET name=$3,base_url=$4,credentials_encrypted=$5,currency=$6,enabled=$7,
      health=CASE WHEN NOT $7 THEN 'DISABLED' WHEN $8 THEN 'NOT_TESTED' ELSE health END,
      safe_error=CASE WHEN $8 THEN NULL ELSE safe_error END,
      balance=CASE WHEN $8 THEN NULL ELSE balance END,
      last_test_at=CASE WHEN $8 THEN NULL ELSE last_test_at END,
      config_version=config_version+CASE WHEN $8 THEN 1 ELSE 0 END,updated_at=now()
      WHERE subscriber_id=$1 AND id=$2`,[sub,key,input.name,url,encrypted,currency,input.enabled,changed]);
  }else await db.query(`INSERT INTO external_providers(id,subscriber_id,protocol,name,base_url,credentials_encrypted,currency,enabled,health)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[key,sub,input.protocol,input.name,url,encrypted,currency,input.enabled,input.enabled?'NOT_TESTED':'DISABLED']);
  return providerView(await providerRow(sub,key,db));
}
export async function validatePolicyGroups(sub:string,policy:z.infer<typeof policyInput>,db:PoolClient){
  if(!policy.groups.length)return;
  const count=(await db.query('SELECT id FROM reseller_client_groups WHERE subscriber_id=$1 AND id=ANY($2::uuid[]) AND is_active FOR SHARE',
    [sub,policy.groups.map(g=>g.groupId)])).rowCount;
  if(count!==policy.groups.length)throw new HttpError(400,'Choose active client groups belonging to this reseller.');
}
