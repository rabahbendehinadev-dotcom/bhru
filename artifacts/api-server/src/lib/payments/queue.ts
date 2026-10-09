import type {PoolClient} from '@workspace/db';
import {hashRequest} from '../client-finance/wallet';
import {activityContext} from '../customer-auth/activity';
import {assertVerified,assertAuthenticatedReview,type AuthenticatedWebhookMismatch,type VerifiedPayment} from './verification';
export async function enqueue(db:PoolClient,tenant:string,code:string,kind:'INITIATION'|'EVENT'|'STATUS',key:string,funding:string|null,version:string,payload:unknown={},authenticated=false){
  return (await db.query(`INSERT INTO payment_processing_jobs(subscriber_id,gateway_code,kind,dedup_key,funding_request_id,adapter_version,payload,authenticated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,CASE WHEN $8 THEN now() END)
    ON CONFLICT(subscriber_id,gateway_code,kind,dedup_key) DO NOTHING RETURNING id`,
    [tenant,code,kind,key,funding,version,JSON.stringify(payload),authenticated])).rows[0]?.id as string|undefined;
}
export async function paymentActivity(db:PoolClient,tenant:string,funding:string,type:'payment_initiated'|'payment_expired'|'payment_review_required'){
  const f=(await db.query('SELECT customer_id FROM payment_funding_requests WHERE subscriber_id=$1 AND id=$2',[tenant,funding])).rows[0];
  if(!f)return;
  await activityContext(db,tenant,f.customer_id,{type:'system',id:null});
  await db.query("SELECT emit_client_activity($1,$2,$3,'FINANCIAL','funding_request',$4,$5)",[tenant,f.customer_id,type,funding,`funding:${funding}:${type}`]);
}
// jsonb reorders object keys. Compare canonical normalized fields, not JS serialization order.
const sameEvent=(a:Record<string,unknown>,b:Record<string,unknown>)=>
  JSON.stringify(Object.entries(a).sort(([x],[y])=>x.localeCompare(y)))===
  JSON.stringify(Object.entries(b).sort(([x],[y])=>x.localeCompare(y)));
/** Only the WeakSet-authenticated verification capability can enqueue receipts. */
export async function enqueueVerified(proof:VerifiedPayment,db:PoolClient){
  assertVerified(proof);const e=proof.data;
  const f=(await db.query('SELECT id FROM payment_funding_requests WHERE subscriber_id=$1 AND id=$2 AND gateway_code=$3',
    [proof.tenant,e.fundingId,proof.code])).rows[0];
  const key=hashRequest({merchant:e.merchantScope,event:e.eventId});
  const existing=(await db.query(`SELECT id,payload FROM payment_processing_jobs WHERE subscriber_id=$1 AND gateway_code=$2 AND kind='EVENT' AND dedup_key=$3`,
    [proof.tenant,proof.code,key])).rows[0];
  const payload={event:e,digest:proof.payloadDigest,method:'trusted_adapter'};
  if(existing&&!sameEvent(existing.payload.event,e)){
    const conflict=await enqueue(db,proof.tenant,proof.code,'EVENT',hashRequest({key,event:e}),f?.id??null,proof.version,payload,true);
    if(conflict){
      await db.query("UPDATE payment_processing_jobs SET state='REVIEW',safe_error='CONFLICTING_EVENT' WHERE id=$1",[conflict]);
      if(f)await paymentActivity(db,proof.tenant,f.id,'payment_review_required');
    }
    return {id:existing.id as string,duplicate:true,reviewRequired:true};
  }
  const id=await enqueue(db,proof.tenant,proof.code,'EVENT',key,f?.id??null,proof.version,payload,true);
  // A concurrent conflicting delivery must not be reported as an ordinary duplicate.
  if(!id&&!existing)return enqueueVerified(proof,db);
  return {id:id??existing.id as string,duplicate:!id,reviewRequired:false};
}
/** Authenticated protocol mismatch is retained for review, never a settlement proof. */
export async function enqueueMerchantReview(error:AuthenticatedWebhookMismatch,db:PoolClient){
  assertAuthenticatedReview(error);const p=error.evidence,e=p.data;
  const f=(await db.query('SELECT id FROM payment_funding_requests WHERE subscriber_id=$1 AND id=$2 AND gateway_code=$3',[p.tenant,e.fundingId,p.code])).rows[0];
  const key='merchant-mismatch:'+hashRequest({event:e.eventId,merchant:e.merchantScope,eventBody:e});
  const id=await enqueue(db,p.tenant,p.code,'EVENT',key,f?.id??null,p.version,{event:e,digest:p.payloadDigest,method:'trusted_adapter'},true);
  const result=await db.query("UPDATE payment_processing_jobs SET state='REVIEW',safe_error='MERCHANT_MISMATCH',updated_at=now() WHERE id=$1 AND state='READY'",[id]);
  if(result.rowCount&&f)await paymentActivity(db,p.tenant,f.id,'payment_review_required');
  return {duplicate:result.rowCount===0};
}
