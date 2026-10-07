import {randomBytes,randomUUID} from 'node:crypto';
import {pool,type PoolClient} from '@workspace/db';
import {transaction} from '../platform';
import {HttpError} from '../auth';
import {domainConfig,domainAllowance,validateCustomerDomain,dnsInstructions} from './config';
import {collectDns,probeTLS,type DomainRow} from './evidence';
type DB=Pick<PoolClient,'query'>;
export const domainActive=(r:DomainRow)=>r.verification_status==='verified'&&r.dns_status==='ready'&&r.tls_status==='ready'&&!!r.dns_checked_at&&Date.now()-r.dns_checked_at.getTime()<86400000;
const expiredEvidence=(r:DomainRow)=>r.verification_status==='verified'&&r.dns_status==='ready'&&(!r.dns_checked_at||Date.now()-r.dns_checked_at.getTime()>=86400000);
export const token=()=>randomBytes(32).toString('hex');
export async function ownedDomain(subscriber:string,id:string,db:DB=pool):Promise<DomainRow>{
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))throw new HttpError(404,'Domain not found.');
  const row=(await db.query('SELECT * FROM subscriber_custom_domains WHERE subscriber_id=$1 AND id=$2',[subscriber,id])).rows[0];
  if(!row)throw new HttpError(404,'Domain not found.');return row;
}
export async function primaryPublicURL(subscriber:string,slug:string,db:DB=pool){
  const row=domainConfig().enabled?(await db.query(`SELECT hostname FROM subscriber_custom_domains WHERE subscriber_id=$1 AND is_primary
    AND verification_status='verified' AND dns_status='ready' AND tls_status='ready'
    AND dns_checked_at>now()-interval '24 hours'`,[subscriber])).rows[0]:null;
  return row?`https://${row.hostname}`:`https://${domainConfig().hosts[0]}/${slug}`;
}
export async function configuration(subscriber:string){
  const c=domainConfig(),allowance=await domainAllowance(subscriber);
  const rows=(await pool.query('SELECT * FROM subscriber_custom_domains WHERE subscriber_id=$1 ORDER BY created_at',[subscriber])).rows as DomainRow[];
  const sub=(await pool.query('SELECT public_slug FROM subscribers WHERE id=$1',[subscriber])).rows[0];
  return {...allowance,ready:c.ready,configuration_message:c.ready?'Keep your ownership TXT record in place. Use DNS-only mode during setup.':'Domain registration is available, but BHRU needs its DNS target and edge addresses configured before activation.',
    public_url:await primaryPublicURL(subscriber,sub.public_slug),domains:rows.map(r=>({
      id:r.id,hostname:r.hostname,status:domainActive(r)?'Active':expiredEvidence(r)||r.dns_status==='error'?'DNS error':r.tls_status==='error'?'SSL error':r.verification_status==='verified'?'SSL pending':'Pending setup',
      dns_status:expiredEvidence(r)?'error':r.dns_status,tls_status:r.tls_status,is_primary:r.is_primary&&domainActive(r),created_at:r.created_at.toISOString(),
      last_checked_at:r.last_checked_at?.toISOString()??null,last_error:expiredEvidence(r)?'DNS verification has expired. Verify DNS again.':r.last_error,
      instructions:dnsInstructions(r.hostname,r.verification_token)}))};
}
export async function addDomain(subscriber:string,input:string){
  const hostname=validateCustomerDomain(input),allowance=await domainAllowance(subscriber);
  if(!allowance.enabled)throw new HttpError(403,'Custom domains are not enabled.');
  try{await transaction(async db=>{
    await db.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[subscriber]);
    const count=Number((await db.query('SELECT count(*) AS count FROM subscriber_custom_domains WHERE subscriber_id=$1',[subscriber])).rows[0].count);
    if(count>=allowance.limit)throw new HttpError(409,`Your limit is ${allowance.limit} custom domains. Remove a domain before adding another.`);
    await db.query('INSERT INTO subscriber_custom_domains(id,subscriber_id,hostname,verification_token) VALUES($1,$2,$3,$4)',[randomUUID(),subscriber,hostname,token()]);
  });}catch(e){if((e as {code?:string}).code==='23505')throw new HttpError(409,'This domain is already registered.');throw e;}
}
export async function repairPrimary(subscriber:string,db:DB){
  await db.query(`UPDATE subscriber_custom_domains SET is_primary=false WHERE subscriber_id=$1 AND is_primary
    AND (dns_checked_at IS NULL OR dns_checked_at<=now()-interval '24 hours')`,[subscriber]);
  await db.query(`UPDATE subscriber_custom_domains SET is_primary=true WHERE id=(
    SELECT id FROM subscriber_custom_domains WHERE subscriber_id=$1 AND verification_status='verified'
    AND dns_status='ready' AND tls_status='ready' AND dns_checked_at>now()-interval '24 hours'
    AND NOT EXISTS(SELECT 1 FROM subscriber_custom_domains WHERE subscriber_id=$1 AND is_primary)
    ORDER BY created_at,id LIMIT 1)`,[subscriber]);
}
export async function modifyDomain(subscriber:string,id:string,action:'remove'|'primary'|'renew'){
  await transaction(async db=>{
    await db.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[subscriber]);
    const row=await ownedDomain(subscriber,id,db);
    if(action==='remove')await db.query('DELETE FROM subscriber_custom_domains WHERE id=$1 AND subscriber_id=$2',[id,subscriber]);
    if(action==='renew')await db.query(`UPDATE subscriber_custom_domains SET verification_token=$3,verification_status='pending',dns_status='waiting',
      tls_status='pending',is_primary=false,verified_at=NULL,activated_at=NULL,dns_checked_at=NULL,last_error=NULL WHERE id=$1 AND subscriber_id=$2`,[id,subscriber,token()]);
    if(action==='primary'){
      if(!domainActive(row)||!row.dns_checked_at||Date.now()-row.dns_checked_at.getTime()>86400000)throw new HttpError(409,'Only an active, verified domain can be Primary.');
      await db.query('UPDATE subscriber_custom_domains SET is_primary=false WHERE subscriber_id=$1',[subscriber]);
      await db.query('UPDATE subscriber_custom_domains SET is_primary=true WHERE id=$1 AND subscriber_id=$2',[id,subscriber]);
    }
    await repairPrimary(subscriber,db);
  });
}
export async function verifyDomain(subscriber:string,id:string,checkDns=true){
  const row=await ownedDomain(subscriber,id);
  const generation=randomUUID();
  await pool.query('UPDATE subscriber_custom_domains SET check_generation=$3 WHERE id=$1 AND subscriber_id=$2',[id,subscriber,generation]);
  let ownership=row.verification_status==='verified',routes=row.dns_status==='ready',error:string|null=null;
  if(checkDns)try{const result=await collectDns(row);ownership=result.ownership;routes=result.routes;error=result.error;}
  catch{ownership=false;routes=false;error='DNS lookup could not complete. Check your records and try again shortly.';}
  // Publish verified ownership before TLS probe so the challenge route can answer.
  await transaction(async db=>{
  await db.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[subscriber]);
  await db.query(`UPDATE subscriber_custom_domains SET verification_status=$3,dns_status=$4,
    verified_at=CASE WHEN $3='verified' THEN coalesce(verified_at,now()) ELSE NULL END,
    dns_checked_at=CASE WHEN $6 THEN now() ELSE dns_checked_at END,
    tls_status=CASE WHEN $3='verified' AND $4='ready' THEN tls_status ELSE 'pending' END,
    is_primary=CASE WHEN $3='verified' AND $4='ready' THEN is_primary ELSE false END,last_error=$5,last_checked_at=now()
    WHERE id=$1 AND subscriber_id=$2 AND verification_token=$7 AND check_generation=$8`,
    [id,subscriber,ownership?'verified':'pending',ownership&&routes?'ready':'error',error,checkDns,row.verification_token,generation]);
  await repairPrimary(subscriber,db);
  });
  const tls=ownership&&routes?await probeTLS(row):false;
  await transaction(async db=>{
    await db.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[subscriber]);
    await db.query(`UPDATE subscriber_custom_domains SET tls_status=$3,last_error=$4,is_primary=CASE WHEN $3='ready' THEN is_primary ELSE false END,
      activated_at=CASE WHEN $3='ready' THEN coalesce(activated_at,now()) ELSE NULL END,
      last_checked_at=now() WHERE id=$1 AND subscriber_id=$2 AND verification_token=$5
      AND verification_status=$6 AND dns_status=$7 AND check_generation=$8`,
      [id,subscriber,tls?'ready':ownership&&routes&&row.verified_at&&Date.now()-row.verified_at.getTime()>1200000?'error':'pending',
        error??(ownership&&routes&&!tls?'DNS verified. Waiting for valid HTTPS and a matching BHRU edge response.':null),
        row.verification_token,ownership?'verified':'pending',ownership&&routes?'ready':'error',generation]);
    // Keep a formerly selected Primary whenever it is still active.
    if(tls&&row.is_primary)await db.query(`UPDATE subscriber_custom_domains SET is_primary=true WHERE id=$1 AND subscriber_id=$2
      AND tls_status='ready' AND verification_token=$3 AND check_generation=$4
      AND NOT EXISTS(SELECT 1 FROM subscriber_custom_domains WHERE subscriber_id=$2 AND is_primary)`,[id,subscriber,row.verification_token,generation]);
    await repairPrimary(subscriber,db);
  });
}
