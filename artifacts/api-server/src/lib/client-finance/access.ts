import type {PoolClient} from '@workspace/db';
import {z} from '@workspace/api-zod';
import {HttpError} from '../auth';
import {pricingLock} from './pricing';
import {groupRow} from './groups';
import {activityContext} from '../customer-auth/activity';

export async function resolveCustomerServiceAccess(sub:string,customer:string,service:string,db:PoolClient){
 await pricingLock(sub,db);
 const r=(await db.query('SELECT * FROM resolve_client_service_access($1,$2,NULL,$3)',[sub,customer,service])).rows[0];
 return {allowed:r.allowed,reasonCode:r.reason_code,source:r.source,matchedPolicyId:r.matched_policy_id};
}
export async function requireCustomerServiceAccess(sub:string,customer:string,service:string,db:PoolClient){
 const result=await resolveCustomerServiceAccess(sub,customer,service,db);
 if(!result.allowed)throw new HttpError(404,'Service not found or unavailable.');
 return result;
}
const query=z.object({targetType:z.enum(['SERVICE','CATEGORY']).default('SERVICE'),page:z.coerce.number().int().min(1).max(100000).default(1),
 search:z.string().trim().max(100).optional(),categoryId:z.string().uuid().optional(),serviceType:z.enum(['imei','server','file','remote']).optional()}).strict();
export const accessInput=z.object({targetType:z.enum(['SERVICE','CATEGORY']),targetIds:z.array(z.string().uuid()).min(1).max(50),
 effect:z.enum(['INHERIT','ALLOW','DENY'])}).strict().refine(v=>new Set(v.targetIds).size===v.targetIds.length,'Duplicate targets are not allowed.');
async function subject(sub:string,id:string,customer:boolean,db:PoolClient){
 if(!customer){const g=await groupRow(sub,id,db);return {id:g.id,name:g.name,active:g.is_active};}
 const c=(await db.query(`SELECT c.id,g.id group_id,g.name,g.is_active FROM public_customer_accounts c
  LEFT JOIN reseller_client_groups g ON g.subscriber_id=c.subscriber_id AND g.id=c.client_group_id
  WHERE c.subscriber_id=$1 AND c.id=$2`,[sub,id])).rows[0];
 if(!c)throw new HttpError(404,'Client not found.');
 return c.group_id?{id:c.group_id,name:c.name,active:c.is_active}:null;
}
export async function updateAccess(sub:string,id:string,customer:boolean,raw:unknown,actor:string,db:PoolClient){
 const v=accessInput.parse(raw);await pricingLock(sub,db,true);await subject(sub,id,customer,db);
 const category=v.targetType==='CATEGORY',target=category?'manual_service_groups':'manual_services';
 if((await db.query(`SELECT id FROM ${target} WHERE subscriber_id=$1 AND id=ANY($2::uuid[])`,[sub,v.targetIds])).rowCount!==v.targetIds.length)
  throw new HttpError(404,'One or more targets do not belong to this subscriber. No changes applied.');
 await db.query("SELECT set_config('bhru.service_access_actor',$1,true)",[actor]);
 if(customer)await activityContext(db,sub,id,{type:'subscriber_owner',id:actor});
 const table=`${customer?'customer':'client_group'}_${category?'category':'service'}_access`,column=customer?'customer_id':'group_id',targetColumn=category?'category_id':'service_id';
 for(const key of v.targetIds){
  if(v.effect==='INHERIT')await db.query(`DELETE FROM ${table} WHERE subscriber_id=$1 AND ${column}=$2 AND ${targetColumn}=$3`,[sub,id,key]);
  else await db.query(`INSERT INTO ${table}(subscriber_id,${column},${targetColumn},effect) VALUES($1,$2,$3,$4)
   ON CONFLICT(subscriber_id,${column},${targetColumn}) DO UPDATE SET effect=excluded.effect,updated_at=now()
   WHERE ${table}.effect IS DISTINCT FROM excluded.effect`,[sub,id,key,v.effect]);
 }
 return {ok:true};
}
export async function listAccess(sub:string,id:string,customer:boolean,raw:unknown,db:PoolClient){
 const q=query.parse(raw);await pricingLock(sub,db);const group=await subject(sub,id,customer,db);
 const category=q.targetType==='CATEGORY',table=`${customer?'customer':'client_group'}_${category?'category':'service'}_access`,
  column=customer?'customer_id':'group_id',targetColumn=category?'category_id':'service_id';
 const search=q.search?`%${q.search.replace(/[\\%_]/g,'\\$&')}%`:null;
 const rows=(await db.query(category?
  `SELECT c.id,c.name,c.enabled globally_available,NULL::uuid category_id,NULL::text category_name,NULL::text service_type,p.id policy_id,p.effect policy_effect
   FROM manual_service_groups c LEFT JOIN ${table} p ON p.subscriber_id=c.subscriber_id AND p.${column}=$2 AND p.${targetColumn}=c.id
   WHERE c.subscriber_id=$1 AND($3::text IS NULL OR c.name ILIKE $3)
   AND($4::uuid IS NULL OR c.id=$4) AND($5::text IS NULL OR EXISTS(SELECT 1 FROM manual_services s WHERE s.subscriber_id=c.subscriber_id AND s.group_id=c.id AND s.service_type=$5))
   ORDER BY c.name,c.id LIMIT 31 OFFSET $6`:
  `SELECT s.id,s.name,(s.active AND coalesce(c.enabled,true)) globally_available,s.group_id category_id,c.name category_name,s.service_type,p.id policy_id,p.effect policy_effect
   FROM manual_services s LEFT JOIN manual_service_groups c ON c.subscriber_id=s.subscriber_id AND c.id=s.group_id
   LEFT JOIN ${table} p ON p.subscriber_id=s.subscriber_id AND p.${column}=$2 AND p.${targetColumn}=s.id
   WHERE s.subscriber_id=$1 AND($3::text IS NULL OR s.name ILIKE $3 OR s.description ILIKE $3)
   AND($4::uuid IS NULL OR s.group_id=$4) AND($5::text IS NULL OR s.service_type=$5)
   ORDER BY s.display_order,s.name,s.id LIMIT 31 OFFSET $6`,[sub,id,search,q.categoryId??null,q.serviceType??null,(q.page-1)*30])).rows;
 const data=[];
 for(const r of rows.slice(0,30)){
  const resolverArgs=[sub,customer?id:null,customer?null:id,r.id];
  const access=category?(await db.query(`SELECT coalesce(bool_or(a.allowed),false) allowed FROM manual_services s
   CROSS JOIN LATERAL resolve_client_service_access($1,$2,$3,s.id) a WHERE s.subscriber_id=$1 AND s.group_id=$4`,resolverArgs)).rows[0]:
   (await db.query('SELECT * FROM resolve_client_service_access($1,$2,$3,$4)',resolverArgs)).rows[0];
  const inherited=customer&&group?(await db.query(category?
   'SELECT id,effect FROM client_group_category_access WHERE subscriber_id=$1 AND group_id=$2 AND category_id=$3':
   `SELECT id,effect FROM (
    SELECT id,effect,0 priority FROM client_group_service_access WHERE subscriber_id=$1 AND group_id=$2 AND service_id=$3
    UNION ALL SELECT id,effect,1 priority FROM client_group_category_access WHERE subscriber_id=$1 AND group_id=$2 AND category_id=$4
   ) policies ORDER BY priority LIMIT 1`,category?[sub,group.id,r.id]:[sub,group.id,r.id,r.category_id])).rows[0]:null;
  const priced=(await db.query(`SELECT EXISTS(SELECT 1 FROM client_group_service_prices p JOIN manual_services s ON s.subscriber_id=p.subscriber_id AND s.id=p.service_id
    WHERE p.subscriber_id=$1 AND p.group_id=$2 AND ${category?'s.group_id':'s.id'}=$3)
    OR EXISTS(SELECT 1 FROM customer_service_prices p JOIN manual_services s ON s.subscriber_id=p.subscriber_id AND s.id=p.service_id
    WHERE p.subscriber_id=$1 AND p.customer_id=$4 AND ${category?'s.group_id':'s.id'}=$3) present`,[sub,group?.id??null,r.id,customer?id:null])).rows[0].present;
  data.push({id:r.id,name:r.name,categoryId:r.category_id,categoryName:r.category_name,serviceType:r.service_type,
   globallyAvailable:r.globally_available,policy:r.policy_id?{id:r.policy_id,effect:r.policy_effect}:null,
   groupPolicy:inherited?{id:inherited.id,effect:inherited.effect}:null,hasPricingRule:priced,
   effective:{allowed:access.allowed,reasonCode:category?(access.allowed?'CATEGORY_HAS_ACCESSIBLE_SERVICES':'NO_ACCESSIBLE_SERVICES'):access.reason_code,
    source:category?'CATEGORY_SUMMARY':access.source,matchedPolicyId:category?null:access.matched_policy_id}});
 }
 return {data,page:q.page,hasMore:rows.length>30,currentGroup:group,
  categories:(await db.query('SELECT id,name,enabled FROM manual_service_groups WHERE subscriber_id=$1 ORDER BY name,id',[sub])).rows};
}
