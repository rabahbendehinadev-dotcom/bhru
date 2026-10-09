import type {PoolClient} from '@workspace/db';
import {z} from '@workspace/api-zod';
import {HttpError} from '../auth';
import {currencies} from '../commerce/currencies';
import {parseUsd,rateUnits,RATE_FACTOR,MAX_MINOR,MAX_USD_UNITS,formatCurrencyMinor} from '../commerce/currency-money';
import {walletCurrency,walletRow,money} from '../client-finance/wallet';
import {gateway,operational} from './registry';
import {policy,gatewayView} from './catalog';
import {credentialStorageReady,decryptCredentials} from './credentials';
import {fundingUnits} from './decimal';
export {fundingUnits} from './decimal';
export const fundingIntent=z.object({
  gatewayCode:z.string().regex(/^[a-z][a-z0-9_]{1,50}$/),paymentMethod:z.string().min(1).max(80),
  amount:z.string().regex(/^\d{1,10}(?:\.\d{1,12})?$/),paymentCurrency:z.string().regex(/^[A-Z]{3}$/),
}).strict();
const ceil=(n:bigint,d:bigint)=>(n+d-1n)/d;
export async function eligibleGateways(tenant:string,id:string,db:PoolClient){
  if(!credentialStorageReady())return {credentialStorageReady:false,data:[]};
  const rows=(await db.query(`SELECT c.*,p.global_enabled,p.reseller_available FROM reseller_payment_gateways c
    JOIN payment_gateway_policies p USING(gateway_code) WHERE c.subscriber_id=$1 AND c.enabled AND p.global_enabled AND p.reseller_available`,[tenant])).rows;
  const configured=await currencies(tenant,db),w=await walletRow(tenant,id,db),account=walletCurrency(configured,w.accounting_currency);
  return {credentialStorageReady:true,data:rows.flatMap(c=>{
    const d=gateway(c.gateway_code);if(d.integrationStatus!=='AVAILABLE'||!d.adapter||c.validation_status!=='VALID')return [];
    const rules=c.currency_rules.filter((r:{currency:string})=>{
      const p=configured.find(p=>p.code===r.currency&&p.enabled&&d.supportedCurrencies.includes(p.code));
      return p&&(p.code===account.code||(account.usd_basis_configured&&account.rate_configured!==false&&p.rate_configured!==false));
    });
    if(!rules.length)return [];
    const view=gatewayView(d.code,c,{...c,currency_rules:rules});
    // Customer projection never publishes credential field state.
    return [{...view,configuredCredentialFields:[],requiredCredentials:[],configurationFields:[]}];
  })};
}
export async function quoteFunding(tenant:string,id:string,raw:unknown,db:PoolClient){
  const input=fundingIntent.parse(raw),d=operational(gateway(input.gatewayCode)),p=await policy(d.code,db,true);
  if(!credentialStorageReady())throw new HttpError(503,'Gateway credential storage is not configured.');
  const config=(await db.query('SELECT * FROM reseller_payment_gateways WHERE subscriber_id=$1 AND gateway_code=$2 FOR SHARE',[tenant,d.code])).rows[0];
  if(!p.global_enabled||!p.reseller_available||!config?.enabled||config.validation_status!=='VALID')throw new HttpError(409,'Gateway is not ready for funding.');
  if(!d.supportedMethods.includes(input.paymentMethod))throw new HttpError(400,'Payment method is not supported.');
  const rows=await currencies(tenant,db),w=await walletRow(tenant,id,db),a=walletCurrency(rows,w.accounting_currency);
  const c=rows.find(c=>c.code===input.paymentCurrency&&c.enabled&&d.supportedCurrencies.includes(c.code));
  const rule=config.currency_rules.find((r:{currency:string})=>r.currency===input.paymentCurrency);
  if(!c||!rule)throw new HttpError(400,'Payment currency is not eligible.');
  const credit=fundingUnits(input.amount),aq=10n**BigInt(12-a.decimals),pq=10n**BigInt(12-c.decimals);
  if(credit<=0n||credit%aq)throw new HttpError(400,'Use a positive amount at account-currency precision.');
  const refundable=(await db.query("SELECT coalesce(sum(price_account_units),0)::text amount FROM service_orders WHERE subscriber_id=$1 AND customer_id=$2 AND status IN ('pending','processing')",[tenant,id])).rows[0].amount;
  if(BigInt(w.available_balance)+BigInt(refundable)+credit>MAX_USD_UNITS)throw new HttpError(400,'Funding would exceed the safe wallet limit including refundable orders.');
  const cross=a.code!==c.code;
  if(cross&&(!a.usd_basis_configured||a.rate_configured===false||c.rate_configured===false))throw new HttpError(409,'Verified USD-based manual rates are required for cross-currency funding.');
  const ar=cross?rateUnits(a.rate):RATE_FACTOR,pr=cross?rateUnits(c.rate):RATE_FACTOR;
  if(ar<=0n||pr<=0n)throw new HttpError(409,'Funding exchange rates are unavailable.');
  const base=ceil(credit*pr,ar*pq),fixed=parseUsd(rule.fixedFee)/pq;
  const fee=ceil(base*BigInt(rule.feeBps),10000n)+fixed,total=base+fee;
  if(total>MAX_MINOR||total*pq<parseUsd(rule.minimum)||total*pq>parseUsd(rule.maximum))throw new HttpError(400,'Total payable is outside gateway funding limits.');
  const fxDescription=cross?`USD manual basis: ${a.rate} ${a.code} / ${c.rate} ${c.code}; payment rounded up to minor units`:'Same currency — no conversion';
  let merchantScope:string;
  try{merchantScope=await d.adapter!.merchantScope(decryptCredentials(tenant,d.code,config.credentials_encrypted));}
  catch{throw new HttpError(503,'Gateway merchant configuration is unavailable.');}
  if(!merchantScope||merchantScope.length>180)throw new HttpError(503,'Gateway merchant configuration is invalid.');
  const snapshot={account:a,payment:c,merchantScope,accountRate:ar.toString(),paymentRate:pr.toString(),rateScale:RATE_FACTOR.toString(),
    rounding:'CEILING_TO_PAYMENT_MINOR',mode:cross?'USD_MANUAL_CROSS':'SAME_CURRENCY',
    feeBps:rule.feeBps,fixedFeeMinor:fixed.toString(),configurationRevision:config.revision,fxDescription};
  return {input,snapshot,accountCurrency:a.code,paymentCurrency:c.code,requestedCreditUnits:credit.toString(),
    paymentBaseMinor:base.toString(),feeMinor:fee.toString(),expectedPaymentMinor:total.toString(),
    formattedCredit:money(credit,a),formattedBase:formatCurrencyMinor(base,c),formattedFee:formatCurrencyMinor(fee,c),
    formattedPayable:formatCurrencyMinor(total,c),fxDescription};
}
