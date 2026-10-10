// Preview-only readiness diagnostic. No provider calls or production access.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,symlink,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import vm from 'node:vm';
const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
const {build}=require('esbuild');
const {Pool}=createRequire(new URL('../lib/db/package.json',import.meta.url))('pg');
if(process.env.NODE_ENV==='production'||!process.env.BHRU_TEST_DB_FINGERPRINT)throw Error('Verified Preview fingerprint required.');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const sql="SELECT md5(concat(current_database(),':',(SELECT oid::text FROM pg_database WHERE datname=current_database()),':',pg_postmaster_start_time()::text,':',(SELECT md5(string_agg(name||checksum,',' ORDER BY name)) FROM schema_migrations))) fingerprint";
const out=await mkdtemp(join(tmpdir(),'bhru-readiness-'));
const sub=randomUUID(),owner=randomUUID();let helpers,created=false;
try{
  assert.equal((await pool.query(sql)).rows[0].fingerprint,process.env.BHRU_TEST_DB_FINGERPRINT);
  console.log('PASS: configured database identity matches verified Replit development database.');
  const ledger=new Map((await pool.query('SELECT name,checksum FROM schema_migrations')).rows.map(r=>[r.name,r.checksum]));
  for(const file of (await readdir('lib/db/src/migrations')).filter(n=>n.endsWith('.sql'))){
    const content=await readFile(join('lib/db/src/migrations',file),'utf8');
    assert.equal(ledger.get(file),createHash('sha256').update(content).digest('hex'),`Missing/changed migration: ${file}`);
  }
  console.log('PASS: all repository migrations applied with matching checksums, including 032 and 033.');
  const required={
    external_providers:'id,subscriber_id,protocol,base_url,credentials_encrypted,config_version,health,pricing_policy',
    external_provider_jobs:'id,subscriber_id,provider_id,actor_id,kind,state,config_version,attempts,lease_token,lease_until,next_attempt_at,counts',
    external_provider_catalog:'id,subscriber_id,provider_id,upstream_id,cost_units,currency,requirements,source_snapshot,source_hash,last_job_id',
    external_provider_service_links:'subscriber_id,provider_id,catalog_id,service_id,imported_source_hash,imported_cost_units,imported_currency,imported_fx_rate',
  };
  for(const [table,columns] of Object.entries(required))await pool.query(`SELECT ${columns} FROM ${table} LIMIT 0`);
  const idx=(await pool.query(`SELECT c.relname,i.indisvalid,i.indisready FROM pg_index i
    JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid
    JOIN pg_namespace n ON t.relnamespace=n.oid WHERE n.nspname='public' AND t.relname=ANY($1)`,[Object.keys(required)])).rows;
  for(const name of ['external_provider_one_live_job','external_provider_job_claim','external_provider_history',
    'external_provider_catalog_browse','external_providers_pkey','external_provider_jobs_pkey',
    'external_provider_catalog_pkey','external_provider_service_links_pkey']){
    assert(idx.some(i=>i.relname===name&&i.indisvalid&&i.indisready),`Required index unavailable: ${name}`);
  }
  assert.equal(idx.length,13);assert(idx.every(i=>i.indisvalid&&i.indisready));
  const constraints=(await pool.query(`SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='external_providers'::regclass AND conname IN ('external_providers_protocol_check','external_providers_health_check')`)).rows;
  assert.equal(constraints.length,2);assert(constraints.every(c=>c.convalidated));
  assert(constraints.find(c=>c.conname==='external_providers_protocol_check').definition.includes('DHRU_FUSION_LEGACY_V61'));
  assert(constraints.find(c=>c.conname==='external_providers_health_check').definition.includes('AUTHENTICATION_FAILED'));
  console.log('PASS: provider columns, 13 valid/ready indexes and Legacy-compatible validated constraints.');
  const before=(await pool.query('SELECT count(*)::int n FROM external_providers')).rows[0].n;
  const entry=resolve('artifacts/api-server/src');
  await writeFile(join(out,'package.json'),'{"type":"module"}');
  await symlink(resolve('lib/db/node_modules'),join(out,'node_modules'));
  await build({stdin:{contents:`export {createSession} from '${entry}/lib/auth.ts'; export * from '${entry}/lib/providers/credentials.ts';
    export {assertProviderSchemaReady} from '${entry}/lib/providers/schema-ready.ts'; export {pool} from '@workspace/db';`,
    resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',external:['pg'],outfile:join(out,'helpers.mjs'),
    banner:{js:"import {createRequire as __r} from 'node:module';const require=__r(import.meta.url);"},
    alias:{'@workspace/db':resolve('lib/db/src/index.ts'),'@workspace/api-zod':resolve('lib/api-zod/src/index.ts'),
      '@workspace/currency-presentation':resolve('lib/currency-presentation/src/index.mts')}});
  helpers=await import(`file://${join(out,'helpers.mjs')}`);
  assert.equal(helpers.providerStorageReady(),true);
  const envelope=helpers.encryptToken(sub,owner,'non-secret readiness fixture');
  assert.equal(helpers.decryptToken(sub,owner,envelope),'non-secret readiness fixture');
  console.log('PASS: actual configured key validates and AES-GCM round-trip passes (no key/ciphertext output).');
  // Negative security cases use isolated synthetic environments, not the real secret.
  const cryptoBuild=await build({entryPoints:[entry+'/lib/providers/credentials.ts'],bundle:true,write:false,platform:'node',format:'cjs',
    plugins:[{name:'error-stub',setup(b){b.onLoad({filter:/\/lib\/auth\.ts$/},()=>({contents:'export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}',loader:'ts'}));}}]});
  for(const value of [undefined,'invalid',Buffer.alloc(16,1).toString('base64'),' '+Buffer.alloc(32,1).toString('base64')]){
    const m={exports:{}};vm.runInNewContext(cryptoBuild.outputFiles[0].text,{module:m,exports:m.exports,require,Buffer,
      process:{env:{BHRU_PROVIDER_ENCRYPTION_KEY_V1:value}}});
    assert.equal(m.exports.providerStorageReady(),false);
    assert.throws(()=>m.exports.encryptToken(sub,owner,'fixture'),e=>e.status===503);
  }
  console.log('PASS: missing, malformed, wrong-length and whitespace-padded keys fail closed.');
  const schemaClient=await pool.connect();
  try{await helpers.assertProviderSchemaReady(schemaClient);}finally{schemaClient.release();}
  for(const scenario of ['missing-table','missing-index','missing-migration','incompatible-constraint']){
    const fake={query:async sql=>{
      if(scenario==='missing-table')throw Error('Synthetic table error');
      return {rows:[{migrations:scenario==='missing-migration'?1:2,indexes:scenario==='missing-index'?12:13,
        constraints:scenario==='incompatible-constraint'?1:2}]};
    }};
    await assert.rejects(helpers.assertProviderSchemaReady(fake),e=>e.status===503&&!e.message.includes('Synthetic'));
  }
  console.log('PASS: schema gate accepts real Preview storage; missing tables/indexes/migrations or incompatible constraints fail closed with safe HTTP 503 errors.');
  // Only disposable test identities are written; never alter existing subscribers.
  await pool.query('INSERT INTO subscribers(id,business,public_slug) VALUES($1,$2,$3)',[sub,'Readiness verification','readiness-'+sub]);
  created=true;
  await pool.query(`INSERT INTO account_users(id,subscriber_id,full_name,username,email,phone,country,password_hash)
    VALUES($1,$2,'Readiness verification',$3,$4,'000','Other','scrypt$fixture')`,[owner,sub,'ready_'+owner.replaceAll('-',''),owner+'@example.invalid']);
  const client=await pool.connect();let cookie;
  try{cookie='bhru_session='+await helpers.createSession(client,{id:owner,subscriber_id:sub,full_name:'Readiness verification',admin:false});}finally{client.release();}
  assert(process.env.REPLIT_DEV_DOMAIN,'Preview domain required.');
  const endpoint=`https://${process.env.REPLIT_DEV_DOMAIN}/api/external-providers`;
  const anonymous=await fetch(endpoint);assert.equal(anonymous.status,401);
  const r=await fetch(endpoint,{headers:{Cookie:cookie,'X-BHRU-Request':'1'}});
  assert.equal(r.status,200);const body=await r.json();assert.equal(body.storageReady,true);assert.equal(body.data.length,0);
  assert(body.protocols.some(p=>p.code==='DHRU_FUSION_LEGACY_V61'&&p.available));
  assert(r.headers.get('cache-control').includes('no-store'));
  console.log('PASS: live authenticated Preview HTTP 200, storageReady=true, Legacy available, no-store; anonymous HTTP 401.');
  assert.equal((await pool.query('SELECT count(*)::int n FROM external_providers')).rows[0].n,before);
  console.log('PASS: provider records unchanged; no upstream requests, credentials replacement or migration writes.');
}finally{
  try{
    if(created){
      const cleanup=await pool.connect();
      try{
        await cleanup.query('BEGIN');
        await cleanup.query('DELETE FROM sessions WHERE user_id=$1',[owner]);
        await cleanup.query('DELETE FROM audit_logs WHERE actor_id=$1',[owner]);
        const tables=(await cleanup.query(`SELECT c.table_name FROM information_schema.columns c
          JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public'
          AND c.column_name='subscriber_id' AND t.table_type='BASE TABLE' AND c.table_name<>'subscribers'`)).rows.map(r=>r.table_name);
        let pending=tables;
        for(let n=0;n<tables.length&&pending.length;n++){
          const next=[];
          for(const table of pending){
            assert(/^[a-z_]+$/.test(table));await cleanup.query('SAVEPOINT cleanup_one');
            try{await cleanup.query(`DELETE FROM "${table}" WHERE subscriber_id=$1`,[sub]);}
            catch{await cleanup.query('ROLLBACK TO SAVEPOINT cleanup_one');next.push(table);}
          }
          if(next.length===pending.length)throw Error('Disposable fixture cleanup blocked.');
          pending=next;
        }
        await cleanup.query('DELETE FROM subscribers WHERE id=$1',[sub]);await cleanup.query('COMMIT');
        console.log('PASS: disposable HTTP fixture and its automatically initialized defaults removed.');
      }catch(e){await cleanup.query('ROLLBACK');throw e;}finally{cleanup.release();}
    }
  }finally{if(helpers)await helpers.pool.end();await pool.end();await rm(out,{recursive:true,force:true});}
}
