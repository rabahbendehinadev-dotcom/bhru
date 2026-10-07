import { pool, type PoolClient } from '@workspace/db';
import { HttpError, requireUser, authorizeTenant } from '../auth';
import type { Request } from 'express';
import { getSubscriber } from '../platform';
import { adminPath } from '../admin-entry';
import { DEFAULT_STORE, PAGE_SIZE, type StoreSettings } from './validation';
import { previewImageUrl, publicImageUrl } from '../public-site/media';
type DB=Pick<PoolClient,'query'>;

export function subscriberContext(req:Request) {
  const user=requireUser(req);
  if(user.admin) throw new HttpError(403,'A subscriber account is required.');
  authorizeTenant(req,user.subscriber_id);
  return user;
}
export async function requireCommerce(id:string,client:DB=pool) {
  await client.query('SELECT id FROM subscriptions WHERE subscriber_id=$1 FOR SHARE',[id]);
  const sub=await getSubscriber(id,client as PoolClient);
  if(!sub?.allowed) throw new HttpError(403,'Store management is unavailable.');
  const row=(await client.query("SELECT enabled FROM subscriber_modules WHERE subscriber_id=$1 AND module_key='ecommerce' FOR SHARE",[id])).rows[0];
  if(!row?.enabled) throw new HttpError(403,'E-Commerce module is not enabled. Contact the platform administrator.');
}
export async function storeSettings(id:string,client:DB=pool):Promise<StoreSettings> {
  const row=(await client.query('SELECT * FROM store_settings WHERE subscriber_id=$1 FOR SHARE',[id])).rows[0];
  if(!row)throw new HttpError(503,'Store settings are unavailable. Apply the currency initialization migration.');
  return {...Object.fromEntries(Object.keys(DEFAULT_STORE).map(key=>[key,row[key]])),money_model_version:row.money_model_version} as StoreSettings;
}
export async function publicStore(slug:string,client:DB=pool) {
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>63) throw new HttpError(404,'Store not available.');
  const row=(await client.query(`SELECT s.id,s.public_slug FROM subscribers s JOIN subscriptions l ON l.subscriber_id=s.id
    JOIN subscriber_modules m ON m.subscriber_id=s.id AND m.module_key='ecommerce' AND m.enabled
    JOIN store_settings st ON st.subscriber_id=s.id AND st.enabled
    WHERE s.public_slug=$1 AND NOT public.bhru_slug_reserved($1,$2)
    AND l.status IN ('ACTIVE','TRIAL') AND l.expires_at>now() AND l.licence_key IS NOT NULL AND l.plan_id IS NOT NULL
    FOR SHARE OF s,l,m,st`,[slug,adminPath.slice(1)])).rows[0];
  if(!row) throw new HttpError(404,'Store not available.');
  return {id:row.id as string,settings:await storeSettings(row.id,client)};
}
export async function ownedAssets(id:string,assets:string[],client:DB) {
  if(!assets.length)return;
  const r=await client.query('SELECT id FROM public_site_assets WHERE subscriber_id=$1 AND id=ANY($2::uuid[])',[id,assets]);
  if(r.rowCount!==new Set(assets).size)throw new HttpError(400,'An image is not owned by this store.');
}
export async function categories(id:string,client:DB=pool,publicOnly=false) {
  const rows=(await client.query(`SELECT c.*,a.storage_key FROM store_categories c
    LEFT JOIN public_site_assets a ON a.id=c.image_id AND a.subscriber_id=c.subscriber_id
    WHERE c.subscriber_id=$1 ${publicOnly?'AND c.enabled':''} ORDER BY c.sort_order,c.name LIMIT 300`,[id])).rows;
  return rows.map(({storage_key,subscriber_id,...r})=>({...r,image_url:storage_key?(publicOnly?publicImageUrl:previewImageUrl)(r.image_id,storage_key):''}));
}
export async function products(id:string,client:DB=pool,options:{page?:number;search?:string;category?:string;slug?:string;productId?:string;publicOnly?:boolean;featuredFirst?:boolean}={}) {
  const params:unknown[]=[id];
  let where='p.subscriber_id=$1 AND NOT p.archived';
  if(options.publicOnly)where+=' AND p.active';
  for(const [value,column] of [[options.category,'p.category_id'],[options.slug,'p.slug'],[options.productId,'p.id']] as const) {
    if(value){params.push(value);where+=` AND ${column}=$${params.length}`;}
  }
  if(options.search){params.push(`%${options.search}%`);where+=` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`;}
  params.push(PAGE_SIZE+1,(Math.max(1,options.page??1)-1)*PAGE_SIZE);
  const rows=(await client.query(`SELECT p.*,coalesce((SELECT json_agg(json_build_object('id',a.id,'key',a.storage_key,'width',a.width,'height',a.height) ORDER BY i.sort_order)
    FROM store_product_images i JOIN public_site_assets a ON a.id=i.asset_id AND a.subscriber_id=i.subscriber_id
    WHERE i.subscriber_id=p.subscriber_id AND i.product_id=p.id),'[]'::json) AS images
    FROM store_products p WHERE ${where} ORDER BY ${options.featuredFirst?'p.featured DESC,':''}p.sort_order,p.created_at DESC
    LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows;
  const data=rows.slice(0,PAGE_SIZE).map(({subscriber_id,provider_cost_usd_units,...r})=>({...r,...(options.publicOnly?{}:{provider_cost_usd_units}),images:r.images.map((a:{id:string;key:string;width:number;height:number})=>({id:a.id,url:(options.publicOnly?publicImageUrl:previewImageUrl)(a.id,a.key),width:a.width,height:a.height}))}));
  return {data,page:options.page??1,has_more:rows.length>PAGE_SIZE};
}
export async function orderDetail(id:string,orderId:string,client:DB=pool) {
  const order=(await client.query('SELECT * FROM store_orders WHERE subscriber_id=$1 AND id=$2',[id,orderId])).rows[0];
  if(!order)throw new HttpError(404,'Order not found.');
  const items=(await client.query('SELECT * FROM store_order_items WHERE subscriber_id=$1 AND order_id=$2 ORDER BY id',[id,orderId])).rows.map(r=>({...r,image_url:r.image_key?previewImageUrl(r.image_key.slice(0,36),r.image_key):''}));
  const history=(await client.query('SELECT status,created_at FROM store_order_status_history WHERE subscriber_id=$1 AND order_id=$2 ORDER BY id',[id,orderId])).rows;
  return {...order,items,history};
}
export const COMMERCE_SAVED_REFERENCE=`(
 EXISTS(SELECT 1 FROM store_product_images i WHERE i.subscriber_id=a.subscriber_id AND i.asset_id=a.id)
 OR EXISTS(SELECT 1 FROM store_categories c WHERE c.subscriber_id=a.subscriber_id AND c.image_id=a.id)
 OR EXISTS(SELECT 1 FROM store_order_items o WHERE o.subscriber_id=a.subscriber_id AND o.image_key=a.storage_key)
)`;
export const COMMERCE_PUBLISHED_REFERENCE=`(
 EXISTS(SELECT 1 FROM subscriber_modules m JOIN store_settings st ON st.subscriber_id=m.subscriber_id
 WHERE m.subscriber_id=a.subscriber_id AND m.module_key='ecommerce' AND m.enabled AND st.enabled
 AND (EXISTS(SELECT 1 FROM store_product_images i JOIN store_products p ON p.id=i.product_id AND p.subscriber_id=i.subscriber_id
 WHERE i.subscriber_id=a.subscriber_id AND i.asset_id=a.id AND p.active AND NOT p.archived)
 OR EXISTS(SELECT 1 FROM store_categories c WHERE c.subscriber_id=a.subscriber_id AND c.image_id=a.id AND c.enabled)))
)`;
