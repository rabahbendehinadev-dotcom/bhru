import {createHash} from 'node:crypto';
import {z} from '@workspace/api-zod';
import {transaction} from '../platform';
import {HttpError} from '../auth';
import {gateway,operational,type VerifiedCallback} from './registry';
import {decryptCredentials} from './credentials';
const receipt=z.object({
  fundingId:z.string().uuid(),providerReference:z.string().min(1).max(180),eventId:z.string().min(1).max(180),
  merchantScope:z.string().min(1).max(180),amountMinor:z.string().regex(/^[1-9]\d{0,18}$/),
  currency:z.string().regex(/^[A-Z]{3}$/),status:z.enum(['PAID','FAILED','PENDING']),
  occurredAt:z.string().datetime({offset:true}),
}).strict();
export interface VerifiedPayment {readonly tenant:string;readonly code:string;readonly data:Readonly<VerifiedCallback>;readonly version:string;readonly payloadDigest:string}
const capabilities=new WeakSet<object>();
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
    data=receipt.parse(await d.adapter!.verifyCallback(raw,headers,credentials));
    if(data.merchantScope!==await d.adapter!.merchantScope(credentials))throw Error();
  }catch{throw new HttpError(400,'Provider verification failed.');}
  if(new Date(data.occurredAt).getTime()>Date.now()+300000)throw new HttpError(400,'Provider event time is invalid.');
  const proof=Object.freeze({tenant,code,data:Object.freeze(data),version:d.version,payloadDigest:createHash('sha256').update(raw).digest('hex')});
  capabilities.add(proof);return proof;
}
