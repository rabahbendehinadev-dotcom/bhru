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
  const account=await walletRow(sub,id,db);
  return walletCurrency(rows,account.accounting_currency,requested);
}
type AccountCurrency=StoreCurrency & {usd_basis_configured:boolean};
export function walletCurrency(rows:StoreCurrency[],preferred?:string|null,requested?:string):AccountCurrency {
  if(!preferred)throw new HttpError(503,'Account currency is not initialized.');
  if(requested&&requested!==preferred)throw new HttpError(400,`Account currency is ${preferred}; another currency cannot be used.`);
  const usdBasis=rows.some(c=>c.is_base&&c.code==='USD'&&rateUnits(c.rate)===RATE_FACTOR);
  const currency=rows.find(c=>c.code===preferred);
  if(!currency&&preferred!=='USD')throw new HttpError(503,'Account currency configuration is unavailable; account currency has not changed.');
  const selected=currency??{code:'USD',name:'US Dollar',prefix:'$',suffix:'USD',number_format:'1,000.99',rate:'1.000000',decimals:2,enabled:true,client_default:false,is_base:true,rate_configured:true};
  return {...selected,...(preferred==='USD'?{rate:'1.000000'}:{}),usd_basis_configured:usdBasis};
}
/** Wallet integer units are always in the account currency, never FX converted. */
export function money(units:string|bigint,c:StoreCurrency) {
  const divisor=10n**BigInt(12-c.decimals);
  return formatCurrencyMinor((BigInt(units)+divisor/2n)/divisor,c);
}
/** Only catalog pricing converts USD to account money, rounded once to minor units. */
export function accountPrice(usd:string|bigint,c:StoreCurrency) {
  if(c.code!=='USD'&&(!(c as AccountCurrency).usd_basis_configured||c.rate_configured===false))
    throw new HttpError(503,'A verified USD-based manual rate is required for service pricing in this account currency.');
  const amount=convertMinor(usd,c,12)*10n**BigInt(12-c.decimals);
  if(amount<=0n||amount>MAX_USD_UNITS)throw new HttpError(400,'Service price is outside the account-currency money limits.');
  return amount;
}
export async function financialSummary(sub:string,id:string,db:PoolClient) {
  const summaries=await financialSummaries(sub,[id],db);
  const result=summaries.get(id);
  if(!result)throw new HttpError(503,'Wallet is not initialized. Apply the wallet migration.');
  return result;
}
/** One SQL snapshot for wallet, ledger totals and completed-order charges.
 * Batch support lets client lists use exactly the same reporting path without N+1 queries.
 * No ledger/balance writes, live service prices, FX or floating-point arithmetic.
 */
export async function financialSummaries(sub:string,ids:string[],db:PoolClient) {
  const configured=await currencies(sub,db);
  const rows=(await db.query(`SELECT w.*,
    coalesce(l.credits,0)::text credits,coalesce(l.debits,0)::text debits,
    coalesce(l.net_charges,0)::text net_charges,coalesce(o.spent,0)::text spent
    FROM customer_wallets w
    LEFT JOIN LATERAL (
      SELECT sum(amount_account_units) FILTER(WHERE direction='credit') credits,
        sum(amount_account_units) FILTER(WHERE direction='debit') debits,
        sum(CASE WHEN type='order_debit' THEN amount_account_units WHEN type='order_refund' THEN -amount_account_units ELSE 0 END) net_charges
      FROM customer_wallet_ledger WHERE subscriber_id=w.subscriber_id AND customer_id=w.customer_id
    ) l ON true
    LEFT JOIN LATERAL (
      SELECT sum(d.amount_account_units) spent FROM service_orders s
      JOIN customer_wallet_ledger d ON d.subscriber_id=s.subscriber_id AND d.customer_id=s.customer_id
        AND d.id=s.wallet_debit_reference AND d.type='order_debit' AND d.direction='debit'
      WHERE s.subscriber_id=w.subscriber_id AND s.customer_id=w.customer_id AND s.status='completed'
    ) o ON true
    WHERE w.subscriber_id=$1 AND w.customer_id=ANY($2::uuid[])`,[sub,ids])).rows;
  return new Map(rows.map(wallet=>{
    const currency=walletCurrency(configured,wallet.accounting_currency);
    const sums=wallet;
    return [String(wallet.customer_id),{
    availableBalance:String(wallet.available_balance),lockedAmount:String(wallet.locked_balance),
    reportingVersion:2,totalSpent:sums.spent,netServiceCharges:sums.net_charges,
    ledgerCredits:sums.credits,ledgerDebits:sums.debits,totalCredits:sums.credits,totalDebits:sums.debits,
    formattedAvailable:money(wallet.available_balance,currency),formattedLocked:money(wallet.locked_balance,currency),
    formattedTotalSpent:money(sums.spent,currency),formattedTotalCredits:money(sums.credits,currency),
    formattedTotalDebits:money(sums.debits,currency),
    formattedLedgerCredits:money(sums.credits,currency),formattedLedgerDebits:money(sums.debits,currency),
    formattedNetServiceCharges:money(sums.net_charges,currency),
    formattedZero:money('0',currency),
    currency:currency.code,accountCurrency:currency.code,accountingCurrency:wallet.accounting_currency,ledgerAvailable:true,
    }] as const;
  }));
}
export async function audit(sub:string,id:string,action:string,actor:string|null,db:PoolClient) {
  await db.query('INSERT INTO public_customer_activity(id,subscriber_id,customer_id,action,actor_id) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(),sub,id,action,actor]);
}
type Movement = {
  id?:string;type:'admin_credit'|'admin_debit'|'adjustment'|'order_debit'|'order_refund';direction:'credit'|'debit';
  amount:bigint;currency:StoreCurrency;description:string;method?:string;transactionReference?:string;internalNote?:string;
  actorType:'reseller'|'customer'|'system';actor:string|null;referenceId?:string;originalDebit?:string;key:string;hash:string;
  reason?:string;customerNote?:string;
  sourceUsdUnits?:string|null;legacyCurrencySnapshot?:StoreCurrency;
};
/** Caller holds account then wallet locks. The immutable INSERT drives the guarded balance trigger. */
export async function appendMovement(sub:string,id:string,m:Movement,db:PoolClient) {
  const wallet=await walletRow(sub,id,db,true), prior=BigInt(wallet.available_balance);
  if(m.amount<=0n||m.amount>MAX_USD_UNITS)throw new HttpError(400,'Enter a positive amount within the money limit.');
  const after=prior+(m.direction==='credit'?m.amount:-m.amount);
  if(after<0n)throw new HttpError(409,'INSUFFICIENT_BALANCE');
  if(after>MAX_USD_UNITS)throw new HttpError(400,'Wallet balance exceeds the safe money limit.');
  if(m.direction==='credit'&&m.type!=='order_refund') {
    const refundable=(await db.query(`SELECT coalesce(sum(price_account_units),0)::text n FROM service_orders
      WHERE subscriber_id=$1 AND customer_id=$2 AND status IN ('pending','processing')`,[sub,id])).rows[0].n;
    if(after+BigInt(refundable)>MAX_USD_UNITS)throw new HttpError(400,'This credit exceeds the safe balance limit including refundable orders.');
  }
  const entryId=m.id??randomUUID();
  const entry=(await db.query(`INSERT INTO customer_wallet_ledger
    (id,subscriber_id,customer_id,type,direction,amount_usd_units,balance_after,currency_snapshot,description,method,
      transaction_reference,internal_note,created_by_type,created_by_id,reference_type,reference_id,original_debit_id,idempotency_key,request_hash,
      amount_account_units,account_currency_snapshot,operation_source,correlation_id,reason,customer_note)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$23,$24,$25) RETURNING *`,
    [entryId,sub,id,m.type,m.direction,m.sourceUsdUnits!==undefined?m.sourceUsdUnits:m.currency.code==='USD'?m.amount.toString():null,after.toString(),JSON.stringify(m.legacyCurrencySnapshot??m.currency),m.description,
      m.method??'',m.transactionReference??'',m.internalNote??'',m.actorType==='reseller'?'subscriber_owner':m.actorType,m.actor,m.referenceId?'service_order':'manual',
      m.referenceId??null,m.originalDebit??null,m.key,m.hash,m.amount.toString(),JSON.stringify(m.currency),
      m.type==='order_debit'?'service_order':m.type==='order_refund'?'service_order_refund':'manual_wallet',
      m.referenceId??entryId,m.reason??'',m.customerNote??'']) ).rows[0];
  return entry;
}
export function ledgerView(row:Record<string,any>,internal=false) {
  const c=row.account_currency_snapshot as StoreCurrency;
  // Older manual entries used the internal reason as a fallback description.
  // Redact that fallback in the customer projection; never rewrite ledger history.
  const manualLabels:Record<string,string>={admin_credit:'Reseller credit',admin_debit:'Reseller deduction',adjustment:'Wallet adjustment'};
  const description=!internal&&row.reason==null&&manualLabels[row.type]&&row.description===String(row.internal_note??'').split('\n')[0]
    ?manualLabels[row.type]:row.description;
  return {
    id:row.id,type:row.type,direction:row.direction,amountUsdUnits:row.amount_usd_units==null?null:String(row.amount_usd_units),
    amountAccountUnits:String(row.amount_account_units),
    formattedAmount:money(row.amount_account_units,c),formattedBalanceAfter:money(row.balance_after,c),currency:c.code,
    description,referenceType:row.reference_type,referenceId:row.reference_id,
    createdAt:row.created_at,method:row.method,transactionReference:row.transaction_reference,
    ...(internal?{
      internalNote:row.internal_note,reason:row.reason??'',customerNote:row.customer_note,
      createdByType:row.created_by_type,createdById:row.created_by_id,
      actorDisplay:row.actor_display_snapshot??null,operationSource:row.operation_source??null,
      postingSequence:row.posting_sequence==null?null:String(row.posting_sequence),
      correlationId:row.correlation_id??null,originalDebitId:row.original_debit_id??null,
      correctionOfId:row.correction_of_id??null,
      referenceType:row.reference_type==='manual'?'manual_adjustment':row.reference_type,
      referenceId:row.reference_type==='manual'?row.id:row.reference_id,
      balanceBefore:(BigInt(row.balance_after)+(row.direction==='debit'?BigInt(row.amount_account_units):-BigInt(row.amount_account_units))).toString(),
      balanceAfter:String(row.balance_after),
      formattedBalanceBefore:money(BigInt(row.balance_after)+(row.direction==='debit'?BigInt(row.amount_account_units):-BigInt(row.amount_account_units)),c),
    }:{}),
  };
}
export const statementQuery=z.object({
  page:z.coerce.number().int().min(1).max(100000).default(1),search:z.string().trim().max(100).optional(),
  direction:z.enum(['credit','debit']).optional(),
  type:z.enum(['admin_credit','admin_debit','adjustment','order_debit','order_refund']).optional(),
}).strict();
// Customer search must use the same redacted description as the visible row,
// not provide an oracle for legacy internal reasons copied into description.
const publicLedgerDescription=`CASE
  WHEN reason IS NULL AND type IN ('admin_credit','admin_debit','adjustment')
    AND description=split_part(coalesce(internal_note,''),chr(10),1)
  THEN CASE type WHEN 'admin_credit' THEN 'Reseller credit'
    WHEN 'admin_debit' THEN 'Reseller deduction' ELSE 'Wallet adjustment' END
  ELSE description END`;
export async function statement(sub:string,id:string,raw:unknown,db:PoolClient,internal=false) {
  const q=statementQuery.parse(raw), search=q.search?`%${q.search.replace(/[\\%_]/g,'\\$&')}%`:null;
  const rows=(await db.query(`SELECT * FROM customer_wallet_ledger WHERE subscriber_id=$1 AND customer_id=$2
    AND ($3::text IS NULL OR (${internal?'description':publicLedgerDescription}) ILIKE $3 OR transaction_reference ILIKE $3 OR reference_id::text ILIKE $3)
    AND ($4::text IS NULL OR direction=$4) AND($5::text IS NULL OR type=$5)
    ORDER BY posting_sequence DESC NULLS LAST,created_at DESC,id LIMIT 31 OFFSET $6`,[sub,id,search,q.direction??null,q.type??null,(q.page-1)*30])).rows;
  return {data:rows.slice(0,30).map(r=>ledgerView(r,internal)),page:q.page,hasMore:rows.length>30,financial:await financialSummary(sub,id,db)};
}
export const mutationInput=z.object({
  operation:z.enum(['add','deduct','adjustment']),direction:z.enum(['credit','debit']),
  amount:z.string().trim().regex(/^\d{1,15}(?:\.\d{1,6})?$/),currency:z.string().regex(/^[A-Z]{3}$/).optional(),
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
    if(existing.request_hash!==hash||!['reseller','subscriber_owner'].includes(existing.created_by_type)||existing.created_by_id!==actor)throw new HttpError(409,'Idempotency key was used for a different action.');
    return {entry:ledgerView(existing,true),financial:await financialSummary(sub,id,db)};
  }
  const currency=await displayCurrency(sub,id,db,input.currency),[whole,fraction='']=input.amount.split('.');
  if(fraction.length>currency.decimals)throw new HttpError(400,`Use at most ${currency.decimals} decimals for ${currency.code}.`);
  const minor=BigInt(whole!)*10n**BigInt(currency.decimals)+BigInt(fraction.padEnd(currency.decimals,'0')||'0');
  if(minor<=0n||minor>MAX_MINOR)throw new HttpError(400,'Enter a positive amount within the money limit.');
  const amount=minor*10n**BigInt(12-currency.decimals);
  const entry=await appendMovement(sub,id,{
    type:input.operation==='add'?'admin_credit':input.operation==='deduct'?'admin_debit':'adjustment',
    direction:input.direction,amount,currency:{...currency,entered_amount:input.amount,entered_minor:minor.toString()} as typeof currency,
    description:input.customerNote||({add:'Funds added',deduct:'Funds deducted',adjustment:'Wallet adjustment'}[input.operation]),method:input.method,
    transactionReference:input.transactionReference,internalNote:input.internalNote,reason:input.reason,customerNote:input.customerNote,
    actorType:'reseller',actor,key:input.idempotencyKey,hash,
  },db);
  await audit(sub,id,input.operation==='add'?'funds_added':input.operation==='deduct'?'funds_deducted':'wallet_adjustment',actor,db);
  return {entry:ledgerView(entry,true),financial:await financialSummary(sub,id,db)};
}
