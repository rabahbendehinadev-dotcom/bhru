import {randomUUID} from 'node:crypto';
import type {PoolClient} from '@workspace/db';
import {z} from '@workspace/api-zod';
import {HttpError} from '../auth';
import {pricingLock,ruleUnits,ruleValue,basePrice,effectivePrice} from './pricing';
import {lockClient,usdText} from './wallet';
import {serviceRow} from './catalog';
import {activityContext} from '../customer-auth/activity';

const groupInput=z.object({name:z.string().trim().min(1).max(100),description:z.string().trim().max(1000).optional(),
 active:z.boolean().optional(),sortOrder:z.number().int().min(0).max(100000).optional()}).strict();
export async function groupRow(sub:string,id:string,db:PoolClient){
 const row=(await db.query(`SELECT g.*,
  (SELECT count(*)::int FROM public_customer_accounts c WHERE c.subscriber_id=g.subscriber_id AND c.client_group_id=g.id) customer_count,
  (SELECT count(*)::int FROM client_group_service_prices p WHERE p.subscriber_id=g.subscriber_id AND p.group_id=g.id) pricing_rule_count
  FROM reseller_client_groups g WHERE g.subscriber_id=$1 AND g.id=$2`,[sub,id])).rows[0];
 if(!row)throw new HttpError(404,'Client group not found.');return row;
}
function groupView(r:Record<string,any>){
 return {id:r.id,name:r.name,description:r.description,active:r.is_active,isDefault:r.is_default,sortOrder:r.sort_order,
  customerCount:r.customer_count,pricingRuleCount:r.pricing_rule_count};
}
export async function listGroups(sub:string,db:PoolClient){
 await pricingLock(sub,db);
 const rows=(await db.query(`SELECT g.*,
  (SELECT count(*)::int FROM public_customer_accounts c WHERE c.subscriber_id=g.subscriber_id AND c.client_group_id=g.id) customer_count,
  (SELECT count(*)::int FROM client_group_service_prices p WHERE p.subscriber_id=g.subscriber_id AND p.group_id=g.id) pricing_rule_count
  FROM reseller_client_groups g WHERE g.subscriber_id=$1 ORDER BY sort_order,name,id`,[sub])).rows;
 return {data:rows.map(groupView)};
}
async function groupAudit(sub:string,id:string,actor:string,action:string,db:PoolClient){
 await db.query('INSERT INTO client_group_admin_events(subscriber_id,group_id,actor_id,action) VALUES($1,$2,$3,$4)',[sub,id,actor,action]);
}
export async function saveGroup(sub:string,id:string|undefined,raw:unknown,actor:string,db:PoolClient){
 const v=groupInput.parse(raw);await pricingLock(sub,db,true);
 const old=id?await groupRow(sub,id,db):null,key=id??randomUUID();
 if(old?.is_default&&v.active===false)throw new HttpError(409,'Select another active default group before disabling this group.');
 if((await db.query('SELECT 1 FROM reseller_client_groups WHERE subscriber_id=$1 AND name=$2 AND id<>$3',[sub,v.name,key])).rowCount)throw new HttpError(409,'Group name already exists.');
 if(old)await db.query('UPDATE reseller_client_groups SET name=$3,description=$4,is_active=$5,sort_order=$6,updated_at=now() WHERE subscriber_id=$1 AND id=$2',
  [sub,key,v.name,v.description??old.description,v.active??old.is_active,v.sortOrder??old.sort_order]);
 else await db.query('INSERT INTO reseller_client_groups(id,subscriber_id,name,description,is_active,sort_order) VALUES($1,$2,$3,$4,$5,$6)',
  [key,sub,v.name,v.description??'',v.active??true,v.sortOrder??0]);
 await groupAudit(sub,key,actor,old?'updated':'created',db);return groupView(await groupRow(sub,key,db));
}
export async function selectDefault(sub:string,id:string,actor:string,db:PoolClient){
 await pricingLock(sub,db,true);const g=await groupRow(sub,id,db);
 if(!g.is_active)throw new HttpError(409,'Default group must be active.');
 if(!g.is_default){
  await db.query('UPDATE reseller_client_groups SET is_default=false,updated_at=now() WHERE subscriber_id=$1 AND is_default',[sub]);
  await db.query('UPDATE reseller_client_groups SET is_default=true,updated_at=now() WHERE subscriber_id=$1 AND id=$2',[sub,id]);
  await groupAudit(sub,id,actor,'default_changed',db);
 }
 return groupView(await groupRow(sub,id,db));
}
export async function deleteGroup(sub:string,id:string,actor:string,db:PoolClient){
 await pricingLock(sub,db,true);const g=await groupRow(sub,id,db);
 if(g.is_default||g.customer_count||g.pricing_rule_count||(await db.query('SELECT 1 FROM service_orders WHERE subscriber_id=$1 AND pricing_group_id=$2 LIMIT 1',[sub,id])).rowCount)
  throw new HttpError(409,'Referenced/default groups cannot be deleted; deactivate instead.');
 if(!(await db.query("SELECT 1 FROM client_group_admin_events WHERE subscriber_id=$1 AND group_id=$2 AND action='created'",[sub,id])).rowCount)
  throw new HttpError(409,'Legacy group history is not reconstructible; deactivate instead of deleting.');
 if((await db.query('SELECT 1 FROM client_service_access_events WHERE subscriber_id=$1 AND group_id=$2 LIMIT 1',[sub,id])).rowCount)
  throw new HttpError(409,'Group access history is referenced; deactivate instead of deleting.');
 await groupAudit(sub,id,actor,'deleted',db);
 await db.query('DELETE FROM reseller_client_groups WHERE subscriber_id=$1 AND id=$2',[sub,id]);return {ok:true};
}
export async function assignGroup(sub:string,customer:string,raw:unknown,actor:string,db:PoolClient){
 const v=z.object({groupId:z.string().uuid()}).strict().parse(raw);await pricingLock(sub,db,true);
 const g=await groupRow(sub,v.groupId,db);if(!g.is_active)throw new HttpError(409,'Inactive groups cannot be assigned.');
 const c=await lockClient(sub,customer,db);
 if(c.client_group_id!==g.id){
  await activityContext(db,sub,customer,{type:'subscriber_owner',id:actor});
  await db.query('UPDATE public_customer_accounts SET client_group_id=$3,updated_at=now() WHERE subscriber_id=$1 AND id=$2',[sub,customer,g.id]);
  await db.query("SELECT emit_client_activity($1,$2,$3,'PROFILE','customer_account',$2,$4)",[sub,customer,c.client_group_id?'customer_group_changed':'customer_group_assigned',randomUUID()]);
 }
 return {ok:true};
}
export async function savePricing(sub:string,target:string,service:string,raw:unknown,actor:string,db:PoolClient,customer=false){
 const v=ruleUnits(raw);await pricingLock(sub,db,true);
 if(customer)await lockClient(sub,target,db);else await groupRow(sub,target,db);
 await serviceRow(sub,service,db);
 const table=customer?'customer_service_prices':'client_group_service_prices',column=customer?'customer_id':'group_id';
 const old=(await db.query(`SELECT * FROM ${table} WHERE subscriber_id=$1 AND ${column}=$2 AND service_id=$3`,[sub,target,service])).rows[0];
 if(v.units===null)await db.query(`DELETE FROM ${table} WHERE subscriber_id=$1 AND ${column}=$2 AND service_id=$3`,[sub,target,service]);
 else await db.query(`INSERT INTO ${table}(subscriber_id,${column},service_id,method,value_units) VALUES($1,$2,$3,$4,$5)
  ON CONFLICT(subscriber_id,${column},service_id) DO UPDATE SET method=excluded.method,value_units=excluded.value_units,updated_at=now()`,[sub,target,service,v.method,v.units.toString()]);
 if(old||v.units!==null){
  if(customer){
   await activityContext(db,sub,target,{type:'subscriber_owner',id:actor});
   await db.query("SELECT emit_client_activity($1,$2,'customer_pricing_override_changed','PROFILE','customer_account',$2,$3)",[sub,target,randomUUID()]);
  }else await groupAudit(sub,target,actor,'pricing_changed',db);
 }
 return {ok:true};
}
export async function listPricing(sub:string,target:string,raw:unknown,db:PoolClient,customer=false){
 const q=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),search:z.string().trim().max(100).optional()}).strict().parse(raw);
 await pricingLock(sub,db);
 const group=customer?null:await groupRow(sub,target,db);
 if(customer&&!(await db.query('SELECT 1 FROM public_customer_accounts WHERE subscriber_id=$1 AND id=$2',[sub,target])).rowCount)throw new HttpError(404,'Client not found.');
 const table=customer?'customer_service_prices':'client_group_service_prices',column=customer?'customer_id':'group_id';
 const search=q.search?`%${q.search.replace(/[\\%_]/g,'\\$&')}%`:null;
 const rows=(await db.query(`SELECT s.*,p.id rule_id,p.method,p.value_units FROM manual_services s
  LEFT JOIN ${table} p ON p.subscriber_id=s.subscriber_id AND p.service_id=s.id AND p.${column}=$2
  WHERE s.subscriber_id=$1 AND ($3::text IS NULL OR s.name ILIKE $3)
  ORDER BY s.display_order,s.name,s.id LIMIT 31 OFFSET $4`,[sub,target,search,(q.page-1)*30])).rows;
 const data=[];for(const r of rows.slice(0,30)){
  const rule=r.rule_id?{id:r.rule_id,method:r.method,value:ruleValue(r)}:null;
  const price=customer?(await effectivePrice(sub,target,r,db)).view.effectivePriceUsd:basePrice(r.selling_price_usd_units,group?.is_active&&rule?r:null).text;
  data.push({serviceId:r.id,serviceName:r.name,serviceType:r.service_type,active:r.active,standardPriceUsd:usdText(r.selling_price_usd_units),effectivePriceUsd:price,rule});
 }return {data,page:q.page,hasMore:rows.length>30};
}
