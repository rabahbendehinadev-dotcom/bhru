import type {PoolClient} from '@workspace/db';
import {z} from '@workspace/api-zod';
import {HttpError} from '../auth';
import {gateway,gatewayDefinitions,implemented,operational} from './registry';
import {credentialStorageReady,encryptCredentials,decryptCredentials} from './credentials';
import {fundingUnits} from './decimal';
import {transaction} from '../platform';
import {providerCall} from './contract';
export const configInput=z.object({
  enabled:z.boolean(),instructions:z.string().trim().max(1000),
  currencyRules:z.array(z.object({currency:z.string().regex(/^[A-Z]{3}$/),minimum:z.string(),maximum:z.string(),
    feeBps:z.number().int().min(0).max(10000),fixedFee:z.string()}).strict()).max(30),
  credentials:z.record(z.string(),z.string().min(1).max(4096)).optional(),
}).strict();
export async function policy(code:string,db:PoolClient,lock=false){
  const r=(await db.query(`SELECT * FROM payment_gateway_policies WHERE gateway_code=$1 ${lock?'FOR SHARE':''}`,[code])).rows[0];
  if(!r)throw new HttpError(404,'Gateway not installed.');return r;
}
export function gatewayView(code:string,p:Record<string,any>,c?:Record<string,any>){
  const definition=gateway(code),{adapter:_private,...d}=definition;
  return {...d,globalEnabled:p.global_enabled,resellerAvailable:p.reseller_available,
    operational:implemented(definition)&&p.global_enabled&&p.reseller_available,
    enabled:c?.enabled??false,instructions:c?.instructions??'',currencyRules:c?.currency_rules??[],
    capabilities:definition.adapter?.capabilities??{createPayment:false,idempotentCreation:false,statusLookup:false,webhookVerification:false,cancelPayment:false,refundPayment:false},
    callbackPath:c?.callback_binding?`/api/payments/webhooks/${code}/${c.callback_binding}`:null,
    configuredCredentialFields:c?.credential_fields??[],
    validationStatus:!implemented(definition)?'NOT_IMPLEMENTED':c?.validation_status??'NOT_CONFIGURED'};
}
export async function listGateways(db:PoolClient,tenant?:string){
  const policies=(await db.query('SELECT * FROM payment_gateway_policies')).rows;
  const configs=tenant?(await db.query('SELECT * FROM reseller_payment_gateways WHERE subscriber_id=$1',[tenant])).rows:[];
  return {credentialStorageReady:credentialStorageReady(),data:gatewayDefinitions.flatMap(d=>{
    const p=policies.find(p=>p.gateway_code===d.code);
    return p&&(!tenant||p.reseller_available)?[gatewayView(d.code,p,configs.find(c=>c.gateway_code===d.code))]:[];
  })};
}
export async function configureGateway(tenant:string,code:string,raw:unknown,db:PoolClient){
  const d=gateway(code),input=configInput.parse(raw),p=await policy(code,db,true);
  if(!p.reseller_available)throw new HttpError(404,'Gateway is not available to this reseller.');
  await db.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[tenant]);
  const previous=(await db.query('SELECT * FROM reseller_payment_gateways WHERE subscriber_id=$1 AND gateway_code=$2 FOR UPDATE',[tenant,code])).rows[0];
  if(input.enabled&&(!p.global_enabled||!implemented(d)))throw new HttpError(409,'Gateway is not integrated or globally enabled.');
  const replaceCredentials=input.credentials&&Object.keys(input.credentials).length>0;
  if(replaceCredentials&&!implemented(d))throw new HttpError(409,'Credentials cannot be configured until the adapter is implemented.');
  if(new Set(input.currencyRules.map(r=>r.currency)).size!==input.currencyRules.length)throw new HttpError(400,'Duplicate payment currency.');
  const configured=(await db.query('SELECT code,enabled,decimals FROM subscriber_currencies WHERE subscriber_id=$1',[tenant])).rows;
  for(const r of input.currencyRules){
    const c=configured.find(c=>c.code===r.currency&&c.enabled);
    if(!d.supportedCurrencies.includes(r.currency)||!c)throw new HttpError(400,'Payment currency is not supported or configured.');
    const min=fundingUnits(r.minimum),max=fundingUnits(r.maximum),fee=fundingUnits(r.fixedFee),q=10n**BigInt(12-c.decimals);
    if(min>max||max===0n||min%q||max%q||fee%q)throw new HttpError(400,'Invalid payment-currency limits or precision.');
    if(!d.feesSupported&&(r.feeBps!==0||fee!==0n))throw new HttpError(400,'This adapter does not support customer fees.');
  }
  let encrypted=previous?.credentials_encrypted??null,fields=previous?.credential_fields??[];
  if(replaceCredentials){
    if(Object.keys(input.credentials!).some(k=>!d.requiredCredentials.some(f=>f.key===k)))
      throw new HttpError(400,'Credential fields do not match the installed adapter.');
    const outstanding=(await db.query(`SELECT 1 FROM payment_funding_requests f WHERE subscriber_id=$1 AND gateway_code=$2
      AND (status IN ('CREATED','PENDING_PAYMENT') OR EXISTS(SELECT 1 FROM payment_transactions t WHERE t.funding_request_id=f.id AND t.status='VERIFIED')) LIMIT 1`,[tenant,code])).rowCount;
    const unsettledJobs=(await db.query("SELECT 1 FROM payment_processing_jobs WHERE subscriber_id=$1 AND gateway_code=$2 AND state IN ('READY','LEASED','REVIEW') LIMIT 1",[tenant,code])).rowCount;
    if(outstanding||unsettledJobs)throw new HttpError(409,'Resolve outstanding funding and processing review before replacing credentials.');
    const merged={...decryptCredentials(tenant,code,encrypted),...input.credentials};
    if(d.requiredCredentials.some(f=>f.required&&!merged[f.key]))throw new HttpError(400,'Required credential fields are missing.');
    encrypted=encryptCredentials(tenant,code,merged);fields=Object.keys(merged);
  }
  if(input.enabled&&(input.currencyRules.length===0||d.requiredCredentials.some(f=>f.required&&!fields.includes(f.key))))
    throw new HttpError(400,'Required credentials and payment currencies must be configured before activation.');
  const row=(await db.query(`INSERT INTO reseller_payment_gateways(subscriber_id,gateway_code,enabled,instructions,currency_rules,credentials_encrypted,credential_fields,validation_status)
    VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) ON CONFLICT(subscriber_id,gateway_code) DO UPDATE SET
    enabled=EXCLUDED.enabled,instructions=EXCLUDED.instructions,currency_rules=EXCLUDED.currency_rules,
    credentials_encrypted=EXCLUDED.credentials_encrypted,credential_fields=EXCLUDED.credential_fields,
    validation_status=CASE WHEN $9 THEN 'NOT_VALIDATED' ELSE reseller_payment_gateways.validation_status END,
    revision=reseller_payment_gateways.revision+1,updated_at=now() RETURNING *`,
    [tenant,code,input.enabled,input.instructions,JSON.stringify(input.currencyRules),encrypted==null?null:JSON.stringify(encrypted),fields,
      implemented(d)?'NOT_VALIDATED':'NOT_IMPLEMENTED',!!replaceCredentials])).rows[0];
  return gatewayView(code,p,row);
}
export async function validateGateway(tenant:string,code:string){
  const d=operational(gateway(code));
  const row=await transaction(async db=>{
    const p=await policy(code,db);
    if(!p.global_enabled||!p.reseller_available)throw new HttpError(409,'Gateway is unavailable.');
    const c=(await db.query('SELECT * FROM reseller_payment_gateways WHERE subscriber_id=$1 AND gateway_code=$2',[tenant,code])).rows[0];
    if(!c)throw new HttpError(404,'Gateway configuration not found.');return c;
  });
  let valid=false;try{
    const credentials=decryptCredentials(tenant,code,row.credentials_encrypted);
    valid=await providerCall(signal=>d.adapter!.validateConfiguration?d.adapter!.validateConfiguration(credentials,signal):d.adapter!.validateCredentials(credentials));
  }
  catch{throw new HttpError(502,'Provider validation could not complete.');}
  return transaction(async db=>{
    const p=await policy(code,db,true);
    if(!p.global_enabled||!p.reseller_available)throw new HttpError(409,'Gateway is unavailable.');
    const updated=(await db.query("UPDATE reseller_payment_gateways SET validation_status=$3,updated_at=now() WHERE subscriber_id=$1 AND gateway_code=$2 AND revision=$4 RETURNING *",[tenant,code,valid?'VALID':'INVALID',row.revision])).rows[0];
    if(!updated)throw new HttpError(409,'Configuration changed during validation. Validate the current credentials.');
    return gatewayView(code,p,updated);
  });
}
