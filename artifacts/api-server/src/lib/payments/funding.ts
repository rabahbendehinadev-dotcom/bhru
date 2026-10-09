import type {PoolClient} from '@workspace/db';
import {randomUUID} from 'node:crypto';
import {z} from '@workspace/api-zod';
import {HttpError} from '../auth';
import {lockClient,hashRequest,money} from '../client-finance/wallet';
import {parseUsd,formatCurrencyMinor} from '../commerce/currency-money';
import {activityContext} from '../customer-auth/activity';
import {fundingIntent,quoteFunding,fundingUnits} from './quote';
import {gateway} from './registry';
export const createFundingInput=fundingIntent.extend({idempotencyKey:z.string().uuid()}).strict();
export async function fundingRow(tenant:string,id:string,db:PoolClient,customer?:string,lock=false){
  const row=(await db.query(`SELECT * FROM payment_funding_requests WHERE subscriber_id=$1 AND id=$2
    ${customer?'AND customer_id=$3':''} ${lock?'FOR UPDATE':''}`,[tenant,id,...customer?[customer]:[]])).rows[0];
  if(!row)throw new HttpError(404,'Funding request not found.');return row;
}
export function quoteView(row:Record<string,any>){
  const s=row.snapshot,a=s.account,p=s.payment;
  return {accountCurrency:row.account_currency,paymentCurrency:row.payment_currency,requestedCreditUnits:String(row.requested_credit_units),
    paymentBaseMinor:String(row.payment_base_minor),feeMinor:String(row.fee_minor),expectedPaymentMinor:String(row.expected_payment_minor),
    formattedCredit:money(row.requested_credit_units,a),formattedBase:formatCurrencyMinor(row.payment_base_minor,p),
    formattedFee:formatCurrencyMinor(row.fee_minor,p),formattedPayable:formatCurrencyMinor(row.expected_payment_minor,p),fxDescription:s.fxDescription};
}
export async function fundingView(row:Record<string,any>,db:PoolClient,internal=false){
  const payments=(await db.query(`SELECT id,status,amount_minor,currency,provider_reference,created_at,settled_at
    FROM payment_transactions WHERE subscriber_id=$1 AND customer_id=$2 AND funding_request_id=$3 ORDER BY created_at,id`,
    [row.subscriber_id,row.customer_id,row.id])).rows;
  const customer=internal?(await db.query('SELECT concat_ws(\' \',first_name,last_name) name FROM public_customer_accounts WHERE subscriber_id=$1 AND id=$2',[row.subscriber_id,row.customer_id])).rows[0]?.name:null;
  return {...quoteView(row),id:row.id,gatewayCode:row.gateway_code,gatewayName:row.gateway_name_snapshot,
    paymentMethod:row.payment_method,customerName:customer??null,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,expiresAt:row.expires_at,
    payments:payments.map(p=>({id:p.id,status:p.status,amountMinor:String(p.amount_minor),formattedAmount:formatCurrencyMinor(p.amount_minor,row.snapshot.payment),currency:p.currency,
      providerReference:internal?p.provider_reference:null,createdAt:p.created_at,settledAt:p.settled_at}))};
}
export async function listFunding(tenant:string,db:PoolClient,customer?:string,rawPage:unknown='1'){
  const page=z.coerce.number().int().min(1).max(100000).parse(rawPage);
  const rows=(await db.query(`SELECT * FROM payment_funding_requests WHERE subscriber_id=$1 ${customer?'AND customer_id=$3':''}
    ORDER BY created_at DESC,id LIMIT 31 OFFSET $2`,[tenant,(page-1)*30,...customer?[customer]:[]])).rows;
  return {data:await Promise.all(rows.slice(0,30).map(r=>fundingView(r,db,!customer))),hasMore:rows.length>30};
}
export async function createFunding(tenant:string,customer:string,raw:unknown,db:PoolClient){
  const input=createFundingInput.parse(raw);await lockClient(tenant,customer,db,true);
  const intent={gatewayCode:input.gatewayCode,paymentMethod:input.paymentMethod,paymentCurrency:input.paymentCurrency,requestedCreditUnits:fundingUnits(input.amount).toString()};
  const hash=hashRequest(intent),existing=(await db.query('SELECT * FROM payment_funding_requests WHERE subscriber_id=$1 AND customer_id=$2 AND idempotency_key=$3',[tenant,customer,input.idempotencyKey])).rows[0];
  if(existing){if(existing.request_hash!==hash)throw new HttpError(409,'Idempotency key already belongs to a different funding request.');return fundingView(existing,db);}
  const {idempotencyKey:_key,...body}=input,q=await quoteFunding(tenant,customer,body,db),id=randomUUID();
  const row=(await db.query(`INSERT INTO payment_funding_requests
    (id,subscriber_id,customer_id,gateway_code,gateway_name_snapshot,payment_method,account_currency,payment_currency,
    requested_credit_units,payment_base_minor,fee_minor,expected_payment_minor,snapshot,idempotency_key,request_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15) RETURNING *`,
    [id,tenant,customer,input.gatewayCode,gateway(input.gatewayCode).displayName,input.paymentMethod,q.accountCurrency,q.paymentCurrency,
      q.requestedCreditUnits,q.paymentBaseMinor,q.feeMinor,q.expectedPaymentMinor,JSON.stringify(q.snapshot),input.idempotencyKey,hash])).rows[0];
  await activityContext(db,tenant,customer,{type:'customer',id:customer});
  await db.query(`SELECT emit_client_activity($1,$2,'funding_request_created','FINANCIAL','funding_request',$3,$4)`,[tenant,customer,id,`funding:${id}:created`]);
  return fundingView(row,db);
}
export async function cancelFunding(tenant:string,customer:string,id:string,db:PoolClient){
  await lockClient(tenant,customer,db,true);const row=await fundingRow(tenant,id,db,customer,true);
  if(row.status==='CANCELLED')return fundingView(row,db);
  if(!['CREATED','PENDING_PAYMENT'].includes(row.status))throw new HttpError(409,'Only unpaid funding can be cancelled.');
  if((await db.query("SELECT 1 FROM payment_transactions WHERE funding_request_id=$1 AND status IN ('VERIFIED','SETTLED')",[id])).rowCount)
    throw new HttpError(409,'Verified payment requires settlement or review, not cancellation.');
  const updated=(await db.query("UPDATE payment_funding_requests SET status='CANCELLED',updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];
  await activityContext(db,tenant,customer,{type:'customer',id:customer});
  await db.query("SELECT emit_client_activity($1,$2,'funding_request_cancelled','FINANCIAL','funding_request',$3,$4)",[tenant,customer,id,`funding:${id}:cancelled`]);
  return fundingView(updated,db);
}
