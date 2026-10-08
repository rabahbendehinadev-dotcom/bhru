import { randomUUID } from 'node:crypto';
import { z } from '@workspace/api-zod';
import type { PoolClient } from '@workspace/db';
import { HttpError } from '../auth';
import { parseUsd } from '../commerce/currency-money';
import { registrationOptions } from '../customer-auth/profile';
import { displayCurrency, money, accountPrice, usdText } from './wallet';

const field=z.object({
  key:z.string().regex(/^[a-z][a-z0-9_]{0,31}$/).refine(k=>!['constructor','prototype'].includes(k),'Choose a different field key.'),
  label:z.string().trim().min(1).max(100),type:z.enum(['text','textarea','number','select','imei','reference']),
  required:z.boolean(),options:z.array(z.string().trim().min(1).max(100)).max(50).optional(),
}).strict().superRefine((f,ctx)=>{
  if(f.type==='select'&&(!f.options?.length||new Set(f.options).size!==f.options.length))ctx.addIssue({code:'custom',message:'Select fields need distinct choices.'});
  if(f.type!=='select'&&f.options?.length)ctx.addIssue({code:'custom',message:'Choices are only supported for select fields.'});
});
export const serviceInput=z.object({
  name:z.string().trim().min(1).max(160),serviceType:z.enum(['imei','server','file','remote']),
  groupId:z.string().uuid().nullable().default(null),description:z.string().trim().max(4000).default(''),
  priceUsd:z.string().trim().regex(/^\d{1,10}(?:\.\d{1,12})?$/),
  estimatedTime:z.string().trim().max(100).default(''),active:z.boolean(),
  displayOrder:z.number().int().min(0).max(100000),requirements:z.array(field).max(12),
}).strict().superRefine((s,ctx)=>{
  if(new Set(s.requirements.map(f=>f.key)).size!==s.requirements.length)ctx.addIssue({code:'custom',message:'Requirement keys must be unique.'});
});
export const catalogQuery=z.object({
  page:z.coerce.number().int().min(1).max(100000).default(1),search:z.string().trim().max(100).optional(),
  serviceType:z.enum(['imei','server','file','remote']).optional(),groupId:z.string().uuid().optional(),
  status:z.enum(['active','inactive']).optional(),currency:z.string().regex(/^[A-Z]{3}$/).optional(),
}).strict();
export async function serviceRow(sub:string,id:string,db:PoolClient,active=false,lock=false) {
  const row=(await db.query(`SELECT s.*,g.name group_name FROM manual_services s
    LEFT JOIN manual_service_groups g ON g.subscriber_id=s.subscriber_id AND g.id=s.group_id
    WHERE s.subscriber_id=$1 AND s.id=$2 ${active?'AND s.active':''} ${lock?'FOR SHARE OF s':''}`,[sub,id])).rows[0];
  if(!row)throw new HttpError(404,'Service not found or unavailable.');
  return row;
}
export function serviceView(row:Record<string,any>,currency?:Awaited<ReturnType<typeof displayCurrency>>) {
  return {id:row.id,name:row.name,serviceType:row.service_type,groupId:row.group_id,groupName:row.group_name??null,
    description:row.description,priceUsd:usdText(row.selling_price_usd_units),priceUsdUnits:String(row.selling_price_usd_units),
    formattedPrice:currency?money(accountPrice(row.selling_price_usd_units,currency),currency):`${usdText(row.selling_price_usd_units)} USD`,
    currency:currency?.code??'USD',estimatedTime:row.estimated_time,active:row.active,displayOrder:row.display_order,
    requirements:row.requirements,createdAt:row.created_at,updatedAt:row.updated_at};
}
export async function saveService(sub:string,id:string|undefined,raw:unknown,db:PoolClient) {
  const input=serviceInput.parse(raw),price=parseUsd(input.priceUsd);
  if(price<=0n)throw new HttpError(400,'Service price must be positive.');
  if(input.groupId&&!(await db.query('SELECT id FROM manual_service_groups WHERE subscriber_id=$1 AND id=$2',[sub,input.groupId])).rowCount)throw new HttpError(404,'Service group not found.');
  if(id)await serviceRow(sub,id,db);
  const key=id??randomUUID();
  if(id)await db.query(`UPDATE manual_services SET name=$3,service_type=$4,group_id=$5,description=$6,selling_price_usd_units=$7,
    estimated_time=$8,active=$9,display_order=$10,requirements=$11::jsonb,updated_at=now() WHERE subscriber_id=$1 AND id=$2`,
    [sub,key,input.name,input.serviceType,input.groupId,input.description,price.toString(),input.estimatedTime,input.active,input.displayOrder,JSON.stringify(input.requirements)]);
  else await db.query(`INSERT INTO manual_services(subscriber_id,id,name,service_type,group_id,description,selling_price_usd_units,estimated_time,active,display_order,requirements)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [sub,key,input.name,input.serviceType,input.groupId,input.description,price.toString(),input.estimatedTime,input.active,input.displayOrder,JSON.stringify(input.requirements)]);
  return serviceView(await serviceRow(sub,key,db));
}
export async function listServices(sub:string,raw:unknown,db:PoolClient,customer?:string) {
  const q=catalogQuery.parse(raw),search=q.search?`%${q.search.replace(/[\\%_]/g,'\\$&')}%`:null;
  const rows=(await db.query(`SELECT s.*,g.name group_name FROM manual_services s LEFT JOIN manual_service_groups g ON g.subscriber_id=s.subscriber_id AND g.id=s.group_id
    WHERE s.subscriber_id=$1 AND($2::text IS NULL OR s.name ILIKE $2 OR s.description ILIKE $2)
    AND($3::text IS NULL OR s.service_type=$3) AND($4::uuid IS NULL OR s.group_id=$4)
    AND($5::boolean IS NULL OR s.active=$5)
    ORDER BY s.display_order,s.name,s.id LIMIT 31 OFFSET $6`,
    [sub,search,q.serviceType??null,q.groupId??null,customer?true:q.status?q.status==='active':null,(q.page-1)*30])).rows;
  const options=await registrationOptions(sub,db),currency=customer?await displayCurrency(sub,customer,db,q.currency):undefined;
  return {data:rows.slice(0,30).map(r=>serviceView(r,currency)),page:q.page,hasMore:rows.length>30,
    groups:(await db.query('SELECT id,name FROM manual_service_groups WHERE subscriber_id=$1 ORDER BY name',[sub])).rows,
    currencies:customer?[{code:currency!.code,name:currency!.name}]:options.currencies,defaultCurrency:currency?.code??options.defaultCurrency};
}
export function validateServiceInputs(requirements:z.infer<typeof field>[],raw:Record<string,string>) {
  const known=new Set(requirements.map(f=>f.key)),out:Record<string,string>=Object.create(null);
  if(Object.keys(raw).some(k=>!known.has(k)))throw new HttpError(400,'Unknown service input.');
  for(const f of requirements) {
    const value=(raw[f.key]??'').trim(),max=f.type==='textarea'?4000:200;
    if(f.required&&!value)throw new HttpError(400,`${f.label} is required.`);
    if(value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new HttpError(400,`Enter a valid ${f.label}.`);
    if(value&&f.type==='select'&&!f.options?.includes(value))throw new HttpError(400,`Choose a configured ${f.label}.`);
    if(value&&f.type==='number'&&!/^-?\d{1,12}(?:\.\d{1,6})?$/.test(value))throw new HttpError(400,`Enter a valid ${f.label}.`);
    if(value&&f.type==='imei') {
      if(!/^\d{15}$/.test(value))throw new HttpError(400,'IMEI must contain 15 digits.');
      const sum=[...value].reduce((total,c,i)=>{let n=Number(c);if(i%2===1){n*=2;if(n>9)n-=9;}return total+n;},0);
      if(sum%10!==0)throw new HttpError(400,'IMEI checksum is invalid.');
    }
    out[f.key]=value;
  }
  return out;
}
