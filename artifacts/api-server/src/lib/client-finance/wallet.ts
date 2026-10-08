import { randomUUID, createHash } from 'node:crypto';
import { z } from '@workspace/api-zod';
import type { PoolClient } from '@workspace/db';
import { HttpError } from '../auth';
import { currencies } from '../commerce/currencies';
import { USD_FACTOR, RATE_FACTOR, MAX_USD_UNITS, MAX_MINOR, rateUnits, convertMinor, formatCurrencyMinor, type StoreCurrency } from '../commerce/currency-money';

export function usdText(units:string|bigint) {
  const n=BigInt(units), whole=n/USD_FACTOR, fraction=(n%USD_FACTOR).toString().padStart(12,'0').replace(/0+$/,'');
  return `${whole}${fraction?'.'+fraction:''}`;
}
export const hashRequest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function lockClient(sub:string,id:string,db:PoolClient,active=false) {
  const row=(await db.query('SELECT * FROM public_customer_accounts WHERE subscriber_id=$1 AND id=$2 FOR UPDATE',[sub,id])).rows[0];
  if(!row)throw new HttpError(404,'Client not found.');
  if(active&&!row.enabled)throw new HttpError(403,'Account is blocked.');
  return row;
}
export async function walletRow(sub:string,id:string,db:PoolClient,lock=false) {
  const row=(await db.query(`SELECT * FROM customer_wallets WHERE subscriber_id=$1 AND customer_id=$2 ${lock?'FOR UPDATE':''}`,[sub,id])).rows[0];
  if(!row)throw new HttpError(503,'Wallet is not initialized. Apply the wallet migration.');
  return row;
}
export async function displayCurrency(sub:string,id:string,db:PoolClient,requested?:string) {
  const rows=await currencies(sub,db);
  const account=(await db.query('SELECT preferred_currency FROM public_customer_accounts WHERE subscriber_id=$1 AND id=$2',[sub,id])).rows[0];
  return walletCurrency(rows,account?.preferred_currency,requested);
}
export function walletCurrency(rows:StoreCurrency[],preferred?:string|null,requested?:string):StoreCurrency {
  // Legacy rates may be based on DZD, not USD. Never reinterpret them as USD FX.
  const usdBasis=rows.some(c=>c.is_base&&c.code==='USD'&&rateUnits(c.rate)===RATE_FACTOR);
  const enabled=rows.filter(c=>c.enabled&&c.rate_configured!==false&&(usdBasis||c.code==='USD'));
  if(requested) {
    const currency=enabled.find(c=>c.code===requested);
    if(!currency)throw new HttpError(400,'Choose an enabled currency.');
    return currency.code==='USD'?{...currency,rate:'1.000000'}:currency;
  }
  const currency=enabled.find(c=>c.code===preferred)??enabled.find(c=>c.client_default)??enabled.find(c=>c.code==='USD');
  if(!currency)return {code:'USD',name:'US Dollar',prefix:'$',suffix:'USD',number_format:'1,000.99',rate:'1.000000',decimals:2,enabled:true,client_default:false,is_base:true,rate_configured:true};
  return currency.code==='USD'?{...currency,rate:'1.000000'}:currency;
}
export function money(units:string|bigint,c:StoreCurrency) {
  return formatCurrencyMinor(convertMinor(units,c,12),c);
}
export async function financialSummary(sub:string,id:string,db:PoolClient) {
  const wallet=await walletRow(sub,id,db), currency=await displayCurrency(sub,id,db);
  const sums=(await db.query(`SELECT
    coalesce(sum(amount_usd_units) FILTER(WHERE direction='credit'),0)::text credits,
    coalesce(sum(amount_usd_units) FILTER(WHERE direction='debit'),0)::text debits,
    coalesce(sum(CASE WHEN type='order_debit' THEN amount_usd_units WHEN type='order_refund' THEN -amount_usd_units ELSE 0 END),0)::text spent
    FROM customer_wallet_ledger WHERE subscriber_id=$1 AND customer_id=$2`,[sub,id])).rows[0];
  return {
    availableBalance:String(wallet.available_balance),lockedAmount:String(wallet.locked_balance),
    totalSpent:sums.spent,totalCredits:sums.credits,totalDebits:sums.debits,due:'0',creditLimit:'0',
    formattedAvailable:money(wallet.available_balance,currency),formattedLocked:money(wallet.locked_balance,currency),
    formattedTotalSpent:money(sums.spent,currency),formattedTotalCredits:money(sums.credits,currency),
    formattedTotalDebits:money(sums.debits,currency),formattedDue:money('0',currency),
    formattedZero:money('0',currency),
    currency:currency.code,accountingCurrency:'USD',ledgerAvailable:true,
  };
}
export async function audit(sub:string,id:string,action:string,actor:string|null,db:PoolClient) {
  await db.query('INSERT INTO public_customer_activity(id,subscriber_id,customer_id,action,actor_id) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(),sub,id,action,actor]);
}
type Movement = {
  id?:string;type:'admin_credit'|'admin_debit'|'adjustment'|'order_debit'|'order_refund';direction:'credit'|'debit';
  amount:bigint;currency:StoreCurrency;description:string;method?:string;transactionReference?:string;internalNote?:string;
  actorType:'reseller'|'customer';actor:string;referenceId?:string;originalDebit?:string;key:string;hash:string;
};
/** Caller holds account then wallet locks. The immutable INSERT drives the guarded balance trigger. */
export async function appendMovement(sub:string,id:string,m:Movement,db:PoolClient) {
  const wallet=await walletRow(sub,id,db,true), prior=BigInt(wallet.available_balance);
  if(m.amount<=0n||m.amount>MAX_USD_UNITS)throw new HttpError(400,'Enter a positive amount within the money limit.');
  const after=prior+(m.direction==='credit'?m.amount:-m.amount);
  if(after<0n)throw new HttpError(409,'INSUFFICIENT_BALANCE');
  if(after>MAX_USD_UNITS)throw new HttpError(400,'Wallet balance exceeds the safe money limit.');
  if(m.direction==='credit'&&m.type!=='order_refund') {
    const refundable=(await db.query(`SELECT coalesce(sum(price_usd_units),0)::text n FROM service_orders
      WHERE subscriber_id=$1 AND customer_id=$2 AND status IN ('pending','processing')`,[sub,id])).rows[0].n;
    if(after+BigInt(refundable)>MAX_USD_UNITS)throw new HttpError(400,'This credit exceeds the safe balance limit including refundable orders.');
  }
  const entry=(await db.query(`INSERT INTO customer_wallet_ledger
    (id,subscriber_id,customer_id,type,direction,amount_usd_units,balance_after,currency_snapshot,description,method,
      transaction_reference,internal_note,created_by_type,created_by_id,reference_type,reference_id,original_debit_id,idempotency_key,request_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [m.id??randomUUID(),sub,id,m.type,m.direction,m.amount.toString(),after.toString(),JSON.stringify(m.currency),m.description,
      m.method??'',m.transactionReference??'',m.internalNote??'',m.actorType,m.actor,m.referenceId?'service_order':'manual',
      m.referenceId??null,m.originalDebit??null,m.key,m.hash])).rows[0];
  return entry;
}
export function ledgerView(row:Record<string,any>,internal=false) {
  const c=row.currency_snapshot as StoreCurrency;
  return {
    id:row.id,type:row.type,direction:row.direction,amountUsdUnits:String(row.amount_usd_units),
    formattedAmount:money(row.amount_usd_units,c),formattedBalanceAfter:money(row.balance_after,c),currency:c.code,
    description:row.description,referenceType:row.reference_type,referenceId:row.reference_id,
    createdAt:row.created_at,method:row.method,transactionReference:row.transaction_reference,
    ...(internal?{internalNote:row.internal_note,createdByType:row.created_by_type,createdById:row.created_by_id}:{}),
  };
}
export const statementQuery=z.object({
  page:z.coerce.number().int().min(1).max(100000).default(1),search:z.string().trim().max(100).optional(),
  direction:z.enum(['credit','debit']).optional(),
  type:z.enum(['admin_credit','admin_debit','adjustment','order_debit','order_refund']).optional(),
}).strict();
export async function statement(sub:string,id:string,raw:unknown,db:PoolClient,internal=false) {
  const q=statementQuery.parse(raw), search=q.search?`%${q.search.replace(/[\\%_]/g,'\\$&')}%`:null;
  const rows=(await db.query(`SELECT * FROM customer_wallet_ledger WHERE subscriber_id=$1 AND customer_id=$2
    AND ($3::text IS NULL OR description ILIKE $3 OR transaction_reference ILIKE $3 OR reference_id::text ILIKE $3)
    AND ($4::text IS NULL OR direction=$4) AND($5::text IS NULL OR type=$5)
    ORDER BY created_at DESC,id LIMIT 31 OFFSET $6`,[sub,id,search,q.direction??null,q.type??null,(q.page-1)*30])).rows;
  return {data:rows.slice(0,30).map(r=>ledgerView(r,internal)),page:q.page,hasMore:rows.length>30,financial:await financialSummary(sub,id,db)};
}
export const mutationInput=z.object({
  operation:z.enum(['add','deduct','adjustment']),direction:z.enum(['credit','debit']),
  amount:z.string().trim().regex(/^\d{1,15}(?:\.\d{1,6})?$/),currency:z.string().regex(/^[A-Z]{3}$/),
  reason:z.string().trim().min(1).max(500),method:z.string().trim().min(1).max(100),
  transactionReference:z.string().trim().max(200).default(''),internalNote:z.string().trim().max(2000).default(''),
  customerNote:z.string().trim().max(500).default(''),idempotencyKey:z.string().uuid(),
}).strict();
export async function mutateWallet(sub:string,id:string,raw:unknown,actor:string,db:PoolClient) {
  const input=mutationInput.parse(raw);
  if(input.operation==='add'&&input.direction!=='credit'||input.operation==='deduct'&&input.direction!=='debit')throw new HttpError(400,'Invalid financial action direction.');
  await lockClient(sub,id,db);await walletRow(sub,id,db,true);
  const hash=hashRequest(input), existing=(await db.query('SELECT * FROM customer_wallet_ledger WHERE subscriber_id=$1 AND customer_id=$2 AND idempotency_key=$3',[sub,id,input.idempotencyKey])).rows[0];
  if(existing) {
    if(existing.request_hash!==hash||existing.created_by_type!=='reseller'||existing.created_by_id!==actor)throw new HttpError(409,'Idempotency key was used for a different action.');
    return {entry:ledgerView(existing,true),financial:await financialSummary(sub,id,db)};
  }
  const currency=await displayCurrency(sub,id,db,input.currency),[whole,fraction='']=input.amount.split('.');
  if(fraction.length>currency.decimals)throw new HttpError(400,`Use at most ${currency.decimals} decimals for ${currency.code}.`);
  const minor=BigInt(whole!)*10n**BigInt(currency.decimals)+BigInt(fraction.padEnd(currency.decimals,'0')||'0');
  if(minor<=0n||minor>MAX_MINOR)throw new HttpError(400,'Enter a positive amount within the money limit.');
  const denominator=(10n**BigInt(currency.decimals))*rateUnits(currency.rate);
  const amount=(minor*USD_FACTOR*RATE_FACTOR+denominator/2n)/denominator;
  const entry=await appendMovement(sub,id,{
    type:input.operation==='add'?'admin_credit':input.operation==='deduct'?'admin_debit':'adjustment',
    direction:input.direction,amount,currency:{...currency,entered_amount:input.amount,entered_minor:minor.toString()} as typeof currency,
    description:input.customerNote||input.reason,method:input.method,
    transactionReference:input.transactionReference,internalNote:[input.reason,input.internalNote].filter(Boolean).join('\n'),
    actorType:'reseller',actor,key:input.idempotencyKey,hash,
  },db);
  await audit(sub,id,input.operation==='add'?'funds_added':input.operation==='deduct'?'funds_deducted':'wallet_adjustment',actor,db);
  return {entry:ledgerView(entry,true),financial:await financialSummary(sub,id,db)};
}
