import {createHash} from 'node:crypto';
import {z} from '@workspace/api-zod';
import {transaction} from '../platform';
import {HttpError} from '../auth';
import {gateway,operational,type VerifiedCallback} from './registry';
import {decryptCredentials} from './credentials';
import {normalizedEvent,providerCall,providerStatus} from './contract';
const receipt=z.object({
  fundingId:z.string().uuid(),providerReference:z.string().min(1).max(180),eventId:z.string().min(1).max(180),
  merchantScope:z.string().min(1).max(180),amountMinor:z.string().regex(/^[1-9]\d{0,18}$/),
  currency:z.string().regex(/^[A-Z]{3}$/),status:z.enum(['PAID','FAILED','PENDING']),
  occurredAt:z.string().datetime({offset:true}),
}).strict();
export interface VerifiedPayment {readonly tenant:string;readonly code:string;readonly data:Readonly<VerifiedCallback>;readonly version:string;readonly payloadDigest:string}
const capabilities=new WeakSet<object>();
const authenticatedReviews=new WeakSet<object>();
export class AuthenticatedWebhookMismatch extends HttpError{
  constructor(readonly evidence:VerifiedPayment){super(400,'Provider verification failed.');}
}
export function assertAuthenticatedReview(error:AuthenticatedWebhookMismatch){
  if(!authenticatedReviews.has(error))throw new HttpError(403,'Authenticated review evidence required.');
}
export function assertVerified(proof:VerifiedPayment){
  if(!proof||!capabilities.has(proof))throw new HttpError(403,'A trusted adapter verification is required.');
}
/** No HTTP route in Slice 5A. A future gateway-specific route must preserve raw
 * bytes and authentic headers, resolve tenant from trusted callback binding and
 * invoke this dispatcher, never accept a caller-supplied verified boolean.
 */
export async function verifyGatewayCallback(tenant:string,code:string,raw:Buffer,headers:Readonly<Record<string,string>>):Promise<VerifiedPayment>{
  const d=operational(gateway(code));
  if(raw.length>262144)throw new HttpError(413,'Callback is too large.');
  const config=await transaction(async db=>(await db.query('SELECT credentials_encrypted FROM reseller_payment_gateways WHERE subscriber_id=$1 AND gateway_code=$2',[tenant,code])).rows[0]);
  if(!config)throw new HttpError(404,'Gateway configuration not found.');
  let data:VerifiedCallback;
  try{
    const credentials=decryptCredentials(tenant,code,config.credentials_encrypted);
    const adapter=d.adapter!;
    if(adapter.capabilities?.webhookVerification){
      if(!adapter.verifyWebhook||!adapter.normalizeWebhookEvent)throw Error();
      await providerCall(signal=>adapter.verifyWebhook!(raw,headers,credentials,signal));
      data=normalizedEvent.parse(await adapter.normalizeWebhookEvent(raw,credentials));
    }else data=receipt.parse(await adapter.verifyCallback(raw,headers,credentials));
    if(data.merchantScope!==await d.adapter!.merchantScope(credentials)){
      if(!adapter.capabilities?.webhookVerification||new Date(data.occurredAt).getTime()>Date.now()+300000)throw Error();
      const error=new AuthenticatedWebhookMismatch(Object.freeze({tenant,code,data:Object.freeze(data),version:d.version,
        payloadDigest:createHash('sha256').update(raw).digest('hex')}));
      authenticatedReviews.add(error);throw error;
    }
  }catch(error){if(error instanceof AuthenticatedWebhookMismatch)throw error;throw new HttpError(400,'Provider verification failed.');}
  if(new Date(data.occurredAt).getTime()>Date.now()+300000)throw new HttpError(400,'Provider event time is invalid.');
  const proof=Object.freeze({tenant,code,data:Object.freeze(data),version:d.version,payloadDigest:createHash('sha256').update(raw).digest('hex')});
  capabilities.add(proof);return proof;
}
/** Restore ONLY durable authenticated evidence, never a request-supplied object.
 * Job evidence is SQL-immutable; lease tokens fence competing worker replicas. */
export async function verifiedJobProof(id:string,lease:string):Promise<VerifiedPayment>{
  const job=await transaction(async db=>(await db.query(`SELECT * FROM payment_processing_jobs
    WHERE id=$1 AND lease_token=$2 AND state='LEASED' AND lease_until>clock_timestamp()
    AND kind='EVENT' AND authenticated_at IS NOT NULL`,[id,lease])).rows[0]);
  if(!job)throw new HttpError(409,'Authenticated event lease is unavailable.');
  const d=operational(gateway(job.gateway_code));
  if(d.version!==job.adapter_version)throw new HttpError(409,'Adapter verification version requires review.');
  const data=normalizedEvent.parse(job.payload.event);
  const proof=Object.freeze({tenant:job.subscriber_id,code:d.code,data:Object.freeze(data),version:d.version,payloadDigest:job.payload.digest});
  capabilities.add(proof);return proof;
}
/** Only a trusted adapter status lookup may authenticate a polling result. */
export async function verifyStatusEvent(tenant:string,code:string,lookup:import('./contract').PaymentLookup){
  const d=operational(gateway(code)),a=d.adapter!;
  if(!a.capabilities?.statusLookup||!a.getPaymentStatus)throw new HttpError(409,'Verified status lookup is not supported.');
  const config=await transaction(async db=>(await db.query('SELECT credentials_encrypted FROM reseller_payment_gateways WHERE subscriber_id=$1 AND gateway_code=$2',[tenant,code])).rows[0]);
  if(!config)throw new HttpError(404,'Gateway configuration not found.');
  const credentials=decryptCredentials(tenant,code,config.credentials_encrypted);
  const parsed=providerStatus.safeParse(await providerCall(signal=>a.getPaymentStatus!(lookup,credentials,signal)));
  if(!parsed.success)throw Error('INVALID_PROVIDER_RESULT');
  const result=parsed.data;
  if(result.state!=='FOUND')return {result,proof:null};
  const data=normalizedEvent.parse(result.event);
  if(data.merchantScope!==await a.merchantScope(credentials)||data.fundingId!==lookup.fundingId
    ||new Date(data.occurredAt).getTime()>Date.now()+300000)throw new HttpError(409,'Provider status identity does not match.');
  const proof=Object.freeze({tenant,code,data:Object.freeze(data),version:d.version,payloadDigest:createHash('sha256').update(JSON.stringify(data)).digest('hex')});
  capabilities.add(proof);return {result,proof};
}
