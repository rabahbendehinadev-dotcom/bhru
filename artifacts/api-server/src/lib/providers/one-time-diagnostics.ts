import {randomUUID} from 'node:crypto';
import type {PoolClient} from '@workspace/db';
import {HttpError,type AuthUser} from '../auth';
import {audit} from '../platform';
import {providerRow} from './connections';
import {jobView} from './worker';
import {logger} from '../logger';
import type {AccountResponseDiagnostic} from './legacy-account-response-diagnostics';
import type {Request,Response,NextFunction} from 'express';

export function auditDiagnosticRejection(req:Request,res:Response,next:NextFunction){
  if(req.method==='POST'&&/^\/api\/external-providers\/[^/]+\/diagnostic-test$/.test(req.path)){
    res.once('finish',()=>{
      if(res.statusCode>=400)req.log.warn({diagnosticCode:'DIAGNOSTIC_ACTION_DENIED',
        requestId:req.id,status:res.statusCode,adminId:req.adminAuth?.id??null,
        tenantId:req.subscriberAuth?.subscriber_id??null},'Diagnostic action rejected by request protections');
    });
  }
  next();
}

export async function enqueueDiagnosticTest(db:PoolClient,owner:AuthUser,admin:AuthUser,
  providerId:string,requestKey:string){
  if(owner.admin||!admin.admin)throw new HttpError(403,'Independent administrator and subscriber sessions are required.');
  const sub=owner.subscriber_id;
  await db.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[sub]);
  const p=await providerRow(sub,providerId,db,true);
  const prior=(await db.query(`SELECT a.*,j.actor_id FROM external_provider_test_authorizations a
    JOIN external_provider_jobs j ON j.id=a.job_id WHERE a.subscriber_id=$1 AND a.admin_actor_id=$2 AND a.request_key=$3`,
    [sub,admin.id,requestKey])).rows[0];
  if(prior){
    if(prior.provider_id!==providerId||prior.actor_id!==owner.id)throw new HttpError(409,'Idempotency key belongs to another diagnostic request.');
    return jobView((await db.query('SELECT * FROM external_provider_jobs WHERE id=$1',[prior.job_id])).rows[0]);
  }
  if(!p.enabled||p.protocol!=='DHRU_FUSION_LEGACY_V61')
    throw new HttpError(409,'Select an enabled saved Legacy provider.');
  const pending=(await db.query(`SELECT provider_id FROM external_provider_jobs WHERE subscriber_id=$1
    AND state IN ('QUEUED','RUNNING')`,[sub])).rows;
  if(pending.some(j=>j.provider_id===providerId))throw new HttpError(409,'A TEST or SYNC already exists for this provider. No diagnostic authorization was attached.');
  if(pending.length>=10)throw new HttpError(429,'This reseller already has 10 pending provider jobs.');
  const id=randomUUID();
  const j=(await db.query(`INSERT INTO external_provider_jobs(id,subscriber_id,provider_id,actor_id,kind,config_version)
    VALUES($1,$2,$3,$4,'TEST',$5) RETURNING *`,[id,sub,providerId,owner.id,p.config_version])).rows[0];
  await db.query(`INSERT INTO external_provider_test_authorizations(subscriber_id,provider_id,job_id,admin_actor_id,request_key)
    VALUES($1,$2,$3,$4,$5)`,[sub,providerId,id,admin.id,requestKey]);
  await audit(db,admin,'Diagnostic TEST authorized','external_provider_job',id,'Single-use Legacy account classifications; expires in five minutes');
  return jobView(j);
}
async function tableAvailable(db:PoolClient){
  return !!(await db.query("SELECT to_regclass('public.external_provider_test_authorizations') AS available")).rows[0]?.available;
}
/** Called only inside the existing claim transaction, after the job lease is acquired. */
export async function consumeDiagnosticAuthorization(db:PoolClient,j:Record<string,any>){
  if(!await tableAvailable(db))return j; // Normal operations on pre-034 databases stay unchanged.
  const a=(await db.query(`SELECT *,expires_at>now() AS fresh FROM external_provider_test_authorizations
    WHERE subscriber_id=$1 AND provider_id=$2 AND job_id=$3 FOR UPDATE`,
    [j.subscriber_id,j.provider_id,j.id])).rows[0];
  if(!a)return j;
  const actor:AuthUser={id:a.admin_actor_id,admin:true,subscriber_id:null,full_name:''};
  if(a.state!=='AUTHORIZED'||!a.fresh||j.kind!=='TEST'||j.attempts!==1){
    const expired=a.state==='AUTHORIZED'&&!a.fresh;
    await db.query(`UPDATE external_provider_test_authorizations SET state=$2 WHERE job_id=$1`,[j.id,expired?'EXPIRED':'REJECTED']);
    await db.query(`UPDATE external_provider_jobs SET state='FAILED',safe_error=$2,completed_at=now(),
      lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$3`,
      [j.id,expired?'DIAGNOSTIC_AUTHORIZATION_EXPIRED':'DIAGNOSTIC_PERMIT_NOT_REISSUED',j.lease_token]);
    await audit(db,actor,expired?'Diagnostic TEST authorization expired':'Diagnostic TEST claim rejected',
      'external_provider_job',j.id,'No supplier request sent');
    return null;
  }
  await db.query(`UPDATE external_provider_test_authorizations SET state='CONSUMED',consumed_at=now(),permit_lease=$2
    WHERE job_id=$1`,[j.id,j.lease_token]);
  await audit(db,actor,'Diagnostic TEST authorization consumed','external_provider_job',j.id,'Permit bound to first worker lease');
  return {...j,oneTimeDiagnostic:true,diagnosticExpiresAt:a.expires_at};
}
/** Revalidate before upstream I/O and finalization; never authorize from a caller boolean alone. */
export async function verifyDiagnosticPermit(db:PoolClient,j:Record<string,any>){
  const a=(await db.query(`SELECT a.*,a.expires_at>now() AS fresh FROM external_provider_test_authorizations a
    JOIN external_provider_jobs j ON j.id=a.job_id AND j.subscriber_id=a.subscriber_id AND j.provider_id=a.provider_id
    WHERE a.subscriber_id=$1 AND a.provider_id=$2 AND a.job_id=$3 AND j.kind='TEST'
      AND j.state='RUNNING' AND j.attempts=1 AND j.lease_token=$4 AND j.lease_until>now()
    FOR UPDATE OF a`,[j.subscriber_id,j.provider_id,j.id,j.lease_token])).rows[0];
  if(a?.state==='CONSUMED'&&a.permit_lease===j.lease_token&&a.fresh)return true;
  if(a&&a.state!==(a.fresh?'REJECTED':'EXPIRED')){
    await db.query("UPDATE external_provider_test_authorizations SET state=$2 WHERE job_id=$1",
      [j.id,a.fresh?'REJECTED':'EXPIRED']);
    await audit(db,{id:a.admin_actor_id,admin:true,subscriber_id:null,full_name:''},
      a.fresh?'Diagnostic TEST permit rejected':'Diagnostic TEST authorization expired','external_provider_job',j.id,
      'No classification output authorized');
  }
  return false;
}
export function logOneTimeDiagnostic(j:Record<string,any>,d:AccountResponseDiagnostic){
  const expiry=new Date(j.diagnosticExpiresAt).getTime();
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!Number.isFinite(expiry)||Date.now()>=expiry||![j.subscriber_id,j.provider_id,j.id].every(x=>typeof x==='string'&&uuid.test(x))||
    !['JSON','HTML','XML','MALFORMED_JSON'].includes(d.response)||
    !['MISSING','SUPPORTED_6_1','OBSERVED_2023_21','OTHER_STRING','MALFORMED'].includes(d.version)||
    !['VALID','INVALID'].includes(d.success)||!['VALID','INVALID'].includes(d.account)||
    !['VALID','MISSING','NULL','INVALID'].includes(d.currency)||!['VALID','MISSING','NULL','INVALID'].includes(d.credit))return;
  // d is produced internally by the fixed classifier, never from API/upstream objects.
  logger.info({diagnosticCode:'LEGACY_ACCOUNT_RESPONSE_CLASSIFICATION',tenantId:j.subscriber_id,
    providerId:j.provider_id,jobId:j.id,response:d.response,version:d.version,success:d.success,
    account:d.account,currency:d.currency,credit:d.credit},'Authorized one-time Legacy account response classification');
}
export async function rejectChangedDiagnostic(db:PoolClient,j:Record<string,any>){
  const a=(await db.query(`UPDATE external_provider_test_authorizations SET state='REJECTED'
    WHERE subscriber_id=$1 AND provider_id=$2 AND job_id=$3 AND state='CONSUMED' AND permit_lease=$4
    RETURNING admin_actor_id`,[j.subscriber_id,j.provider_id,j.id,j.lease_token])).rows[0];
  if(a)await audit(db,{id:a.admin_actor_id,admin:true,subscriber_id:null,full_name:''},
    'Diagnostic TEST configuration rejected','external_provider_job',j.id,'Provider configuration changed; no classification authorized');
}
