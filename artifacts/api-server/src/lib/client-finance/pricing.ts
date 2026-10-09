import type {PoolClient} from '@workspace/db';
import {HttpError} from '../auth';
import {z} from '@workspace/api-zod';
import {parseUsd} from '../commerce/currency-money';
import {usdText,accountPrice,money,displayCurrency} from './wallet';

export async function pricingLock(sub:string,db:PoolClient,write=false){
  await db.query(`SELECT pg_advisory_xact_lock${write?'':'_shared'}(hashtextextended('bhru-client-pricing:'||$1,0))`,[sub]);
}
export const pricingInput=z.object({method:z.enum(['INHERIT_DEFAULT','FIXED_PRICE','PERCENT_DISCOUNT','PERCENT_MARKUP']),value:z.string().trim().max(32).optional()}).strict();
export function ruleUnits(raw:unknown){
  const input=pricingInput.parse(raw);
  if(input.method==='INHERIT_DEFAULT')return {...input,units:null};
  if(!input.value)throw new HttpError(400,'Enter a fixed USD price or percentage.');
  let units:bigint;
  if(input.method==='FIXED_PRICE'){
    if(!/^\d{1,10}(?:\.\d{1,12})?$/.test(input.value))throw new HttpError(400,'Enter a positive USD price with at most 12 decimals.');
    units=parseUsd(input.value);
    if(units<=0n)throw new HttpError(400,'Service prices must remain positive.');
  }else{
    if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(input.value))throw new HttpError(400,'Percentages support at most two decimals.');
    const [whole,fraction='']=input.value.split('.');
    units=BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));
    if(units>(input.method==='PERCENT_DISCOUNT'?9999n:1000000n))throw new HttpError(400,'Discount must be below 100%; markup must not exceed 10000%.');
  }
  return {...input,units};
}
export function ruleValue(rule:Record<string,any>){
  return rule.method==='FIXED_PRICE'?usdText(rule.value_units):`${BigInt(rule.value_units)/100n}.${(BigInt(rule.value_units)%100n).toString().padStart(2,'0')}`;
}
export function basePrice(standard:string,rule?:Record<string,any>|null){
  const units=BigInt(standard);
  const numerator=!rule?units:rule.method==='FIXED_PRICE'?BigInt(rule.value_units):units*(rule.method==='PERCENT_DISCOUNT'?10000n-BigInt(rule.value_units):10000n+BigInt(rule.value_units));
  const denominator=rule&&rule.method!=='FIXED_PRICE'?10000n:1n;
  // Exact decimal for presentation, including sub-USD-unit percentage fractions.
  const scaled=numerator*(10000n/denominator),divisor=10n**16n;
  const fraction=(scaled%divisor).toString().padStart(16,'0').replace(/0+$/,'');
  return {numerator,denominator,text:`${scaled/divisor}${fraction?'.'+fraction:''}`,units:((numerator+denominator/2n)/denominator).toString()};
}
export async function effectivePrice(sub:string,customer:string,service:Record<string,any>,db:PoolClient,currency?:Awaited<ReturnType<typeof displayCurrency>>){
  await pricingLock(sub,db);
  const row=(await db.query(`SELECT c.client_group_id,g.name group_name,g.is_active,
   cr.id customer_rule_id,cr.method customer_method,cr.value_units customer_value,cr.updated_at customer_version,
   gr.id group_rule_id,gr.method group_method,gr.value_units group_value,gr.updated_at group_version
   FROM public_customer_accounts c
   LEFT JOIN reseller_client_groups g ON g.subscriber_id=c.subscriber_id AND g.id=c.client_group_id
   LEFT JOIN customer_service_prices cr ON cr.subscriber_id=c.subscriber_id AND cr.customer_id=c.id AND cr.service_id=$3
   LEFT JOIN client_group_service_prices gr ON gr.subscriber_id=c.subscriber_id AND gr.group_id=c.client_group_id AND gr.service_id=$3 AND g.is_active
   WHERE c.subscriber_id=$1 AND c.id=$2`,[sub,customer,service.id])).rows[0];
  if(!row||service.subscriber_id!==sub)throw new HttpError(404,'Client/service not found.');
  const source=row.customer_rule_id?'CUSTOMER':row.group_rule_id?'GROUP':'STANDARD',prefix=source==='CUSTOMER'?'customer':'group';
  const rule=source==='STANDARD'?null:{id:row[`${prefix}_rule_id`],method:row[`${prefix}_method`],value_units:row[`${prefix}_value`],version:row[`${prefix}_version`]};
  const base=basePrice(String(service.selling_price_usd_units),rule),c=currency??await displayCurrency(sub,customer,db);
  if(base.units==='0')throw new HttpError(400,'Effective price is below supported service-price precision.');
  const amount=accountPrice(base.numerator,c,base.denominator);
  const view={serviceId:service.id,standardPriceUsd:usdText(service.selling_price_usd_units),effectivePriceUsd:base.text,
    source,groupId:row.client_group_id,groupName:row.group_name??null,groupActive:row.is_active??null,
    ruleId:rule?.id??null,method:rule?.method??null,value:rule?ruleValue(rule):null,
    currency:c.code,rate:c.rate,priceUsdUnits:base.units,priceAccountUnits:amount.toString(),formattedTotal:money(amount,c)};
  return {view,currency:c,amount,snapshot:{...view,standardUsdUnits:String(service.selling_price_usd_units),
    effectiveNumerator:base.numerator.toString(),effectiveDenominator:base.denominator.toString(),ruleVersion:rule?.version??null}};
}
