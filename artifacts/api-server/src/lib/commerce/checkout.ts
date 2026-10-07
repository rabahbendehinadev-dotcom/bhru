import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { z } from '@workspace/api-zod';
import type { PoolClient } from '@workspace/db';
import { HttpError } from '../auth';
import { publicImageUrl } from '../public-site/media';
import { linesInput, orderInput, type StoreSettings } from './validation';

export async function quote(id:string,input:z.infer<typeof linesInput>,currency:string,client:PoolClient,locking=false) {
  const ids=input.items.map(i=>i.product_id);
  if(new Set(ids).size!==ids.length)throw new HttpError(400,'Combine duplicate product lines.');
  const rows=(await client.query(`SELECT p.*,
    coalesce((SELECT a.storage_key FROM store_product_images i JOIN public_site_assets a ON a.id=i.asset_id AND a.subscriber_id=i.subscriber_id
    WHERE i.subscriber_id=p.subscriber_id AND i.product_id=p.id ORDER BY i.sort_order LIMIT 1),'') AS image_key
    FROM store_products p WHERE p.subscriber_id=$1 AND p.id=ANY($2::uuid[]) ORDER BY p.id ${locking?'FOR UPDATE OF p':''}`,[id,ids])).rows;
  const byId=new Map(rows.map(p=>[p.id,p]));
  let subtotal=0n;
  const items=input.items.flatMap(line=>{
    const p=byId.get(line.product_id);
    if(!p||!p.active||p.archived||!p.in_stock||p.stock_quantity===0) {
      if(!locking)return [];
      throw new HttpError(409,'A selected product is unavailable or has insufficient stock. Review your cart.');
    }
    if(locking&&p.stock_quantity!==null&&p.stock_quantity<line.quantity)throw new HttpError(409,'A selected product has insufficient stock. Review your cart.');
    const quantity=p.stock_quantity===null?line.quantity:Math.min(line.quantity,p.stock_quantity);
    const amount=BigInt(p.price_minor)*BigInt(quantity);
    subtotal+=amount;
    return [{product_id:p.id,product_name:p.name,sku:p.sku,unit_price_minor:String(p.price_minor),quantity,
      line_total_minor:amount.toString(),image_key:p.image_key,image_url:p.image_key?publicImageUrl(p.image_key.slice(0,36),p.image_key):''}];
  });
  return {items,subtotal_minor:subtotal.toString(),total_minor:subtotal.toString(),currency};
}
export async function createOrder(id:string,raw:unknown,settings:StoreSettings,client:PoolClient) {
  const input=orderInput.parse(raw);
  input.phone=input.phone.replace(/[ ()-]/g,'');
  if(!/^\+?\d{7,20}$/.test(input.phone))throw new HttpError(400,'Enter a valid phone number.');
  if(settings.email_mode==='hidden')input.email='';
  if(settings.address_mode==='hidden')input.address='';
  if(!settings.show_state)input.state='';
  if(!settings.show_city)input.city='';
  if(!settings.show_note)input.note='';
  if(settings.email_mode==='required'&&!input.email)throw new HttpError(400,'Email is required.');
  if(input.email&&!z.string().email().safeParse(input.email).success)throw new HttpError(400,'Enter a valid email.');
  if(settings.address_mode==='required'&&!input.address)throw new HttpError(400,'Address is required.');
  input.items.sort((a,b)=>a.product_id.localeCompare(b.product_id));
  const requestHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  // Serialize a retry key before stock is touched, including simultaneous POSTs.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[id,input.checkout_key]);
  const prior=(await client.query('SELECT reference,customer_name,total_minor,currency,status,request_hash FROM store_orders WHERE subscriber_id=$1 AND checkout_key=$2',[id,input.checkout_key])).rows[0];
  const receipt=(order:Record<string,unknown>)=>({
    reference:order.reference,customer_name:order.customer_name,total_minor:order.total_minor,currency:order.currency,status:order.status,
    confirmation_message:settings.confirmation_message,whatsapp:settings.whatsapp,
  });
  if(prior) {
    if(prior.request_hash!==requestHash)throw new HttpError(409,'This checkout was already submitted with different details. Start a new checkout.');
    return receipt(prior);
  }
  const priced=await quote(id,input,settings.currency,client,true);
  const orderId=randomUUID();
  const reference=`ORD-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${randomBytes(8).toString('hex').toUpperCase()}`;
  await client.query(`INSERT INTO store_orders(id,subscriber_id,reference,checkout_key,request_hash,customer_name,phone,email,state,city,address,note,subtotal_minor,total_minor,currency)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [orderId,id,reference,input.checkout_key,requestHash,input.customer_name,input.phone,input.email,input.state,input.city,input.address,input.note,priced.subtotal_minor,priced.total_minor,settings.currency]);
  for(const line of priced.items) {
    await client.query(`INSERT INTO store_order_items(id,subscriber_id,order_id,product_id,product_name,sku,image_key,unit_price_minor,quantity,line_total_minor)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [randomUUID(),id,orderId,line.product_id,line.product_name,line.sku,line.image_key,line.unit_price_minor,line.quantity,line.line_total_minor]);
    await client.query('UPDATE store_products SET stock_quantity=stock_quantity-$3,updated_at=now() WHERE subscriber_id=$1 AND id=$2 AND stock_quantity IS NOT NULL',[id,line.product_id,line.quantity]);
  }
  await client.query("INSERT INTO store_order_status_history(subscriber_id,order_id,status) VALUES($1,$2,'new')",[id,orderId]);
  return receipt({reference,customer_name:input.customer_name,total_minor:priced.total_minor,currency:settings.currency,status:'new'});
}
