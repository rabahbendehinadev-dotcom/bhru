import {randomUUID,randomInt} from 'node:crypto';
import {transaction} from '../platform';
import {HttpError} from '../auth';
import {logger} from '../logger';
import {providerRow} from './connections';
import {decryptToken} from './credentials';
import {providerAdapter,hashValue,type ReadTransport,type CatalogItem} from './adapter';
import {ProviderError} from './transport';
import type {PoolClient} from '@workspace/db';
export function jobView(j:Record<string,any>){
  return {id:j.id,kind:j.kind,state:j.state,attempts:j.attempts,counts:j.counts,safeError:j.safe_error??null,
    createdAt:j.created_at,startedAt:j.started_at??null,completedAt:j.completed_at??null};
}
export async function enqueueProviderJob(sub:string,id:string,actor:string,kind:'SYNC'|'TEST',db:PoolClient){
  // Serialize the pending-job cap across different providers of the same tenant.
  await db.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[sub]);
  const p=await providerRow(sub,id,db,true);
  if(!p.enabled)throw new HttpError(409,'Enable this connection before testing or synchronizing.');
  const existing=(await db.query("SELECT * FROM external_provider_jobs WHERE subscriber_id=$1 AND provider_id=$2 AND state IN ('QUEUED','RUNNING')",[sub,id])).rows[0];
  if(existing)return jobView(existing);
  const pending=await db.query("SELECT id FROM external_provider_jobs WHERE subscriber_id=$1 AND state IN ('QUEUED','RUNNING')",[sub]);
  if(pending.rows.length>=10)throw new HttpError(429,'This reseller already has 10 pending provider jobs.');
  const row=(await db.query(`INSERT INTO external_provider_jobs(id,subscriber_id,provider_id,actor_id,kind,config_version)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[randomUUID(),sub,id,actor,kind,p.config_version])).rows[0];
  return jobView(row);
}
export async function claimProviderJob(){
  return transaction(async db=>{
    // Preserve provider -> job lock order, including abandoned exhausted leases.
    const exhausted=(await db.query(`SELECT p.id,p.subscriber_id,p.config_version FROM external_providers p WHERE EXISTS(
      SELECT 1 FROM external_provider_jobs j WHERE j.provider_id=p.id AND j.attempts>=4 AND
       (j.state='QUEUED' OR j.state='RUNNING' AND j.lease_until<now()))
      ORDER BY p.id LIMIT 20 FOR UPDATE OF p SKIP LOCKED`)).rows;
    for(const p of exhausted){
      const failed=await db.query(`UPDATE external_provider_jobs SET state='FAILED',safe_error='RETRY_EXHAUSTED',
        completed_at=now(),lease_token=NULL,lease_until=NULL WHERE subscriber_id=$1 AND provider_id=$2
        AND attempts>=4 AND(state='QUEUED' OR state='RUNNING' AND lease_until<now()) RETURNING config_version`,
        [p.subscriber_id,p.id]);
      if(failed.rows.some(j=>j.config_version===p.config_version))await db.query(
        "UPDATE external_providers SET health='SYNC_FAILED',safe_error='RETRY_EXHAUSTED' WHERE subscriber_id=$1 AND id=$2",
        [p.subscriber_id,p.id]);
    }
    // Serializing claims on the subscriber row makes the tenant limit safe across replicas.
    const tenant=(await db.query(`SELECT s.id FROM subscribers s WHERE EXISTS(
      SELECT 1 FROM external_provider_jobs j WHERE j.subscriber_id=s.id AND j.attempts<4
       AND(j.state='QUEUED' AND j.next_attempt_at<=now() OR j.state='RUNNING' AND j.lease_until<now()))
      AND NOT EXISTS(SELECT 1 FROM external_provider_jobs j WHERE j.subscriber_id=s.id AND j.state='RUNNING' AND j.lease_until>=now())
      ORDER BY s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED`)).rows[0];
    if(!tenant)return null;
    const j=(await db.query(`SELECT * FROM external_provider_jobs WHERE subscriber_id=$1 AND attempts<4 AND
      (state='QUEUED' AND next_attempt_at<=now() OR state='RUNNING' AND lease_until<now())
      ORDER BY next_attempt_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,[tenant.id])).rows[0];
    if(!j)return null;
    return (await db.query(`UPDATE external_provider_jobs SET state='RUNNING',attempts=attempts+1,
      started_at=coalesce(started_at,now()),lease_token=$2,lease_until=now()+interval '90 seconds'
      WHERE id=$1 RETURNING *`,[j.id,randomUUID()])).rows[0];
  });
}
export async function stageCatalog(sub:string,id:string,job:string,items:CatalogItem[],db:PoolClient){
  const prior=(await db.query('SELECT * FROM external_provider_catalog WHERE subscriber_id=$1 AND provider_id=$2',[sub,id])).rows;
  const map=new Map(prior.map(p=>[p.upstream_id,p])),seen=new Set(items.map(p=>p.upstreamId));
  const counts={fetched:items.length,new:0,changed:0,missing:0,unsupported:0};
  const rows=items.map(item=>{
    const old=map.get(item.upstreamId),changes:string[]=[];
    if(!old){counts.new++;changes.push('new');}
    else{
      for(const [label,key] of [['cost','cost'],['name','name'],['category','cid'],['categories','cids'],['category_name','categoryName'],['fields','fields'],['availability','availability'],['type','type'],['currency','currency'],['time','time'],['review','reviewReasons'],['metadata','definitionHash'],['description','description']] as const){
        if(hashValue(old.source_snapshot[key]??null)!==hashValue(item.snapshot[key]??null))changes.push(label);
      }
      if(old.missing)changes.push('returned');
      if(changes.length)counts.changed++;
    }
    if(item.reviewReasons.length)counts.unsupported++;
    return {id:old?.id??randomUUID(),upstream_id:item.upstreamId,name:item.name,service_type:item.serviceType,
      category_id:item.categoryId,category_name:item.categoryName,cost_units:item.costUnits,currency:item.currency,
      estimated_time:item.estimatedTime,requirements:item.requirements,source_snapshot:item.snapshot,source_hash:item.hash,
      previous_snapshot:old?.source_snapshot??null,changes,review_reasons:item.reviewReasons,availability:item.availability};
  });
  for(let offset=0;offset<rows.length;offset+=100){
    await db.query(`INSERT INTO external_provider_catalog(id,subscriber_id,provider_id,upstream_id,name,service_type,category_id,category_name,
      cost_units,currency,estimated_time,requirements,source_snapshot,source_hash,previous_snapshot,changes,review_reasons,availability,last_job_id)
      SELECT r.id,$1,$2,r.upstream_id,r.name,r.service_type,r.category_id,r.category_name,r.cost_units,r.currency,
       r.estimated_time,r.requirements,r.source_snapshot,r.source_hash,r.previous_snapshot,r.changes,r.review_reasons,r.availability,$3
      FROM jsonb_to_recordset($4::jsonb) AS r(id uuid,upstream_id text,name text,service_type text,category_id text,category_name text,
       cost_units numeric,currency text,estimated_time text,requirements jsonb,source_snapshot jsonb,source_hash text,
       previous_snapshot jsonb,changes jsonb,review_reasons jsonb,availability boolean)
      ON CONFLICT(subscriber_id,provider_id,upstream_id) DO UPDATE SET
       name=excluded.name,service_type=excluded.service_type,category_id=excluded.category_id,category_name=excluded.category_name,
       cost_units=excluded.cost_units,currency=excluded.currency,estimated_time=excluded.estimated_time,
       requirements=excluded.requirements,source_snapshot=excluded.source_snapshot,source_hash=excluded.source_hash,
       previous_snapshot=excluded.previous_snapshot,changes=excluded.changes,review_reasons=excluded.review_reasons,
       availability=excluded.availability,missing=false,last_job_id=excluded.last_job_id,updated_at=now()`,
      [sub,id,job,JSON.stringify(rows.slice(offset,offset+100))]);
  }
  const missing=prior.filter(p=>!seen.has(p.upstream_id)&&!p.missing).map(p=>p.id);counts.missing=missing.length;
  if(missing.length)await db.query(`UPDATE external_provider_catalog SET missing=true,changes='["missing"]',last_job_id=$3,updated_at=now()
    WHERE subscriber_id=$1 AND provider_id=$2 AND id=ANY($4::uuid[])`,[sub,id,job,missing]);
  return counts;
}
export async function runProviderJob(j:Record<string,any>,read?:ReadTransport){
  try{
    const p=await transaction(db=>providerRow(j.subscriber_id,j.provider_id,db));
    if(!p.enabled||p.config_version!==j.config_version)throw new ProviderError('CONFIGURATION_CHANGED');
    const token=decryptToken(p.subscriber_id,p.id,p.credentials_encrypted),adapter=providerAdapter(p.protocol);
    const account=j.kind==='TEST'?await adapter.account(p.base_url,token,read):null;
    const catalog=j.kind==='SYNC'?await adapter.catalog(p.base_url,token,read):null;
    const currency=account?.currency??catalog?.currency??null;
    if(p.currency&&currency&&p.currency!==currency)throw new ProviderError('INVALID_RESPONSE');
    await transaction(async db=>{
      const current=await providerRow(p.subscriber_id,p.id,db,true);
      const owned=(await db.query(`SELECT id FROM external_provider_jobs WHERE id=$1 AND lease_token=$2 AND state='RUNNING' AND lease_until>now() FOR UPDATE`,[j.id,j.lease_token])).rowCount;
      if(!owned)return;
      if(!current.enabled||current.config_version!==j.config_version)throw new ProviderError('CONFIGURATION_CHANGED');
      const counts=catalog?await stageCatalog(p.subscriber_id,p.id,j.id,catalog.items,db):{};
      await db.query(`UPDATE external_providers SET currency=coalesce($3,currency),health='CONNECTED',safe_error=NULL,
        balance=CASE WHEN $4::text IS NOT NULL THEN $4 ELSE balance END,
        last_test_at=CASE WHEN $5 THEN now() ELSE last_test_at END,
        last_sync_at=CASE WHEN $5 THEN last_sync_at ELSE now() END,updated_at=now() WHERE subscriber_id=$1 AND id=$2`,
        [p.subscriber_id,p.id,currency,account?.balance??null,j.kind==='TEST']);
      await db.query(`UPDATE external_provider_jobs SET state=$3,counts=$4,completed_at=now(),safe_error=NULL,
        lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2`,
        [j.id,j.lease_token,catalog?.items.some(i=>i.reviewReasons.length)?'COMPLETED_WITH_WARNINGS':'COMPLETED',counts]);
    });
  }catch(error){
    const category=error instanceof ProviderError?error.category:error instanceof HttpError&&error.status===503?'CREDENTIALS_UNAVAILABLE':'INVALID_RESPONSE';
    const safeError=error instanceof ProviderError?error.safeError:category;
    const retry=error instanceof ProviderError&&error.retryable&&j.attempts<4;
    await transaction(async db=>{
      // Same lock order as configuration and successful finalization.
      await providerRow(j.subscriber_id,j.provider_id,db,true);
      const result=await db.query(`UPDATE external_provider_jobs SET state=$3,safe_error=$4,
        completed_at=CASE WHEN $3='FAILED' THEN now() ELSE NULL END,lease_token=NULL,lease_until=NULL,
         next_attempt_at=now()+($5::integer*interval '1 second') WHERE id=$1 AND lease_token=$2 AND state='RUNNING' AND lease_until>now()`,
        [j.id,j.lease_token,retry?'QUEUED':'FAILED',safeError,Math.min(300,5*2**j.attempts+randomInt(0,6))]);
      if(result.rowCount)await db.query(`UPDATE external_providers SET health=$3,safe_error=$4,updated_at=now()
        WHERE subscriber_id=$1 AND id=$2 AND config_version=$5`,
        [j.subscriber_id,j.provider_id,['AUTH_FAILED','AUTHENTICATION_FAILED','UNSUPPORTED_PROVIDER','UNREACHABLE','INVALID_RESPONSE'].includes(category)?category:'SYNC_FAILED',safeError,j.config_version]);
    });
  }
}
export async function runProviderWorkerOnce(read?:ReadTransport){
  const job=await claimProviderJob();if(!job)return false;await runProviderJob(job,read);return true;
}
export function startProviderWorker(){
  let busy=false,stopped=false;
  const timer=setInterval(async()=>{
    if(busy||stopped)return;busy=true;
    try{await runProviderWorkerOnce();}catch{logger.warn({category:'PROVIDER_WORKER_UNAVAILABLE'},'Provider job processing deferred');}
    finally{busy=false;}
  },3000);timer.unref();
  return ()=>{stopped=true;clearInterval(timer);};
}
