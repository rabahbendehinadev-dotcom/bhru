import { randomUUID, randomBytes } from 'node:crypto';
import { z } from '@workspace/api-zod';
import type { PoolClient } from '@workspace/db';
import { HttpError } from '../auth';
import { lockClient, walletRow, displayCurrency, money, accountPrice, hashRequest, appendMovement, audit } from './wallet';
import { activityContext } from '../customer-auth/activity';
import { serviceRow, serviceView, validateServiceInputs } from './catalog';
import {pricingLock,effectivePrice} from './pricing';

export const orderQuery=z.object({
  page:z.coerce.number().int().min(1).max(100000).default(1),search:z.string().trim().max(100).optional(),
  customerId:z.string().uuid().optional(),serviceType:z.enum(['imei','server','file','remote']).optional(),
  status:z.enum(['pending','processing','completed','rejected','cancelled']).optional(),
}).strict();
export async function orderRow(sub:string,id:string,db:PoolClient,customer?:string,lock=false) {
  const row=(await db.query(`SELECT o.*,concat_ws(' ',c.first_name,c.last_name) client_name,c.client_code FROM service_orders o
    JOIN public_customer_accounts c ON c.subscriber_id=o.subscriber_id AND c.id=o.customer_id
    WHERE o.subscriber_id=$1 AND o.id=$2 AND($3::uuid IS NULL OR o.customer_id=$3) ${lock?'FOR UPDATE OF o':''}`,[sub,id,customer??null])).rows[0];
  if(!row)throw new HttpError(404,'Service order not found.');
  return row;
}
export function orderView(row:Record<string,any>,internal=false) {
  const currency=row.account_currency_snapshot;
  return {
    id:row.id,reference:row.reference,serviceId:row.service_id,customerId:row.customer_id,
    serviceName:row.service_name_snapshot,serviceType:row.service_type,status:row.status,
    priceUsdUnits:String(row.price_usd_units),priceAccountUnits:String(row.price_account_units),currency:currency.code,amountFormatted:money(row.price_account_units,currency),
    customerInput:row.customer_input_snapshot,result:row.result,rejectionReason:row.rejection_reason,
    createdAt:row.created_at,updatedAt:row.updated_at,completedAt:row.completed_at,rejectedAt:row.rejected_at,
    ...(internal?{pricingSnapshot:row.pricing_snapshot??null}:{}),
    ...(internal?{clientName:row.client_name,clientCode:row.client_code,internalNote:row.internal_note}:{}),
  };
}
export async function orderSummary(sub:string,db:PoolClient,customer?:string) {
  const rows=(await db.query(`SELECT status,service_type,count(*)::int n FROM service_orders
    WHERE subscriber_id=$1 AND($2::uuid IS NULL OR customer_id=$2) GROUP BY status,service_type`,[sub,customer??null])).rows;
  const summary={totalOrders:0,pending:0,processing:0,completed:0,rejected:0,cancelled:0,byType:{imei:0,server:0,file:0,remote:0}};
  for(const row of rows) {
    summary.totalOrders+=row.n;
    summary[row.status as 'pending']+=row.n;
    summary.byType[row.service_type as 'imei']+=row.n;
  }
  return summary;
}
export async function listOrders(sub:string,raw:unknown,db:PoolClient,customer?:string) {
  const q=orderQuery.parse(raw);
  if(customer&&q.customerId&&q.customerId!==customer)throw new HttpError(403,'Cannot access another client.');
  const id=customer??q.customerId,search=q.search?`%${q.search.replace(/[\\%_]/g,'\\$&')}%`:null;
  const rows=(await db.query(`SELECT o.*,concat_ws(' ',c.first_name,c.last_name) client_name,c.client_code FROM service_orders o
    JOIN public_customer_accounts c ON c.subscriber_id=o.subscriber_id AND c.id=o.customer_id
    WHERE o.subscriber_id=$1 AND($2::uuid IS NULL OR o.customer_id=$2)
    AND($3::text IS NULL OR o.status=$3) AND($4::text IS NULL OR o.service_type=$4)
    AND($5::text IS NULL OR o.reference ILIKE $5 OR o.service_name_snapshot ILIKE $5 OR c.client_code ILIKE $5 OR concat_ws(' ',c.first_name,c.last_name) ILIKE $5)
    ORDER BY o.created_at DESC,o.id LIMIT 31 OFFSET $6`,
    [sub,id??null,q.status??null,q.serviceType??null,search,(q.page-1)*30])).rows;
  return {data:rows.slice(0,30).map(r=>orderView(r,!customer)),page:q.page,hasMore:rows.length>30,summary:await orderSummary(sub,db,id)};
}
export const quoteInput=z.object({serviceId:z.string().uuid(),currency:z.string().regex(/^[A-Z]{3}$/).optional()}).strict();
export async function quoteService(sub:string,customer:string,raw:unknown,db:PoolClient) {
  await pricingLock(sub,db);
  const q=quoteInput.parse(raw),service=await serviceRow(sub,q.serviceId,db,true);
  const currency=await displayCurrency(sub,customer,db,q.currency),wallet=await walletRow(sub,customer,db);
  const price=await effectivePrice(sub,customer,service,db,currency),amount=price.amount,balance=BigInt(wallet.available_balance),missing=amount>balance?amount-balance:0n;
  return {service:serviceView(service,currency,price.view),priceUsdUnits:price.view.priceUsdUnits,priceAccountUnits:amount.toString(),formattedTotal:money(amount,currency),
    currency:currency.code,formattedBalance:money(balance,currency),formattedMissing:money(missing,currency),sufficient:balance>=amount};
}
export class InsufficientBalance extends HttpError {
  constructor(public details:Record<string,unknown>) {super(409,'INSUFFICIENT_BALANCE');}
}
export const purchaseInput=quoteInput.extend({
  idempotencyKey:z.string().uuid(),inputs:z.record(z.string(),z.string().max(4000)),
  expectedPriceUsdUnits:z.string().regex(/^\d{1,24}$/),
  expectedPriceAccountUnits:z.string().regex(/^\d{1,24}$/).optional(),
}).strict();
export async function purchaseService(sub:string,customer:string,raw:unknown,db:PoolClient) {
  await pricingLock(sub,db);
  const input=purchaseInput.parse(raw);
  const normalized={...input,inputs:Object.fromEntries(Object.entries(input.inputs).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,v.trim()]))};
  const hash=hashRequest(normalized);
  await lockClient(sub,customer,db,true);await walletRow(sub,customer,db,true);
  const existing=(await db.query('SELECT id,request_hash FROM service_orders WHERE subscriber_id=$1 AND customer_id=$2 AND idempotency_key=$3',[sub,customer,input.idempotencyKey])).rows[0];
  if(existing) {
    if(existing.request_hash!==hash)throw new HttpError(409,'Idempotency key was used for a different order.');
    return orderView(await orderRow(sub,existing.id,db,customer));
  }
  const service=await serviceRow(sub,input.serviceId,db,true,true);
  const values=validateServiceInputs(service.requirements,input.inputs),currency=await displayCurrency(sub,customer,db,input.currency);
  const price=await effectivePrice(sub,customer,service,db,currency),amount=price.amount;
  if(BigInt(input.expectedPriceUsdUnits)!==BigInt(price.view.priceUsdUnits))throw new HttpError(409,'PRICE_CHANGED: refresh the server quote before ordering.');
  if(currency.code!=='USD'&&!input.expectedPriceAccountUnits)throw new HttpError(400,'Refresh the server quote to confirm the account-currency total.');
  if(input.expectedPriceAccountUnits&&BigInt(input.expectedPriceAccountUnits)!==amount)throw new HttpError(409,'PRICE_CHANGED: refresh the server quote before ordering.');
  const wallet=await walletRow(sub,customer,db,true),balance=BigInt(wallet.available_balance);
  if(balance<amount)throw new InsufficientBalance({formattedBalance:money(balance,currency),formattedTotal:money(amount,currency),formattedMissing:money(amount-balance,currency),currency:currency.code});
  const id=randomUUID(),debit=randomUUID();
  await activityContext(db,sub,customer,{type:'customer',id:customer});
  await db.query(`INSERT INTO service_orders(id,reference,subscriber_id,customer_id,service_id,service_type,customer_input_snapshot,
    service_name_snapshot,price_usd_units,currency_snapshot,wallet_debit_reference,idempotency_key,request_hash,
    price_account_units,account_currency_snapshot,pricing_snapshot,pricing_group_id)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17)`,
    [id,`SO-${randomBytes(8).toString('hex').toUpperCase()}`,sub,customer,service.id,service.service_type,
      JSON.stringify(values),service.name,price.view.priceUsdUnits,JSON.stringify(currency),debit,input.idempotencyKey,hash,
      amount.toString(),JSON.stringify(currency),JSON.stringify(price.snapshot),price.view.groupId]);
  await appendMovement(sub,customer,{id:debit,type:'order_debit',direction:'debit',amount,currency,
    description:`Service order: ${service.name}`,actorType:'customer',actor:customer,referenceId:id,
    key:input.idempotencyKey,hash,sourceUsdUnits:price.view.priceUsdUnits},db);
  await audit(sub,customer,'service_order_placed',null,db);
  return orderView(await orderRow(sub,id,db,customer));
}
export const transitionInput=z.object({
  status:z.enum(['processing','completed','rejected']),result:z.string().trim().max(4000).default(''),
  reason:z.string().trim().max(1000).default(''),internalNote:z.string().trim().max(2000).optional(),
}).strict();
export async function transitionOrder(sub:string,id:string,raw:unknown,actor:string,db:PoolClient) {
  const input=transitionInput.parse(raw),prior=await orderRow(sub,id,db);
  await lockClient(sub,prior.customer_id,db);
  const order=await orderRow(sub,id,db,undefined,true);
  if(order.status===input.status)return orderView(order,true);
  if(!['pending','processing'].includes(order.status)||order.status==='processing'&&input.status==='processing')throw new HttpError(409,'This order is terminal or the status transition is not allowed.');
  if(input.status==='completed'&&!input.result)throw new HttpError(400,'A completion result/response is required.');
  if(input.status==='rejected'&&!input.reason)throw new HttpError(400,'A rejection reason is required.');
  await activityContext(db,sub,order.customer_id,{type:'subscriber_owner',id:actor});
  if(input.status==='rejected') {
    const debit=(await db.query('SELECT * FROM customer_wallet_ledger WHERE subscriber_id=$1 AND customer_id=$2 AND id=$3 AND type=$4',[sub,order.customer_id,order.wallet_debit_reference,'order_debit'])).rows[0];
    if(!debit)throw new HttpError(409,'Original wallet charge was not found.');
    await walletRow(sub,order.customer_id,db,true);
    await appendMovement(sub,order.customer_id,{
      type:'order_refund',direction:'credit',amount:BigInt(debit.amount_account_units),currency:debit.account_currency_snapshot,
      description:`Refund for order ${order.reference}`,reason:input.reason,actorType:'reseller',actor,referenceId:id,
      originalDebit:debit.id,key:randomUUID(),hash:hashRequest({refund:id,debit:debit.id}),
      sourceUsdUnits:debit.amount_usd_units==null?null:String(debit.amount_usd_units),legacyCurrencySnapshot:debit.currency_snapshot,
    },db);
  }
  await db.query(`UPDATE service_orders SET status=$3,result=$4,rejection_reason=$5,internal_note=$6,updated_at=now(),
    completed_at=CASE WHEN $3='completed' THEN now() ELSE completed_at END,
    rejected_at=CASE WHEN $3='rejected' THEN now() ELSE rejected_at END WHERE subscriber_id=$1 AND id=$2`,
    [sub,id,input.status,input.status==='completed'?input.result:order.result,input.status==='rejected'?input.reason:order.rejection_reason,input.internalNote??order.internal_note]);
  await audit(sub,order.customer_id,input.status==='rejected'?'service_order_refunded':`service_order_${input.status}`,actor,db);
  return orderView(await orderRow(sub,id,db),true);
}
