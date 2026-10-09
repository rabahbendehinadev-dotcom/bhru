import {transaction} from '../platform';
import {HttpError} from '../auth';
import {createFunding,fundingRow,fundingView} from './funding';
import {gateway,operational} from './registry';
import {providerCall,providerPayment,type PaymentCreation,type ProviderPayment} from './contract';
import {decryptCredentials,encryptCredentials} from './credentials';
import {enqueue,paymentActivity} from './queue';
import {lockClient} from '../client-finance/wallet';
/** Persist the obligation before HTTP. A worker handles slow provider calls. */
export async function initiateFunding(tenant:string,customer:string,body:unknown){
  return transaction(async db=>{
    const f=await createFunding(tenant,customer,body,db),d=operational(gateway(f.gatewayCode));
    if(!d.adapter?.capabilities?.createPayment||!d.adapter.createPayment)throw new HttpError(409,'Payment initiation is not implemented.');
    await db.query(`INSERT INTO payment_initiations(funding_request_id,subscriber_id,customer_id,gateway_code)
      VALUES($1,$2,$3,$4) ON CONFLICT(funding_request_id) DO NOTHING`,[f.id,tenant,customer,d.code]);
    await enqueue(db,tenant,d.code,'INITIATION',f.id,f.id,d.version);
    return fundingView(await fundingRow(tenant,f.id,db,customer),db);
  });
}
export async function initiationContext(tenant:string,id:string){
  return transaction(async db=>{
    const f=await fundingRow(tenant,id,db);
    const c=(await db.query(`SELECT c.*,p.global_enabled,p.reseller_available FROM reseller_payment_gateways c
      JOIN payment_gateway_policies p USING(gateway_code) WHERE c.subscriber_id=$1 AND c.gateway_code=$2`,[tenant,f.gateway_code])).rows[0];
    const i=(await db.query('SELECT * FROM payment_initiations WHERE subscriber_id=$1 AND funding_request_id=$2',[tenant,id])).rows[0];
    const active=(await db.query("SELECT enabled FROM public_customer_accounts WHERE subscriber_id=$1 AND id=$2",[tenant,f.customer_id])).rows[0]?.enabled===true;
    return {f,c,i,active};
  });
}
export function creationInput(f:Record<string,any>,c:Record<string,any>):PaymentCreation{
  return {fundingId:f.id,idempotencyKey:f.id,merchantScope:f.snapshot.merchantScope,amountMinor:String(f.expected_payment_minor),
    currency:f.payment_currency,method:f.payment_method,expiresAt:new Date(f.expires_at).toISOString(),
    callbackPath:`/api/payments/webhooks/${f.gateway_code}/${c.callback_binding}`};
}
export function validateProviderPayment(raw:unknown,input:PaymentCreation,code:string,credentials:Readonly<Record<string,string>>):ProviderPayment{
  const a=gateway(code).adapter!,parsed=providerPayment.safeParse(raw);
  if(!parsed.success)throw Error('INVALID_PROVIDER_RESULT');
  const p=parsed.data;
  if(p.merchantScope!==input.merchantScope||p.amountMinor!==input.amountMinor||p.currency!==input.currency
    ||Date.parse(p.expiresAt)<=Date.now()||Date.parse(p.expiresAt)>Date.parse(input.expiresAt))throw Error('INVALID_PROVIDER_RESULT');
  if(p.paymentUrl){
    const url=new URL(p.paymentUrl);
    if(url.protocol!=='https:'||url.username||url.password||!a.checkoutHosts?.includes(url.hostname))throw Error('INVALID_PROVIDER_RESULT');
  }
  if(Object.keys(p.metadata).some(k=>!a.metadataKeys?.includes(k)||/secret|token|key|cookie|authorization|card|cvv|payload/i.test(k)))throw Error('INVALID_PROVIDER_RESULT');
  const output=JSON.stringify(p);
  if(gateway(code).requiredCredentials.some(c=>c.secret&&credentials[c.key]&&output.includes(credentials[c.key]!)))throw Error('INVALID_PROVIDER_RESULT');
  return p;
}
export async function createProviderPayment(tenant:string,id:string,jobId:string,lease:string){
  const {f,c,i,active}=await initiationContext(tenant,id),d=operational(gateway(f.gateway_code)),a=d.adapter!;
  if(i?.result)return;
  if(!active)throw Error('CUSTOMER_INELIGIBLE');
  if(!['CREATED','PENDING_PAYMENT'].includes(f.status)||new Date(f.expires_at).getTime()<=Date.now())throw Error('TERMINAL_FUNDING');
  if(!c?.enabled||!c.global_enabled||!c.reseller_available||c.validation_status!=='VALID'
    ||c.revision!==f.snapshot.configurationRevision)throw Error('CONFIGURATION_CHANGED');
  if(!a.capabilities?.createPayment||!a.createPayment)throw Error('ADAPTER_UNAVAILABLE');
  const credentials=decryptCredentials(tenant,d.code,c.credentials_encrypted),input=creationInput(f,c);
  if(await a.merchantScope(credentials)!==input.merchantScope)throw Error('MERCHANT_MISMATCH');
  // Fenced claim precedes the external side effect. After ambiguous creation,
  // non-idempotent providers may only recover by reference, never create again.
  const first=await transaction(async db=>{
    const job=(await db.query("SELECT id FROM payment_processing_jobs WHERE id=$1 AND lease_token=$2 AND state='LEASED' AND lease_until>clock_timestamp() FOR UPDATE",[jobId,lease])).rows[0];
    if(!job)throw Error('INITIATION_UNCERTAIN');
    const r=await db.query('UPDATE payment_initiations SET creation_started_at=now() WHERE funding_request_id=$1 AND creation_started_at IS NULL',[id]);
    return !!r.rowCount;
  });
  let raw:ProviderPayment;
  if(!first&&!a.capabilities.idempotentCreation){
    if(!a.capabilities.statusLookup||!a.getPaymentStatus)throw Error('INITIATION_UNCERTAIN');
    const found=await providerCall(signal=>a.getPaymentStatus!({...input,providerReference:i.provider_reference},credentials,signal));
    if(found.state!=='FOUND'||!found.payment)throw Error('INITIATION_UNCERTAIN');
    raw=found.payment;
  }else raw=await providerCall(signal=>a.createPayment!(input,credentials,signal));
  const result=validateProviderPayment(raw,input,d.code,credentials),{metadata,...safe}=result;
  await transaction(async db=>{
    await lockClient(tenant,f.customer_id,db);
    const row=await fundingRow(tenant,id,db,f.customer_id,true);
    const current=(await db.query("SELECT id FROM payment_processing_jobs WHERE id=$1 AND lease_token=$2 AND state='LEASED' AND lease_until>clock_timestamp() FOR UPDATE",[jobId,lease])).rows[0];
    if(!current)throw Error('INITIATION_UNCERTAIN');
    await db.query(`UPDATE payment_initiations SET provider_reference=$2,result=$3::jsonb,provider_metadata_encrypted=$4::jsonb,updated_at=now() WHERE funding_request_id=$1 AND result IS NULL`,
      [id,result.providerReference,JSON.stringify(safe),JSON.stringify(encryptCredentials(tenant,`payment-metadata:${d.code}:${id}`,{metadata:JSON.stringify(metadata)}))]);
    if(row.status==='CREATED')await db.query("UPDATE payment_funding_requests SET status='PENDING_PAYMENT',updated_at=now() WHERE id=$1",[id]);
    await paymentActivity(db,tenant,id,'payment_initiated');
    if(a.capabilities?.statusLookup)await enqueue(db,tenant,d.code,'STATUS',id,id,d.version);
  });
}
