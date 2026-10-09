import {randomUUID} from 'node:crypto';
import {transaction} from '../platform';
import {HttpError} from '../auth';
import {appendMovement,hashRequest,lockClient} from '../client-finance/wallet';
import {activityContext} from '../customer-auth/activity';
import {fundingRow} from './funding';
import {assertVerified,type VerifiedPayment} from './verification';
/** Durable verified receipt FIRST. Allocation failures never erase proof of
 * actual received money. A fresh verified callback safely retries allocation.
 */
export async function recordVerifiedPayment(proof:VerifiedPayment){
  assertVerified(proof);
  return transaction(async db=>{
    const {tenant,code,data:d}=proof,first=await fundingRow(tenant,d.fundingId,db);
    await lockClient(tenant,first.customer_id,db);const f=await fundingRow(tenant,d.fundingId,db,first.customer_id,true);
    if(f.gateway_code!==code||f.snapshot.merchantScope!==d.merchantScope||f.payment_currency!==d.currency||String(f.expected_payment_minor)!==d.amountMinor)
      throw new HttpError(409,'Provider transaction does not match the frozen funding request.');
    const hash=hashRequest(d),event=(await db.query(`SELECT request_hash FROM payment_gateway_events WHERE subscriber_id=$1 AND gateway_code=$2 AND merchant_scope=$3 AND event_id=$4`,
      [tenant,code,d.merchantScope,d.eventId])).rows[0];
    if(event&&event.request_hash!==hash)throw new HttpError(409,'Provider event ID was reused with conflicting evidence.');
    if(!event)await db.query(`INSERT INTO payment_gateway_events(subscriber_id,gateway_code,merchant_scope,event_id,funding_request_id,customer_id,request_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[tenant,code,d.merchantScope,d.eventId,f.id,f.customer_id,hash]);
    await activityContext(db,tenant,f.customer_id,{type:'system',id:null});
    if(d.status==='PENDING'){
      if(f.status==='CREATED'){
        await db.query("UPDATE payment_funding_requests SET status='PENDING_PAYMENT',updated_at=now() WHERE id=$1",[f.id]);
        await db.query("SELECT emit_client_activity($1,$2,'payment_pending','FINANCIAL','funding_request',$3,$4)",[tenant,f.customer_id,f.id,`funding:${f.id}:pending`]);
      }
      return null;
    }
    const existing=(await db.query(`SELECT * FROM payment_transactions WHERE subscriber_id=$1 AND gateway_code=$2 AND merchant_scope=$3 AND provider_reference=$4 FOR UPDATE`,
      [tenant,code,d.merchantScope,d.providerReference])).rows[0];
    if(existing){
      if(existing.funding_request_id!==f.id||existing.currency!==d.currency||String(existing.amount_minor)!==d.amountMinor
        ||(existing.status==='FAILED')!==(d.status==='FAILED'))throw new HttpError(409,'Provider transaction reference already belongs to different evidence.');
      return existing.id as string;
    }
    const id=randomUUID(),status=d.status==='PAID'?'VERIFIED':'FAILED';
    await db.query(`INSERT INTO payment_transactions(id,subscriber_id,customer_id,funding_request_id,gateway_code,merchant_scope,provider_reference,status,amount_minor,currency,provider_occurred_at,verification_metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,[id,tenant,f.customer_id,f.id,code,d.merchantScope,d.providerReference,status,d.amountMinor,d.currency,d.occurredAt,
      JSON.stringify({verification_method:'trusted_adapter',adapter_version:proof.version,payload_digest:proof.payloadDigest})]);
    if(status==='FAILED'&&['CREATED','PENDING_PAYMENT'].includes(f.status))await db.query("UPDATE payment_funding_requests SET status='FAILED',updated_at=now() WHERE id=$1",[f.id]);
    await db.query(`SELECT emit_client_activity($1,$2,$3,'FINANCIAL','payment_transaction',$4,$5)`,
      [tenant,f.customer_id,status==='VERIFIED'?'payment_confirmed':'payment_failed',id,`payment:${id}:${status}`]);
    return id;
  });
}
export async function settleVerifiedPayment(proof:VerifiedPayment,paymentId:string){
  assertVerified(proof);if(proof.data.status!=='PAID')throw new HttpError(409,'Only verified received payments can fund a wallet.');
  return transaction(async db=>{
    const first=await fundingRow(proof.tenant,proof.data.fundingId,db);
    await lockClient(proof.tenant,first.customer_id,db);const f=await fundingRow(proof.tenant,first.id,db,first.customer_id,true);
    const p=(await db.query('SELECT * FROM payment_transactions WHERE subscriber_id=$1 AND customer_id=$2 AND funding_request_id=$3 AND id=$4 FOR UPDATE',
      [proof.tenant,f.customer_id,f.id,paymentId])).rows[0];
    if(!p||p.gateway_code!==proof.code||p.provider_reference!==proof.data.providerReference||p.merchant_scope!==proof.data.merchantScope
      ||String(p.amount_minor)!==proof.data.amountMinor||p.currency!==proof.data.currency)throw new HttpError(404,'Verified payment not found.');
    if(p.status==='SETTLED')return {paymentId:p.id,ledgerId:p.wallet_ledger_id,alreadySettled:true};
    if(p.status!=='VERIFIED'||!['CREATED','PENDING_PAYMENT'].includes(f.status)||new Date(p.provider_occurred_at)>new Date(f.expires_at))
      throw new HttpError(409,'Verified receipt requires review; automatic allocation is unavailable.');
    await activityContext(db,proof.tenant,f.customer_id,{type:'system',id:null});
    const entry=await appendMovement(proof.tenant,f.customer_id,{
      type:'payment_credit',direction:'credit',amount:BigInt(f.requested_credit_units),currency:f.snapshot.account,
      actorType:'system',actor:null,description:`Payment funding — ${f.gateway_name_snapshot}`,method:proof.code,
      transactionReference:p.provider_reference,paymentTransactionId:p.id,key:p.id,hash:hashRequest({paymentId:p.id,fundingId:f.id}),
    },db);
    await db.query("UPDATE payment_transactions SET status='SETTLED',wallet_ledger_id=$2,settled_at=now(),updated_at=now() WHERE id=$1",[p.id,entry.id]);
    await db.query("UPDATE payment_funding_requests SET status='PAID',paid_at=now(),updated_at=now() WHERE id=$1",[f.id]);
    return {paymentId:p.id,ledgerId:entry.id,alreadySettled:false};
  });
}
export async function processGatewayCallback(proof:VerifiedPayment){
  const id=await recordVerifiedPayment(proof);
  return id&&proof.data.status==='PAID'?settleVerifiedPayment(proof,id):{paymentId:id,ledgerId:null,alreadySettled:false};
}
