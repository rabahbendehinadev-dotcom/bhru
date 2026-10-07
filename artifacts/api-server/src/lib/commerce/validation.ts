import { z } from '@workspace/api-zod';
import { HttpError } from '../auth';

export const uuid=z.string().uuid();
const text=(max:number)=>z.string().trim().max(max).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/,'Unsupported characters');
const slug=text(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const money=z.string().regex(/^\d{1,10}(?:\.\d{1,12})?$/,'Use a USD amount with at most twelve decimal places');
export function minor(value:string):bigint {
  const [whole,fraction='']=value.split('.');
  const result=BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));
  if(result>999999999999n) throw new HttpError(400,'Price is too large.');
  return result;
}
export const categoryInput=z.object({id:uuid.optional(),name:text(160).min(1),slug,description:text(2000),image_id:uuid.nullable(),enabled:z.boolean(),sort_order:z.number().int().min(0).max(100000)}).strict();
export const productInput=z.object({
  id:uuid.optional(),name:text(160).min(1),slug,short_description:text(500),description:text(10000),
  category_id:uuid.nullable(),sku:text(100),price:money,compare_at:money.nullable(),
  active:z.boolean(),featured:z.boolean(),in_stock:z.boolean(),
  stock_quantity:z.number().int().min(0).max(1000000).nullable(),sort_order:z.number().int().min(0).max(100000),
  image_ids:uuid.array().max(8).refine(ids=>new Set(ids).size===ids.length,'Duplicate image'),
}).strict();
export const settingsInput=z.object({
  enabled:z.boolean(),title:text(120).min(1),currency:z.enum(['DZD','USD','EUR','GBP','MAD','TND']),
  featured_first:z.boolean(),email_mode:z.enum(['hidden','optional','required']),address_mode:z.enum(['hidden','optional','required']),
  show_state:z.boolean(),show_city:z.boolean(),show_note:z.boolean(),
  whatsapp:text(25).refine(v=>!v||/^\+?[0-9]{7,20}$/.test(v),'Use an international phone number'),
  confirmation_message:text(500),
}).strict();
export const statusInput=z.object({id:uuid,status:z.enum(['new','confirmed','processing','completed','cancelled'])}).strict();
export const linesInput=z.object({items:z.object({product_id:uuid,quantity:z.number().int().min(1).max(99)}).strict().array().min(1).max(50),currency:z.string().regex(/^[A-Z]{3}$/).optional()}).strict();
export const orderInput=linesInput.extend({
  checkout_key:uuid,customer_name:text(160).min(2),phone:text(25).regex(/^\+?[0-9 ()-]{7,25}$/),
  email:text(254).default(''),state:text(120).default(''),city:text(120).default(''),
  address:text(500).default(''),note:text(1000).default(''),
  currency_rate:z.string().regex(/^\d{1,9}(?:\.\d{1,6})?$/).optional(),
}).strict();
// Validate source defaults at initialization; persisted registration defaults are checked against these in focused tests.
export const DEFAULT_STORE=settingsInput.parse({enabled:false,title:'Our Products',currency:'USD',featured_first:true,email_mode:'optional',address_mode:'optional',show_state:true,show_city:true,show_note:true,whatsapp:'',confirmation_message:'Thank you. Your order has been received.'});
export type StoreSettings=typeof DEFAULT_STORE & {subscriber_id?:string;money_model_version?:number};
export const PAGE_SIZE=24;
