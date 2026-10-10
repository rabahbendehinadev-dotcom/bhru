// Real development PostgreSQL transactions; isolated fixture schema, no upstream I/O.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtemp,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
const {build}=require('esbuild');
const {Pool}=createRequire(new URL('../lib/db/package.json',import.meta.url))('pg');
if(process.env.NODE_ENV==='production'||!process.env.BHRU_TEST_DB_FINGERPRINT)throw Error('Verified development fingerprint required.');
const publicPool=new Pool({connectionString:process.env.DATABASE_URL});
const fingerprintSQL="SELECT md5(concat(current_database(),':',(SELECT oid::text FROM pg_database WHERE datname=current_database()),':',pg_postmaster_start_time()::text,':',(SELECT md5(string_agg(name||checksum,',' ORDER BY name)) FROM schema_migrations))) fingerprint";
assert.equal((await publicPool.query(fingerprintSQL)).rows[0].fingerprint,process.env.BHRU_TEST_DB_FINGERPRINT);
assert.equal((await publicPool.query("SELECT count(*)::int n FROM external_provider_jobs WHERE state IN ('RUNNING','QUEUED')")).rows[0].n,0);
const schema='bhru_diag_fixture_'+randomUUID().replaceAll('-','');
const dir=await mkdtemp(join(tmpdir(),'bhru-diag-real-db-'));
const tables=['subscribers','account_users','platform_admin_users','platform_admin_sessions','sessions','auth_rate_limits',
  'external_providers','external_provider_jobs','external_provider_test_authorizations','audit_logs'];
const protectedTables=[...tables,'customer_wallets','customer_wallet_ledger','service_orders','store_orders'];
const snapshot=async()=>Promise.all(protectedTables.map(async t=>(await publicPool.query(
  `SELECT md5(coalesce(string_agg(to_jsonb(r)::text,',' ORDER BY to_jsonb(r)::text),'')) h FROM public.${t} r`)).rows[0].h));
const before=await snapshot();
let h,server,passed=0;
const check=async(label,fn)=>{await fn();console.log(`PASS ${++passed}: ${label}`)};
try{
  await publicPool.query(`CREATE SCHEMA ${schema}`);
  for(const t of tables)await publicPool.query(`CREATE TABLE ${schema}.${t} (LIKE public.${t} INCLUDING ALL)`);
  await publicPool.query(`ALTER TABLE ${schema}.external_provider_test_authorizations ADD FOREIGN KEY(subscriber_id,provider_id,job_id)
    REFERENCES ${schema}.external_provider_jobs(subscriber_id,provider_id,id)`);
  await publicPool.query(`ALTER TABLE ${schema}.external_provider_test_authorizations ADD FOREIGN KEY(admin_actor_id)
    REFERENCES ${schema}.platform_admin_users(id)`);
  await symlink(resolve('lib/db/node_modules'),join(dir,'node_modules'));
  const src=resolve('artifacts/api-server/src');
  await build({stdin:{contents:[
    `export * from '${src}/lib/providers/one-time-diagnostics.ts';`,
    `export * from '${src}/lib/providers/worker.ts';`,
    `export {ProviderError} from '${src}/lib/providers/transport.ts';`,
    `export * from '${src}/lib/providers/credentials.ts';`,
    `export * from '${src}/lib/auth.ts';`,
    `export {default as router} from '${src}/routes/external-providers.ts';`,
    `export {pool} from '@workspace/db'; export {state} from 'fixture-state';`,
  ].join('\n'),resolveDir:process.cwd(),loader:'ts'},platform:'node',bundle:true,format:'esm',
  outfile:join(dir,'test.mjs'),external:['pg'],
  banner:{js:"import {createRequire as __req} from 'node:module';const require=__req(import.meta.url);"},
  alias:{'@workspace/api-zod':resolve('lib/api-zod/src/index.ts'),
    '@workspace/currency-presentation':resolve('lib/currency-presentation/src/index.mts')},
  plugins:[{name:'isolated-db-and-no-network',setup(b){
    b.onResolve({filter:/^@workspace\/db$/},()=>({path:'fixture-db',namespace:'fixture'}));
    b.onResolve({filter:/^fixture-state$/},()=>({path:'fixture-state',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='fixture-db'?
      `import pg from 'pg';export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:8,
       options:'-c search_path=${schema},public'});`:
      `export const state={logs:[],calls:0};`,loader:'js'}));
    b.onLoad({filter:/\/lib\/logger\.ts$/},()=>({contents:`import {state} from 'fixture-state';
      export const logger={info:(fields,message)=>state.logs.push({fields,message}),
      warn:(fields,message)=>state.logs.push({fields,message}),error(){}};`,loader:'js'}));
    b.onLoad({filter:/\/providers\/transport\.ts$/},()=>({contents:`
      export class ProviderError extends Error{constructor(category,retryable=false,diagnosticCode,status){
       super(category);Object.assign(this,{category,retryable,diagnosticCode,upstreamHttpStatus:status});}
       get safeError(){return this.category+(this.diagnosticCode?':'+this.diagnosticCode:'')+
        (this.upstreamHttpStatus?':'+this.upstreamHttpStatus:'')}}
      export const safeLegacyRead=async()=>{throw Error('LIVE SUPPLIER I/O FORBIDDEN')};
      export const safeRead=safeLegacyRead;export const providerUrl=x=>x;`,loader:'js'}));
  }}]});
  h=await import('file://'+join(dir,'test.mjs'));
  const q=(sql,values)=>h.pool.query(sql,values);
  const transaction=async(fn)=>{const c=await h.pool.connect();try{await c.query('BEGIN');const result=await fn(c);
    await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release()}};
  const sub=randomUUID(),other=randomUUID(),user=randomUUID(),userB=randomUUID(),adminId=randomUUID();
  for(const [sid,uid] of [[sub,user],[other,userB]]){
    await q('INSERT INTO subscribers(id,business,public_slug) VALUES($1,$2,$3)',
      [sid,'Synthetic diagnostic fixture','fixture-'+sid.slice(0,8)]);
    await q(`INSERT INTO account_users(id,subscriber_id,full_name,username,email,phone,country,password_hash)
      VALUES($1,$2,'Fixture',$3,$4,'','DZ','synthetic-unused')`,[uid,sid,'fixture_'+uid.replaceAll('-',''),uid+'@example.invalid']);
  }
  await q(`INSERT INTO platform_admin_users(id,email,password_hash,full_name,enabled)
    VALUES($1,$2,'synthetic-unused','Fixture admin',true)`,[adminId,adminId+'@example.invalid']);
  const owner={id:user,subscriber_id:sub,full_name:'Fixture',admin:false};
  const otherOwner={id:userB,subscriber_id:other,full_name:'Fixture',admin:false};
  const admin={id:adminId,subscriber_id:null,full_name:'Fixture admin',admin:true};
  const provider=async(sid=sub,protocol='DHRU_FUSION_LEGACY_V61')=>{
    const id=randomUUID(),encrypted=h.encryptToken(sid,id,JSON.stringify({username:'fixture',apiAccessKey:'fixture-key'}));
    await q(`INSERT INTO external_providers(id,subscriber_id,name,protocol,base_url,credentials_encrypted,enabled)
      VALUES($1,$2,'Synthetic provider',$3,'https://fixture.example/api/index.php',$4,true)`,[id,sid,protocol,encrypted]);return id;
  };
  const p=await provider();
  const authorize=(pid=p,key=randomUUID(),o=owner,a=admin)=>transaction(db=>h.enqueueDiagnosticTest(db,o,a,pid,key));
  const markDone=id=>q("UPDATE external_provider_jobs SET state='FAILED',completed_at=now(),lease_token=NULL,lease_until=NULL WHERE id=$1",[id]);
  let job;
  await check('Rollback hides both job and authorization; independent connection sees neither before commit',async()=>{
    const c=await h.pool.connect();await c.query('BEGIN');
    try{const j=await h.enqueueDiagnosticTest(c,owner,admin,p,randomUUID());
      assert.equal((await q('SELECT count(*)::int n FROM external_provider_jobs WHERE id=$1',[j.id])).rows[0].n,0);
      assert.equal((await q('SELECT count(*)::int n FROM external_provider_test_authorizations WHERE job_id=$1',[j.id])).rows[0].n,0);
      assert.equal(await h.claimProviderJob(),null);
    }finally{await c.query('ROLLBACK');c.release()}
    assert.equal((await q('SELECT count(*)::int n FROM external_provider_jobs')).rows[0].n,0);
  });
  await check('Concurrent idempotent requests produce one new TEST, one grant, one authorization audit',async()=>{
    const key=randomUUID(),jobs=await Promise.all(Array.from({length:5},()=>authorize(p,key)));
    assert.equal(new Set(jobs.map(j=>j.id)).size,1);job=jobs[0];
    const a=(await q('SELECT *,extract(epoch FROM expires_at-created_at)::int seconds FROM external_provider_test_authorizations')).rows;
    assert.equal(a.length,1);assert.equal(a[0].seconds,300);
    assert.equal((await q("SELECT count(*)::int n FROM audit_logs WHERE action='Diagnostic TEST authorized'")).rows[0].n,1);
  });
  await check('Concurrent PostgreSQL claims issue exactly one lease-bound permit',async()=>{
    const claims=await Promise.all(Array.from({length:5},()=>h.claimProviderJob()));
    const active=claims.filter(Boolean);assert.equal(active.length,1);assert(active[0].oneTimeDiagnostic);
    job=active[0];assert.equal((await q('SELECT permit_lease FROM external_provider_test_authorizations')).rows[0].permit_lease,job.lease_token);
  });
  const read=async(_base,_credentials,action)=>{
    assert.equal(action,'accountinfo');h.state.calls++;
    return '{"SUCCESS":[{"AccoutInfo":{"currency":"USD","credit":"123.123456789012"}}],"apiversion":"2023.21"}';
  };
  await check('Independent diagnostics keep unsupported-version rejection and redact account/credential values',async()=>{
    const providerBefore=(await q('SELECT * FROM external_providers WHERE id=$1',[p])).rows[0];
    await h.runProviderJob(job,read);
    assert.equal(h.state.calls,1);
    const j=(await q('SELECT * FROM external_provider_jobs WHERE id=$1',[job.id])).rows[0];
    assert.equal(j.state,'FAILED');assert.equal(j.safe_error,'INVALID_RESPONSE:LEGACY_VERSION_MISMATCH');
    const logs=h.state.logs.filter(l=>l.fields.diagnosticCode==='LEGACY_ACCOUNT_RESPONSE_CLASSIFICATION');
    assert.equal(logs.length,1);assert.equal(logs[0].fields.version,'OBSERVED_2023_21');
    assert.equal(logs[0].fields.credit,'VALID');
    assert(!JSON.stringify(logs).includes('123.123456789012'));assert(!JSON.stringify(logs).includes('fixture-key'));
    assert.deepEqual((await q('SELECT * FROM external_providers WHERE id=$1',[p])).rows[0],providerBefore);
  });
  await check('Successful supported-version diagnostic completes without persisting account balances or changing provider records',async()=>{
    const j=await authorize(),claimed=await h.claimProviderJob();
    const beforeProvider=(await q('SELECT * FROM external_providers WHERE id=$1',[p])).rows[0];
    await h.runProviderJob(claimed,async(_base,_credential,action)=>{
      assert.equal(action,'accountinfo');
      return '{"SUCCESS":[{"AccoutInfo":{"currency":"USD","credit":"987.123456789012"}}],"apiversion":"6.1"}';
    });
    assert.equal((await q('SELECT state FROM external_provider_jobs WHERE id=$1',[j.id])).rows[0].state,'COMPLETED');
    assert.deepEqual((await q('SELECT * FROM external_providers WHERE id=$1',[p])).rows[0],beforeProvider);
    assert(!JSON.stringify(h.state.logs).includes('987.123456789012'));
  });
  await check('Cross-tenant, wrong administrator, REST and existing TEST/SYNC jobs are rejected',async()=>{
    await assert.rejects(authorize(p,randomUUID(),otherOwner),e=>e.status===404);
    await assert.rejects(authorize(p,randomUUID(),owner,owner),e=>e.status===403);
    await assert.rejects(authorize(await provider(sub,'fusion_rest')),e=>e.status===409);
    for(const kind of ['TEST','SYNC']){
      const pid=await provider();const pending=await transaction(db=>h.enqueueProviderJob(sub,pid,user,kind,db));
      await assert.rejects(authorize(pid),e=>e.status===409);
      assert.equal((await q('SELECT count(*)::int n FROM external_provider_test_authorizations WHERE job_id=$1',[pending.id])).rows[0].n,0);
      await markDone(pending.id);
    }
  });
  await check('Expired authorization fails atomically before supplier I/O and audits expiration',async()=>{
    const j=await authorize();
    await q(`UPDATE external_provider_test_authorizations SET created_at=now()-interval '10 minutes',
      expires_at=now()-interval '5 minutes' WHERE job_id=$1`,[j.id]);
    assert.equal(await h.claimProviderJob(),null);
    assert.equal((await q('SELECT safe_error FROM external_provider_jobs WHERE id=$1',[j.id])).rows[0].safe_error,'DIAGNOSTIC_AUTHORIZATION_EXPIRED');
    assert.equal(h.state.calls,1);
  });
  await check('Crash/lost lease never reissues permission or sends another supplier request',async()=>{
    const j=await authorize();const claimed=await h.claimProviderJob();assert.equal(claimed.id,j.id);
    await q("UPDATE external_provider_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[j.id]);
    const beforeCalls=h.state.calls;await h.runProviderJob(claimed,read);assert.equal(h.state.calls,beforeCalls);
    assert.equal(await h.claimProviderJob(),null);
    // Separate crash fixture: reclaimed RUNNING job is rejected at the next claim.
    const next=await authorize();await h.claimProviderJob();
    await q("UPDATE external_provider_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[next.id]);
    assert.equal(await h.claimProviderJob(),null);
    assert.equal((await q('SELECT safe_error FROM external_provider_jobs WHERE id=$1',[next.id])).rows[0].safe_error,'DIAGNOSTIC_PERMIT_NOT_REISSUED');
  });
  await check('Authorized transient upstream failure is single-attempt; HTTP status diagnostic preserved',async()=>{
    const j=await authorize();const claimed=await h.claimProviderJob();
    await h.runProviderJob(claimed,async()=>{h.state.calls++;throw new h.ProviderError('UNREACHABLE',true,'HTTP_FAILURE',429)});
    const row=(await q('SELECT * FROM external_provider_jobs WHERE id=$1',[j.id])).rows[0];
    assert.equal(row.state,'FAILED');assert.equal(row.attempts,1);assert.equal(row.safe_error,'UNREACHABLE:HTTP_FAILURE:429');
  });
  await check('Expiry after claim revokes consumed permit before I/O without changing provider health',async()=>{
    const j=await authorize(),claimed=await h.claimProviderJob(),calls=h.state.calls;
    const beforeHealth=(await q('SELECT health,safe_error FROM external_providers WHERE id=$1',[p])).rows[0];
    await q(`UPDATE external_provider_test_authorizations SET created_at=now()-interval '10 minutes',
      expires_at=now()-interval '5 minutes' WHERE job_id=$1`,[j.id]);
    await h.runProviderJob(claimed,read);assert.equal(h.state.calls,calls);
    assert.deepEqual((await q('SELECT health,safe_error FROM external_providers WHERE id=$1',[p])).rows[0],beforeHealth);
  });
  await check('Existing ten-job tenant queue cap cannot be bypassed',async()=>{
    const ids=[];
    for(let i=0;i<10;i++){
      const pid=await provider();ids.push((await transaction(db=>h.enqueueProviderJob(sub,pid,user,'TEST',db))).id);
    }
    await assert.rejects(authorize(),e=>e.status===429);
    for(const id of ids)await markDone(id);
  });
  await check('Normal jobs preserve ordinary TEST and retry behavior',async()=>{
    const pid=await provider(),j=await transaction(db=>h.enqueueProviderJob(sub,pid,user,'TEST',db));
    const claimed=await h.claimProviderJob();assert(!claimed.oneTimeDiagnostic);
    await h.runProviderJob(claimed,async()=>{throw new h.ProviderError('UNREACHABLE',true,'HTTP_FAILURE',429)});
    assert.equal((await q('SELECT state FROM external_provider_jobs WHERE id=$1',[j.id])).rows[0].state,'QUEUED');
    await markDone(j.id);
  });
  await check('Changed configuration revokes diagnostics before I/O without touching the updated provider',async()=>{
    const j=await authorize();const claimed=await h.claimProviderJob(),calls=h.state.calls;
    await q('UPDATE external_providers SET config_version=config_version+1 WHERE id=$1',[p]);
    await h.runProviderJob(claimed,read);assert.equal(h.state.calls,calls);
    assert.equal((await q('SELECT state FROM external_provider_test_authorizations WHERE job_id=$1',[j.id])).rows[0].state,'REJECTED');
  });
  await check('Emitter rejects hostile diagnostic fields and invalid scope/expiry',async()=>{
    const count=h.state.logs.length;
    h.logOneTimeDiagnostic({...job,diagnosticExpiresAt:new Date(Date.now()+60000)},
      {response:'JSON',version:'fixture-key',success:'VALID',account:'VALID',currency:'VALID',credit:'VALID'});
    h.logOneTimeDiagnostic({...job,diagnosticExpiresAt:'invalid'},{
      response:'JSON',version:'SUPPORTED_6_1',success:'VALID',account:'VALID',currency:'VALID',credit:'VALID'});
    assert.equal(h.state.logs.length,count);
  });
  // Exercise actual session/CSRF/route implementations on loopback, never a provider.
  const express=require('express'),cookieParser=require('cookie-parser'),app=express();
  app.use(express.json(),cookieParser(),(req,_res,next)=>{req.log={warn:(fields,message)=>h.state.logs.push({fields,message})};next()});
  app.use(h.loadSession,h.auditDiagnosticRejection);app.use('/api',h.csrfProtection,h.router);
  app.use((e,_req,res,_next)=>res.status(e.status??400).json({error:'Fixture request rejected'}));
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});
  const address=server.address().port;
  const subscriberToken=await transaction(db=>h.createSession(db,owner));
  const adminToken=await transaction(db=>h.createSession(db,admin));
  const cookie=`bhru_session=${subscriberToken}; bhru_admin_session=${adminToken}`;
  const call=async(pid,body,headers={})=>fetch(`http://127.0.0.1:${address}/api/external-providers/${pid}/diagnostic-test`,
    {method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-BHRU-Request':'1',...headers},body:JSON.stringify(body)});
  await check('HTTP requires independent admin AND subscriber sessions, CSRF and exact confirmation',async()=>{
    const body={confirmedProviderId:p,idempotencyKey:randomUUID()};
    await q('UPDATE platform_admin_users SET enabled=false WHERE id=$1',[adminId]);
    assert.equal((await call(p,body)).status,403);
    await q('UPDATE platform_admin_users SET enabled=true WHERE id=$1',[adminId]);
    assert.equal((await call(p,body,{Cookie:`bhru_session=${subscriberToken}`})).status,403);
    assert.equal((await call(p,body,{Cookie:`bhru_admin_session=${adminToken}`})).status,401);
    assert.equal((await call(p,body,{'X-BHRU-Request':''})).status,403);
    assert(h.state.logs.some(l=>l.fields.diagnosticCode==='DIAGNOSTIC_ACTION_DENIED'&&l.fields.status===403));
    assert.equal((await call(p,body,{Origin:'https://untrusted.example'})).status,403);
    assert.equal((await call(p,{...body,confirmedProviderId:randomUUID()})).status,400);
    assert.equal((await call(await provider(other),body)).status,400);
    const foreign=await provider(other);
    assert.equal((await call(foreign,{...body,confirmedProviderId:foreign})).status,404);
  });
  await check('HTTP creates exactly one job on repeated request and preserves tenant job rate limiting',async()=>{
    const pid=await provider(),body={confirmedProviderId:pid,idempotencyKey:randomUUID()};
    const r=await call(pid,body);assert.equal(r.status,202);const j=await r.json();
    const again=await call(pid,body);assert.equal(again.status,202);assert.equal((await again.json()).id,j.id);
    // Same session/tenant bucket, real PostgreSQL limiter, no row deletion or bypass.
    for(let i=0;i<31;i++){const response=await call(pid,body);if(response.status===429)return;}
    assert.fail('Expected preserved rate limiting');
  });
  await check('Creation, consumption, expiry and rejection audit events are durable',async()=>{
    const actions=(await q('SELECT DISTINCT action FROM audit_logs')).rows.map(r=>r.action);
    for(const a of ['Diagnostic TEST authorized','Diagnostic TEST authorization consumed',
      'Diagnostic TEST authorization expired','Diagnostic TEST claim rejected','Diagnostic TEST authorization rejected'])assert(actions.includes(a),a);
  });
  assert.deepEqual(await snapshot(),before,'Public application/provider/financial records were changed');
  console.log(`RESULT: ${passed} real-development-PostgreSQL groups passed; synthetic suppliers only, public data unchanged.`);
}finally{
  if(server)await new Promise(r=>server.close(r));
  if(h)await h.pool.end();
  // Only this explicitly created, random test schema and its disposable fixtures.
  await publicPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await publicPool.end();await rm(dir,{recursive:true,force:true});
}
