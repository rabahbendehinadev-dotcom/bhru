import {randomUUID} from 'node:crypto';
import {transaction} from '../platform';
import {logger} from '../logger';
import {createProviderPayment,initiationContext,creationInput} from './initiation';
import {gateway} from './registry';
import {verifiedJobProof,verifyStatusEvent} from './verification';
import {enqueueVerified,paymentActivity} from './queue';
import {recordVerifiedPayment,settleVerifiedPayment} from './settlement';
import {fundingRow,fundingDeadline} from './funding';
const permanent=new Set(['ADAPTER_UNAVAILABLE','CONFIGURATION_CHANGED','AMOUNT_MISMATCH','CURRENCY_MISMATCH','MERCHANT_MISMATCH',
  'UNKNOWN_FUNDING','LATE_PAYMENT','TERMINAL_FUNDING','CONFLICTING_EVENT','DUPLICATE_PROVIDER_REFERENCE',
  'CUSTOMER_INELIGIBLE','INVALID_PROVIDER_RESULT','INITIATION_UNCERTAIN','PROVIDER_REFERENCE_MISMATCH']);
export async function claimPaymentJob(){
  return transaction(async db=>{
    // A crashed fifth attempt must surface for review instead of being stranded.
    const exhausted=(await db.query(`UPDATE payment_processing_jobs SET state='REVIEW',safe_error='RETRY_EXHAUSTED',
      lease_token=NULL,lease_until=NULL,updated_at=now() WHERE attempts=5 AND (state='READY' OR state='LEASED' AND lease_until<now())
      RETURNING subscriber_id,funding_request_id`)).rows;
    for(const row of exhausted)if(row.funding_request_id)await paymentActivity(db,row.subscriber_id,row.funding_request_id,'payment_review_required');
    const j=(await db.query(`SELECT * FROM payment_processing_jobs WHERE attempts<5 AND
      (state='READY' AND next_attempt_at<=now() OR state='LEASED' AND lease_until<now())
      ORDER BY next_attempt_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
    if(!j)return null;
    return (await db.query(`UPDATE payment_processing_jobs SET state='LEASED',attempts=attempts+1,
      lease_token=$2,lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=$1 RETURNING *`,[j.id,randomUUID()])).rows[0];
  });
}
async function finish(j:Record<string,any>,error?:string,pending=false){
  const review=(!!error&&permanent.has(error))||(j.attempts>=5&&(!!error||pending));
  const retry=!!error&&!review||pending&&!review;
  const state=review?'REVIEW':retry?'READY':'DONE';
  await transaction(async db=>{
    const result=await db.query(`UPDATE payment_processing_jobs SET state=$3,safe_error=$4,lease_token=NULL,lease_until=NULL,
      next_attempt_at=now()+($5::integer*interval '1 second'),completed_at=CASE WHEN $3='DONE' THEN now() END,updated_at=now()
      WHERE id=$1 AND lease_token=$2 AND state='LEASED'`,[j.id,j.lease_token,state,
      review&&j.attempts>=5&&!permanent.has(error??'')?'RETRY_EXHAUSTED':error??null,Math.min(300,5*2**j.attempts)]);
    if(result.rowCount&&review&&j.funding_request_id)await paymentActivity(db,j.subscriber_id,j.funding_request_id,'payment_review_required');
  });
}
async function processEvent(j:Record<string,any>){
  const proof=await verifiedJobProof(j.id,j.lease_token),e=proof.data;
  const f=await transaction(async db=>(await db.query('SELECT * FROM payment_funding_requests WHERE subscriber_id=$1 AND id=$2 AND gateway_code=$3',[proof.tenant,e.fundingId,proof.code])).rows[0]);
  if(!f)throw Error('UNKNOWN_FUNDING');
  if(f.snapshot.merchantScope!==e.merchantScope)throw Error('MERCHANT_MISMATCH');
  if(f.payment_currency!==e.currency)throw Error('CURRENCY_MISMATCH');
  if(String(f.expected_payment_minor)!==e.amountMinor)throw Error('AMOUNT_MISMATCH');
  const reference=await transaction(async db=>(await db.query('SELECT provider_reference FROM payment_initiations WHERE funding_request_id=$1 AND subscriber_id=$2',[f.id,proof.tenant])).rows[0]?.provider_reference);
  if(reference&&reference!==e.providerReference)throw Error('PROVIDER_REFERENCE_MISMATCH');
  let paymentId:string|null;
  try{paymentId=await recordVerifiedPayment(proof);}catch(error:any){
    if(error?.status===409||error?.code==='23505')throw Error('DUPLICATE_PROVIDER_REFERENCE');
    throw error;
  }
  if(e.status!=='PAID'||!paymentId)return;
  const deadline=await transaction(db=>fundingDeadline(f,db));
  if(new Date(e.occurredAt)>deadline)throw Error('LATE_PAYMENT');
  if(!['CREATED','PENDING_PAYMENT','PAID'].includes(f.status))throw Error('TERMINAL_FUNDING');
  try{await settleVerifiedPayment(proof,paymentId);}catch(error:any){
    if(error?.status===403)throw Error('CUSTOMER_INELIGIBLE');
    if(error?.status===409)throw Error('TERMINAL_FUNDING');
    throw Error('SETTLEMENT_RETRY');
  }
}
export async function runPaymentWorkerOnce(limit=10){
  let processed=0;
  for(let n=0;n<Math.max(0,Math.min(limit,25));n++){
    const j=await claimPaymentJob();if(!j)break;processed++;
    try{
      const d=gateway(j.gateway_code);
      if(d.integrationStatus!=='AVAILABLE'||!d.adapter||d.version!==j.adapter_version)throw Error('ADAPTER_UNAVAILABLE');
      let pending=false;
      if(j.kind==='INITIATION')await createProviderPayment(j.subscriber_id,j.funding_request_id,j.id,j.lease_token);
      else if(j.kind==='EVENT')await processEvent(j);
      else{
        const {f,c,i}=await initiationContext(j.subscriber_id,j.funding_request_id);
        if(['PAID','FAILED','EXPIRED','CANCELLED'].includes(f.status)){await finish(j);continue;}
        const {result,proof}=await verifyStatusEvent(j.subscriber_id,j.gateway_code,{...creationInput(f,c),providerReference:i?.provider_reference??null});
        if(proof)await transaction(db=>enqueueVerified(proof,db));
        pending=result.state!=='FOUND'||result.event.status==='PENDING';
      }
      await finish(j,undefined,pending);
    }catch(error:any){
      const category=permanent.has(error?.message)||['PROVIDER_TIMEOUT','SETTLEMENT_RETRY'].includes(error?.message)
        ?error.message:'PROVIDER_UNAVAILABLE';
      await finish(j,category);
      // Never log provider responses, credentials, payloads, signatures or customer data.
      logger.warn({jobId:j.id,category},'Payment processing deferred');
    }
  }
  return processed;
}
export async function expireFundingRequests(limit=25){
  const ids=await transaction(async db=>(await db.query(`SELECT f.id,f.subscriber_id,f.customer_id FROM payment_funding_requests f
    LEFT JOIN payment_initiations i ON i.funding_request_id=f.id
    WHERE f.status IN ('CREATED','PENDING_PAYMENT')
     AND LEAST(f.expires_at,(i.result->>'expiresAt')::timestamptz)<=now()
    ORDER BY f.expires_at LIMIT $1`,[Math.max(1,Math.min(limit,100))])).rows);
  let count=0;
  for(const candidate of ids)await transaction(async db=>{
    // Preserve account-first money lock order, skipping busy customers/replicas.
    if(!(await db.query('SELECT id FROM public_customer_accounts WHERE subscriber_id=$1 AND id=$2 FOR UPDATE SKIP LOCKED',[candidate.subscriber_id,candidate.customer_id])).rowCount)return;
    const f=await fundingRow(candidate.subscriber_id,candidate.id,db,candidate.customer_id,true);
    const deadline=await fundingDeadline(f,db);
    if(!['CREATED','PENDING_PAYMENT'].includes(f.status)||deadline.getTime()>Date.now())return;
    if((await db.query(`SELECT 1 FROM payment_transactions WHERE funding_request_id=$1 AND status IN ('VERIFIED','SETTLED') AND provider_occurred_at<=$2
      UNION ALL SELECT 1 FROM payment_processing_jobs WHERE funding_request_id=$1 AND kind='EVENT' AND state IN ('READY','LEASED')
       AND payload->'event'->>'status'='PAID' AND payload->'event'->>'amountMinor'=$3
       AND payload->'event'->>'currency'=$4 AND (payload->'event'->>'occurredAt')::timestamptz<=$2 LIMIT 1`,
      [f.id,deadline,String(f.expected_payment_minor),f.payment_currency])).rowCount)return;
    await db.query("UPDATE payment_funding_requests SET status='EXPIRED',updated_at=now() WHERE id=$1",[f.id]);
    await paymentActivity(db,f.subscriber_id,f.id,'payment_expired');count++;
  });
  return count;
}
export function startPaymentWorker(){
  let busy=false,stopped=false;
  const tick=async()=>{
    if(busy||stopped)return;busy=true;
    try{await runPaymentWorkerOnce();await expireFundingRequests();}
    catch{logger.warn({category:'WORKER_UNAVAILABLE'},'Payment worker cycle deferred');}
    finally{busy=false;}
  };
  const timer=setInterval(()=>void tick(),5000);timer.unref();
  return ()=>{stopped=true;clearInterval(timer);};
}
