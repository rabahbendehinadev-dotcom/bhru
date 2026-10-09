import type {PoolClient} from '@workspace/db';
import {fundingRow,fundingDeadline} from './funding';
import {gatewayDefinitions} from './registry';
/** Read-only financial diagnostics. Never patches balances or "repairs" history. */
export async function reconcileFunding(tenant:string,id:string,db:PoolClient){
  const f=await fundingRow(tenant,id,db),issues=new Set<string>();
  const deadline=await fundingDeadline(f,db);
  const payments=(await db.query(`SELECT p.*,l.amount_account_units,l.account_currency_snapshot,l.payment_transaction_id,
    l.subscriber_id ledger_tenant,l.customer_id ledger_customer FROM payment_transactions p
    LEFT JOIN customer_wallet_ledger l ON l.id=p.wallet_ledger_id WHERE p.subscriber_id=$1 AND p.funding_request_id=$2`,[tenant,id])).rows;
  const jobs=(await db.query('SELECT safe_error FROM payment_processing_jobs WHERE subscriber_id=$1 AND funding_request_id=$2 AND state=$3',[tenant,id,'REVIEW'])).rows;
  jobs.forEach(j=>issues.add(j.safe_error??'REVIEW_REQUIRED'));
  const settled=payments.filter(p=>p.status==='SETTLED');
  if(f.status==='PAID'&&settled.length!==1)issues.add('PAID_WITHOUT_ALLOCATION');
  if(settled.length>1)issues.add('DUPLICATE_ALLOCATION');
  for(const p of payments){
    if(p.status==='VERIFIED')issues.add('VERIFIED_UNSETTLED');
    if(String(p.amount_minor)!==String(f.expected_payment_minor))issues.add('AMOUNT_MISMATCH');
    if(p.currency!==f.payment_currency)issues.add('CURRENCY_MISMATCH');
    if(new Date(p.provider_occurred_at)>deadline)issues.add('LATE_PAYMENT');
    if(p.status==='VERIFIED'&&['EXPIRED','CANCELLED','FAILED'].includes(f.status))issues.add('TERMINAL_FUNDING');
    if(p.status==='SETTLED'&&(f.status!=='PAID'||p.payment_transaction_id!==p.id||p.ledger_tenant!==tenant
      ||p.ledger_customer!==f.customer_id||String(p.amount_account_units)!==String(f.requested_credit_units)
      ||p.account_currency_snapshot?.code!==f.account_currency))issues.add('INCONSISTENT_ALLOCATION');
  }
  const init=(await db.query('SELECT * FROM payment_initiations WHERE subscriber_id=$1 AND funding_request_id=$2',[tenant,id])).rows[0];
  if(init?.creation_started_at&&!init.result&&jobs.length)issues.add('UNRESOLVED_PROVIDER_IDENTITY');
  return {fundingId:id,consistent:issues.size===0,issues:[...issues],readOnly:true as const};
}
export async function paymentMonitoring(db:PoolClient){
  const rows=(await db.query(`SELECT p.gateway_code,p.global_enabled,
    (SELECT count(*)::int FROM reseller_payment_gateways c WHERE c.gateway_code=p.gateway_code) configured_resellers,
    (SELECT count(*)::int FROM payment_funding_requests f WHERE f.gateway_code=p.gateway_code AND f.status IN ('CREATED','PENDING_PAYMENT')) pending,
    (SELECT count(*)::int FROM payment_transactions t WHERE t.gateway_code=p.gateway_code AND t.status='VERIFIED') verified_unsettled,
    (SELECT count(*)::int FROM payment_processing_jobs j WHERE j.gateway_code=p.gateway_code AND j.state IN ('REVIEW','FAILED')) failed_processing,
    (SELECT count(*)::int FROM payment_processing_jobs j WHERE j.gateway_code=p.gateway_code AND j.state='REVIEW') review_required
    FROM payment_gateway_policies p ORDER BY gateway_code`)).rows;
  return {data:gatewayDefinitions.map(d=>{
    const r=rows.find(r=>r.gateway_code===d.code);
    return {gatewayCode:d.code,gatewayName:d.displayName,integrationStatus:d.integrationStatus,globalEnabled:r?.global_enabled??false,
      configuredResellers:r?.configured_resellers??0,pending:r?.pending??0,verifiedUnsettled:r?.verified_unsettled??0,
      failedProcessing:r?.failed_processing??0,reviewRequired:r?.review_required??0};
  })};
}
export async function listPaymentReviews(tenant:string,db:PoolClient,rawPage:unknown='1'){
  const {z}=await import('@workspace/api-zod'),page=z.coerce.number().int().min(1).max(100000).parse(rawPage);
  const rows=(await db.query(`SELECT * FROM payment_processing_jobs WHERE subscriber_id=$1 AND state='REVIEW'
    ORDER BY created_at DESC,id LIMIT 31 OFFSET $2`,[tenant,(page-1)*30])).rows;
  return {hasMore:rows.length>30,data:rows.slice(0,30).map(j=>({
    id:j.id,fundingId:j.funding_request_id,gatewayCode:j.gateway_code,category:j.safe_error??'REVIEW_REQUIRED',
    createdAt:j.created_at,providerReference:j.payload.event?.providerReference??null,
    amountMinor:j.payload.event?.amountMinor??null,currency:j.payload.event?.currency??null,
  }))};
}
