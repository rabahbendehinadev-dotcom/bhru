// Focused, development-only tests. All upstream traffic is mocked; no paid dispatch.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import vm from 'node:vm';
const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
const {build}=require('esbuild'),{Pool}=createRequire(new URL('../lib/db/package.json',import.meta.url))('pg');
if(process.env.NODE_ENV==='production')throw Error('Development only.');
if(!process.env.BHRU_TEST_DB_FINGERPRINT)throw Error('Supply a freshly verified development database fingerprint.');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5});
const sql="SELECT md5(concat(current_database(),':',(SELECT oid::text FROM pg_database WHERE datname=current_database()),':',pg_postmaster_start_time()::text,':',(SELECT md5(string_agg(name||checksum,',' ORDER BY name)) FROM schema_migrations))) fingerprint";
assert.equal((await pool.query(sql)).rows[0].fingerprint,process.env.BHRU_TEST_DB_FINGERPRINT,'Development database identity mismatch.');
const out=await mkdtemp(join(tmpdir(),'bhru-provider-tests-'));
let passed=0,server,db,api,helpers;
const check=async(label,run)=>{await run();console.log(`PASS ${++passed}: ${label}`);};
const entry=resolve('artifacts/api-server/src');
const sub=randomUUID(),other=randomUUID(),owner=randomUUID(),ownerB=randomUUID();
const tenants=[sub,other];
const protectedTables=['customer_wallets','customer_wallet_ledger','service_orders','store_orders','customer_service_prices','customer_service_access'];
const digest=async()=>Promise.all(protectedTables.map(async t=>(await pool.query(`SELECT md5(coalesce(string_agg(to_jsonb(r)::text,',' ORDER BY to_jsonb(r)::text),'')) digest FROM ${t} r`)).rows[0].digest));
const before=await digest();
const bundle=async(name,contents,plugins=[])=>{
  const path=join(out,name+'.mjs');
  await build({stdin:{contents,resolveDir:process.cwd(),sourcefile:name+'.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',external:['pg'],outfile:path,plugins,
    banner:{js:"import {createRequire as __testRequire} from 'node:module';const require=__testRequire(import.meta.url);"},
    alias:{'@workspace/db':resolve('lib/db/src/index.ts'),'@workspace/api-zod':resolve('lib/api-zod/src/index.ts'),'@workspace/currency-presentation':resolve('lib/currency-presentation/src/index.mts')}});
  return import(`file://${path}`);
};
// Resolve external packages relative to the API workspace, not the temporary output directory.
await writeFile(join(out,'package.json'),JSON.stringify({type:'module'}));
const {symlink}=await import('node:fs/promises');await symlink(resolve('lib/db/node_modules'),join(out,'node_modules'));
try{
  helpers=await bundle('helpers',[
    "export * from '"+entry+"/lib/providers/adapter.ts';",
    "export * from '"+entry+"/lib/providers/transport.ts';",
    "export * from '"+entry+"/lib/providers/credentials.ts';",
    "export * from '"+entry+"/lib/providers/connections.ts';",
    "export * from '"+entry+"/lib/providers/import.ts';",
    "export * from '"+entry+"/lib/providers/worker.ts';",
    "export * from '"+entry+"/lib/client-finance/catalog.ts';",
    "export * from '"+entry+"/lib/client-finance/pricing.ts';",
    "export * from '"+entry+"/lib/auth.ts';",
    "export {subscriberContext} from '"+entry+"/lib/commerce/data.ts';",
    "export {pool} from '@workspace/db';",
  ].join('\n'),[{name:'quiet-test-logger',setup(b){b.onLoad({filter:/\/lib\/logger\.ts$/},()=>({contents:'export const logger={warn(){},info(){},error(){}};',loader:'ts'}));}}]);
  const response=data=>JSON.stringify({status:'success',code:200,data});
  const product=(changes={})=>({name:'Fixture IMEI',type:'imei',cid:'C1',price:'1.250000000001',time:'1-5 Minutes',
    fields:[{type:'imei',name:'IMEI',required:true}],...changes});
  const catalog=(products={'123':product()})=>response({currency:'USD',categories:{C1:{name:'IMEI Services',type:'imei'}},products});
  const legacyCredentials=JSON.stringify({username:'fixture-legacy-user',apiAccessKey:'fixture-legacy-key'});
  const legacyAccount=JSON.stringify({SUCCESS:[{message:'Your Accout Info',AccoutInfo:{credit:'123.123456789012',currency:'USD'}}],apiversion:'6.1'});
  const legacyService=(changes={})=>({SERVICEID:'123',SERVICETYPE:'IMEI',SERVICENAME:'Legacy fixture',CREDIT:'1.250000000001',
    INFO:'Fixture description',TIME:'1-2 Minutes',QNT:'0',
    'Requires.Custom':[{type:'serviceimei',fieldname:'USERNAME',fieldtype:'text',description:'',fieldoptions:'',required:'1'}],...changes});
  const legacyList=(services={'123':legacyService()},type='IMEI')=>JSON.stringify({
    SUCCESS:[{MESSAGE:'IMEI Service List',LIST:{'Fixture Group':{GROUPNAME:'Fixture Group',GROUPTYPE:type,SERVICES:services}}}],apiversion:'6.1'});
  const legacyMock=(list=legacyList(),account=legacyAccount)=>async(_url,credential,action)=>{
    assert.equal(credential,legacyCredentials);assert(['accountinfo','imeiservicelist'].includes(action));
    return action==='accountinfo'?account:list;
  };
  const legacy=helpers.providerAdapter('DHRU_FUSION_LEGACY_V61');
  const adapter=helpers.providerAdapter('fusion_rest');
  const mock=raw=>async(_url,_token,path)=>{assert(['account','products'].includes(path));return raw;};
  await check('verified REST account uses exact decimal strings and read-only method surface',async()=>{
    const account=await adapter.account('https://provider.example/api/reseller/v1','fixture-token',mock(response({currency:'USD',balance:'123.123456789012'})));
    assert.deepEqual(account,{currency:'USD',balance:'123.123456789012'});
    assert.deepEqual(Object.keys(adapter).sort(),['account','catalog']);
    assert.throws(()=>helpers.providerAdapter('fusion_legacy'));
    assert.throws(()=>helpers.providerAdapter('simple_listener'));
    const numeric=await adapter.account('', '',mock('{"status":"success","code":200,"data":{"currency":"USD","balance":123.123456789012}}'));
    assert.equal(numeric.balance,'123.123456789012');
  });
  await check('HTTP-200 auth error, non-JSON, malformed balances and unknown currency fail safely',async()=>{
    for(const raw of [JSON.stringify({status:'error',code:401,message:'SECRET SHOULD NOT LEAK'}),'<html>bad</html>',
      response({currency:'USD',balance:'NaN'}),response({currency:'US',balance:'1'})]){
      await assert.rejects(adapter.account('','',mock(raw)),e=>!e.message.includes('SECRET')&&['AUTH_FAILED','INVALID_RESPONSE'].includes(e.category));
    }
  });
  await check('Legacy accountinfo authenticates and preserves exact numeric JSON money',async()=>{
    assert.deepEqual(await legacy.account('',legacyCredentials,legacyMock()),{currency:'USD',balance:'123.123456789012'});
    const raw='{"SUCCESS":[{"AccoutInfo":{"credit":123.123456789012,"currency":"USD"}}],"apiversion":"6.1"}';
    assert.equal((await legacy.account('',legacyCredentials,async()=>raw)).balance,'123.123456789012');
    assert.deepEqual(await legacy.account('',legacyCredentials,async()=> '{"SUCCESS":[{"AccoutInfo":{}}]}'),{currency:null,balance:null});
  });
  await check('Legacy invalid username/key and provider errors are truthful and redacted',async()=>{
    for(const _case of ['invalid username','invalid API key']){
      await assert.rejects(legacy.account('',legacyCredentials,async()=> '{"ERROR":[{"MESSAGE":"Authentication Failed"}]}'),
        e=>e.category==='AUTHENTICATION_FAILED'&&!e.message.includes('fixture'));
    }
    await assert.rejects(legacy.account('',legacyCredentials,async()=> '{"ERROR":[{"MESSAGE":"secret-upstream-error"}]}'),
      e=>e.category==='INVALID_RESPONSE'&&!e.message.includes('secret'));
  });
  await check('Legacy non-JSON, malformed envelopes, wrong versions/money/currency fail closed',async()=>{
    for(const raw of ['<html>error</html>','{"SUCCESS":{}}','{"SUCCESS":[{}]}','{"SUCCESS":[{},{}]}',
      '{"ERROR":[],"SUCCESS":[{"AccoutInfo":{}}]}','{"SUCCESS":[{"AccoutInfo":{"currency":"US"}}]}',
      '{"SUCCESS":[{"AccoutInfo":{"credit":"NaN"}}]}','{"SUCCESS":[{"AccoutInfo":{}}],"apiversion":"99"}']){
      await assert.rejects(legacy.account('',legacyCredentials,async()=>raw),e=>e.category==='INVALID_RESPONSE');
    }
  });
  await check('Legacy list normalizes IMEI, SERVER and explicitly referenced REMOTE; File remains review-only',async()=>{
    const items=(await legacy.catalog('',legacyCredentials,legacyMock())).items;
    assert.equal(items[0].costUnits,'1250000000001');assert.equal(items[0].currency,'USD');
    assert.equal(items[0].serviceType,'imei');assert.equal(items[0].categoryName,'Fixture Group');
    assert.deepEqual(items[0].requirements,[{key:'username',label:'USERNAME',type:'text',required:true}]);
    for(const [upstream,type] of [['SERVER','server'],['REMOTE','remote'],['FILE',null]]){
      const item=(await legacy.catalog('',legacyCredentials,legacyMock(legacyList({'123':legacyService({SERVICETYPE:upstream})},upstream)))).items[0];
      assert.equal(item.serviceType,type);if(!type)assert(item.reviewReasons.length);
    }
  });
  await check('Legacy requirements, quantity and undocumented metadata are review-blocked, not guessed',async()=>{
    for(const change of [{'Requires.Network':'Required'},{QNT:'1',QNTOPTIONS:'10,20'},{unknown:'secret-extra'},
      {'Requires.Custom':[{fieldname:'DATE',fieldtype:'datepicker',required:'1'}]}]){
      const item=(await legacy.catalog('',legacyCredentials,legacyMock(legacyList({'123':legacyService(change)})))).items[0];
      assert(item.reviewReasons.length);assert(!JSON.stringify(item.snapshot).includes('secret-extra'));
    }
    const p=legacyService({'Requires.SN':'Required','Requires.Reference':'Required','Requires.Custom':[
      {type:'serviceimei',fieldname:'USERTYPE',fieldtype:'dropdown',description:'',fieldoptions:'New,Existing',required:'0'}]});
    const item=(await legacy.catalog('',legacyCredentials,legacyMock(legacyList({'123':p})))).items[0];
    assert.deepEqual(item.requirements.map(f=>f.type),['reference','reference','select']);
    assert.deepEqual(item.requirements[2].options,['New','Existing']);
  });
  await check('Legacy missing currency and duplicate upstream IDs reject whole catalog before staging',async()=>{
    await assert.rejects(legacy.catalog('',legacyCredentials,legacyMock(legacyList(),'{"SUCCESS":[{"AccoutInfo":{}}]}')));
    const raw=JSON.stringify({SUCCESS:[{LIST:{a:{GROUPNAME:'a',GROUPTYPE:'IMEI',SERVICES:{'123':legacyService()}},
      b:{GROUPNAME:'b',GROUPTYPE:'IMEI',SERVICES:{'123':legacyService()}}}}]});
    await assert.rejects(legacy.catalog('',legacyCredentials,legacyMock(raw)));
    await assert.rejects(legacy.catalog('',legacyCredentials,legacyMock(legacyList({'wrong-id':legacyService()}))));
  });
  await check('HTTPS URL restrictions and public IPv4/IPv6 range policy',async()=>{
    for(const url of ['http://example.com/api/reseller/v1','https://user:pass@example.com/api/reseller/v1',
      'https://127.0.0.1/api/reseller/v1','https://2130706433/api/reseller/v1',
      'https://169.254.169.254/api/reseller/v1','https://10.0.0.1/api/reseller/v1',
      'https://[::1]/api/reseller/v1','https://[::ffff:127.0.0.1]/api/reseller/v1',
      'https://host.internal/api/reseller/v1','https://example.com:8443/api/reseller/v1',
      'https://example.com/api/reseller/v1?api_key=secret','https://example.com/wrong']){
      assert.throws(()=>helpers.providerUrl(url));
    }
    assert(helpers.publicAddress('8.8.8.8'));assert(helpers.publicAddress('2606:4700::1111'));
    for(const ip of ['0.0.0.0','100.64.1.1','198.18.0.1','192.0.2.1','224.1.1.1','fc00::1','fe80::1','ff00::1','2001:db8::1','2002:7f00:1::'])assert(!helpers.publicAddress(ip));
  });
  await check('real transport binds vetted DNS to TLS lookup; refuses redirects, mixed private DNS, HTTP failures, oversized/non-JSON results and network errors',async()=>{
    const mockPath=resolve('scripts/lib/provider-transport-mock.mjs');
    const pinned=await bundle('transport',`export * from '${entry}/lib/providers/transport.ts'; export {state} from '${mockPath}';`,
      [{name:'no-network',setup(b){
        b.onResolve({filter:/^node:(https|dns\/promises)$/},()=>({path:mockPath}));
        b.onLoad({filter:/\/providers\/transport\.ts$/},async({path})=>({
          contents:(await readFile(path,'utf8')).replaceAll('setTimeout(','boundedTestTimeout(')+
            '\nexport const deadlines:number[]=[];const boundedTestTimeout=(fn:any,ms:number)=>{deadlines.push(ms);return globalThis.setTimeout(fn,Math.min(ms,20));};',loader:'ts'}));
      }}]);
    const s=pinned.state,base='https://provider.example/api/reseller/v1';
    await pinned.safeRead(base,'fixture-token','account');
    assert.equal(s.dnsCalls,1);assert.equal(s.captured.address,'8.8.8.8');
    assert.equal(s.captured.options.method,'GET');assert.equal(s.captured.options.agent,false);
    assert.equal(s.captured.options.rejectUnauthorized,true);assert.equal(s.captured.options.servername,'provider.example');
    assert.equal(s.captured.url,base+'/account');
    for(const status of [302,401,500]){s.status=status;await assert.rejects(pinned.safeRead(base,'fixture-token','account'),e=>['AUTH_FAILED','UNREACHABLE','INVALID_RESPONSE'].includes(e.category));}
    s.status=200;s.records=[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}];
    const count=s.requests;await assert.rejects(pinned.safeRead(base,'fixture-token','account'));assert.equal(s.requests,count);
    s.records=[{address:'8.8.8.8',family:4}];s.contentType='text/html';await assert.rejects(pinned.safeRead(base,'fixture-token','account'));
    s.contentType='application/json';s.body='x'.repeat(8*1024*1024+1);await assert.rejects(pinned.safeRead(base,'fixture-token','products'));
    s.body='{}';s.networkError=true;await assert.rejects(pinned.safeRead(base,'fixture-token','account'),e=>e.category==='UNREACHABLE'&&!e.message.includes('fixture-token'));
    s.networkError=false;s.hang=true;await assert.rejects(pinned.safeRead(base,'fixture-token','account'),e=>e.category==='UNREACHABLE');
    assert(pinned.deadlines.includes(20000));assert(pinned.deadlines.includes(5000));
    await assert.rejects(pinned.safeRead(base,'fixture-token','order'));
    await check('Legacy transport uses form POST to exact URL, pinned TLS and never sends Bearer or query credentials',async()=>{
      s.hang=false;s.body=legacyAccount;
      const endpoint='https://provider.example/legacy/api.php';
      await pinned.safeLegacyRead(endpoint,legacyCredentials,'accountinfo');
      assert.equal(s.captured.url,endpoint);assert.equal(s.captured.options.method,'POST');
      assert.equal(s.captured.options.headers.Authorization,undefined);
      assert.equal(s.captured.options.headers['Content-Type'],'application/x-www-form-urlencoded');
      assert.equal(s.captured.options.rejectUnauthorized,true);assert.equal(s.captured.address,'8.8.8.8');
      const form=new URLSearchParams(s.captured.body);
      assert.deepEqual([...form.keys()].sort(),['action','apiaccesskey','username']);
      assert.equal(form.get('username'),'fixture-legacy-user');assert.equal(form.get('apiaccesskey'),'fixture-legacy-key');
      assert.equal(form.get('action'),'accountinfo');
      await pinned.safeLegacyRead('https://provider.example',legacyCredentials,'imeiservicelist');
      assert.equal(s.captured.url,'https://provider.example/');assert.equal(new URLSearchParams(s.captured.body).get('action'),'imeiservicelist');
      for(const status of [302,401,500]){
        s.status=status;await assert.rejects(pinned.safeLegacyRead(endpoint,legacyCredentials,'accountinfo'),
          e=>['INVALID_RESPONSE','AUTHENTICATION_FAILED','UNREACHABLE'].includes(e.category)&&!e.message.includes('fixture'));
      }
      s.status=200;s.networkError=true;await assert.rejects(pinned.safeLegacyRead(endpoint,legacyCredentials,'accountinfo'));
      s.networkError=false;s.hang=true;await assert.rejects(pinned.safeLegacyRead(endpoint,legacyCredentials,'accountinfo'));
      s.hang=false;s.records=[{address:'8.8.8.8',family:4},{address:'192.168.1.1',family:4}];
      const count=s.requests;await assert.rejects(pinned.safeLegacyRead(endpoint,legacyCredentials,'accountinfo'));assert.equal(s.requests,count);
      for(const raw of ['http://provider.example','https://127.0.0.1','https://provider.example?apiaccesskey=x',
        'https://user:key@provider.example','https://provider.example:8443','https://provider.internal',
        'https://provider.example/%2fsecret','https://provider.example/#secret']){
        assert.throws(()=>pinned.providerUrl(raw,'DHRU_FUSION_LEGACY_V61'));
      }
      await assert.rejects(pinned.safeLegacyRead(endpoint,legacyCredentials,'placeimeiorder'));
      await assert.rejects(pinned.safeLegacyRead(endpoint,legacyCredentials,'getimeiorder'));
    });
  });
  await check('isolated encryption tests: authenticated tenant/provider binding, versioning and missing-key fail closed',async()=>{
    const cryptoBuild=await build({entryPoints:[entry+'/lib/providers/credentials.ts'],bundle:true,write:false,platform:'node',format:'cjs',
      plugins:[{name:'error-only',setup(b){b.onLoad({filter:/\/lib\/auth\.ts$/},()=>({contents:'export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}',loader:'ts'}));}}]});
    const env={BHRU_PROVIDER_ENCRYPTION_KEY_V1:Buffer.alloc(32,7).toString('base64')},exports={};
    const ctx={module:{exports},exports,require,process:{env},Buffer};
    vm.runInNewContext(cryptoBuild.outputFiles[0].text,ctx);
    const c=ctx.module.exports,id=randomUUID(),sealed=c.encryptToken(sub,id,'fixture-token');
    assert(!JSON.stringify(sealed).includes('fixture-token'));assert.equal(c.decryptToken(sub,id,sealed),'fixture-token');
    assert.throws(()=>c.decryptToken(other,id,sealed));
    assert.throws(()=>c.decryptToken(sub,randomUUID(),sealed));
    assert.throws(()=>c.decryptToken(sub,id,{...sealed,keyVersion:2}));
    delete env.BHRU_PROVIDER_ENCRYPTION_KEY_V1;
    assert.equal(c.providerStorageReady(),false);assert.throws(()=>c.encryptToken(sub,id,'x'),e=>e.status===503);
  });
  let items=(await adapter.catalog('','',mock(catalog()))).items;
  await check('catalog exact costs, type mapping, required IMEI, null availability and unsupported constraints',async()=>{
    assert.equal(items[0].costUnits,'1250000000001');assert.equal(items[0].requirements[0].key,'imei');assert.equal(items[0].availability,null);
    const unsupported=(await adapter.catalog('','',mock(catalog({'1':product({type:'weird'}),'2':product({fields:[{type:'imei',name:'IMEI',required:true,regex:'x'}]}),'3':product({enabled:false})})))).items;
    assert(unsupported[0].reviewReasons.length);assert(unsupported[1].reviewReasons.length);assert.equal(unsupported[2].availability,false);
    await assert.rejects(adapter.catalog('','',mock(response({currency:'USD',categories:{},products:{},has_more:true}))));
  });
  await check('percentage, fixed and combined markup plus FX use integer arithmetic only',async()=>{
    assert.equal(helpers.markupPrice(1000000000000n,'10','0'),1100000000000n);
    assert.equal(helpers.markupPrice(1000000000000n,'0','0.25'),1250000000000n);
    assert.equal(helpers.markupPrice(1000000000000n,'10','0.25'),1350000000000n);
    assert.equal(helpers.convertCost(260000000000000n,260000000n),1000000000000n);
    assert.equal(helpers.markupPrice(1n,'0','0.000000000001'),2n);
  });
  // Disposable tenant identities only. Application worker is not started by this script.
  for(const [sid,uid] of [[sub,owner],[other,ownerB]]){
    await pool.query('INSERT INTO subscribers(id,business,public_slug) VALUES($1,$2,$3)',[sid,'Provider verification','provider-fixture-'+sid.slice(0,8)]);
    await pool.query(`INSERT INTO account_users(id,subscriber_id,full_name,username,email,phone,country,password_hash)
      VALUES($1,$2,'Provider verification',$3,$4,'000','Other','scrypt$fixture')`,
      [uid,sid,'provider_'+uid.replaceAll('-',''),uid+'@example.invalid']);
  }
  db=await pool.connect();await db.query('BEGIN');
  const create=async(sid,name)=>helpers.configureProvider(sid,undefined,{name,protocol:'fusion_rest',baseUrl:'https://provider.example/api/reseller/v1',token:'fixture-token',enabled:true,currency:'USD'},db);
  const p=await create(sub,'Read-only provider'),pb=await create(other,'Other tenant provider');
  const legacyInput={name:'Legacy read-only provider',protocol:'DHRU_FUSION_LEGACY_V61',baseUrl:'https://provider.example',
    username:'fixture-legacy-user',apiAccessKey:'fixture-legacy-key',enabled:true,currency:'USD'};
  const lp=await helpers.configureProvider(sub,undefined,legacyInput,db);
  await check('Legacy credential pair is encrypted, tenant-bound, redacted and replaceable without protocol changes',async()=>{
    assert(!JSON.stringify(lp).includes('fixture-legacy'));
    const stored=(await db.query('SELECT credentials_encrypted FROM external_providers WHERE id=$1',[lp.id])).rows[0].credentials_encrypted;
    assert(!JSON.stringify(stored).includes('fixture-legacy'));
    assert.equal(helpers.decryptToken(sub,lp.id,stored),legacyCredentials);
    assert.throws(()=>helpers.decryptToken(other,lp.id,stored));
    await assert.rejects(helpers.configureProvider(other,lp.id,legacyInput,db),e=>e.status===404);
    await assert.rejects(helpers.configureProvider(sub,lp.id,{...legacyInput,protocol:'fusion_rest',token:'fixture',
      username:undefined,apiAccessKey:undefined,baseUrl:p.baseUrl},db));
    await assert.rejects(helpers.configureProvider(sub,lp.id,{...legacyInput,apiAccessKey:undefined},db),e=>e.status===400);
    await helpers.configureProvider(sub,lp.id,{...legacyInput,username:'fixture-replacement',apiAccessKey:'fixture-replacement-key'},db);
    const replaced=(await db.query('SELECT credentials_encrypted FROM external_providers WHERE id=$1',[lp.id])).rows[0].credentials_encrypted;
    assert.equal(JSON.parse(helpers.decryptToken(sub,lp.id,replaced)).username,'fixture-replacement');
    const {username,apiAccessKey,...keep}=legacyInput;
    await helpers.configureProvider(sub,lp.id,{...keep,name:'Edited Legacy name'},db);
    assert.deepEqual((await db.query('SELECT credentials_encrypted FROM external_providers WHERE id=$1',[lp.id])).rows[0].credentials_encrypted,replaced);
  });
  await check('Legacy staged sync deduplicates and detects metadata/requirement changes',async()=>{
    const j=await helpers.enqueueProviderJob(sub,lp.id,owner,'SYNC',db);
    assert.equal((await helpers.enqueueProviderJob(sub,lp.id,owner,'SYNC',db)).id,j.id);
    const items=(await legacy.catalog('',legacyCredentials,legacyMock())).items;
    assert.equal((await helpers.stageCatalog(sub,lp.id,j.id,items,db)).new,1);
    assert.equal((await helpers.stageCatalog(sub,lp.id,j.id,items,db)).changed,0);
    const changed=(await legacy.catalog('',legacyCredentials,legacyMock(legacyList({'123':legacyService({INFO:'New description'})})))).items;
    assert.equal((await helpers.stageCatalog(sub,lp.id,j.id,changed,db)).changed,1);
    assert.equal((await db.query('SELECT count(*)::int n FROM external_provider_catalog WHERE provider_id=$1',[lp.id])).rows[0].n,1);
  });
  await check('saved connection is Not Tested, safe response contains no token; replacement remains encrypted',async()=>{
    assert.equal(p.health,'NOT_TESTED');assert(!JSON.stringify(p).includes('fixture-token'));
    const stored=(await db.query('SELECT credentials_encrypted FROM external_providers WHERE id=$1',[p.id])).rows[0];
    assert(!JSON.stringify(stored).includes('fixture-token'));
    const changed=await helpers.configureProvider(sub,p.id,{name:p.name,protocol:'fusion_rest',baseUrl:p.baseUrl,token:'replaced-fixture-token',enabled:true,currency:'USD'},db);
    assert(!JSON.stringify(changed).includes('replaced-fixture-token'));
  });
  await check('tenant B cannot read/edit A, or enqueue/import its provider',async()=>{
    await assert.rejects(helpers.providerRow(other,p.id,db),e=>e.status===404);
    await assert.rejects(helpers.configureProvider(other,p.id,{name:'x',protocol:'fusion_rest',baseUrl:p.baseUrl,enabled:false},db),e=>e.status===404);
    await assert.rejects(helpers.enqueueProviderJob(other,p.id,ownerB,'SYNC',db),e=>e.status===404);
    await assert.rejects(helpers.previewImport(other,p.id,{items:[{id:randomUUID()}],pricing:{percentage:'0',fixedUsd:'1',groups:[]}},db),e=>e.status===404);
  });
  const job=await helpers.enqueueProviderJob(sub,p.id,owner,'SYNC',db);
  await check('sync job exists before execution and duplicate live job deduplicates',async()=>{
    assert.equal(job.state,'QUEUED');assert.equal((await helpers.enqueueProviderJob(sub,p.id,owner,'SYNC',db)).id,job.id);
  });
  await check('first/repeated catalog sync idempotency and exact staged source snapshot',async()=>{
    const first=await helpers.stageCatalog(sub,p.id,job.id,items,db);assert.equal(first.new,1);
    const again=await helpers.stageCatalog(sub,p.id,job.id,items,db);assert.equal(again.new,0);assert.equal(again.changed,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM external_provider_catalog WHERE provider_id=$1',[p.id])).rows[0].n,1);
  });
  await check('changed cost/requirements detected; failed partial fetch cannot classify missing',async()=>{
    const changed=(await adapter.catalog('','',mock(catalog({'123':product({price:'2',fields:[{type:'imei',name:'IMEI',required:false}]})})))).items;
    const result=await helpers.stageCatalog(sub,p.id,job.id,changed,db);assert.equal(result.changed,1);
    const row=(await db.query('SELECT * FROM external_provider_catalog WHERE provider_id=$1',[p.id])).rows[0];
    assert(row.changes.includes('cost'));assert(row.changes.includes('fields'));assert.equal(row.previous_snapshot.cost,'1.250000000001');
    await assert.rejects(adapter.catalog('','',mock(response({currency:'USD',categories:{},products:{},page:1}))));
    assert.equal((await db.query('SELECT missing FROM external_provider_catalog WHERE id=$1',[row.id])).rows[0].missing,false);
  });
  const stage=(await db.query('SELECT * FROM external_provider_catalog WHERE provider_id=$1',[p.id])).rows[0];
  const pricing={percentage:'10',fixedUsd:'0.25',groups:[]};
  const input={items:[{id:stage.id,name:'Local renamed service'}],pricing};
  const preview=await helpers.previewImport(sub,p.id,input,db);
  let imported;
  await check('preview-confirmed import uses canonical inactive catalog identity and exact markup',async()=>{
    assert.equal(preview.items[0].proposedPriceUsd,'2.45');
    imported=await helpers.importServices(sub,p.id,{...input,previewHash:preview.previewHash},db);
    assert.equal(imported.imported,1);
    const r=(await db.query('SELECT * FROM manual_services WHERE id=$1',[imported.serviceIds[0]])).rows[0];
    assert.equal(r.name,'Local renamed service');assert.equal(r.active,false);assert.equal(r.fulfillment_source,'external_provider');assert.equal(String(r.selling_price_usd_units),'2450000000000');
  });
  await check('duplicate import is a no-op, source sync does not reprice linked catalog',async()=>{
    assert.equal((await helpers.importServices(sub,p.id,{...input,previewHash:preview.previewHash},db)).imported,0);
    const higher=(await adapter.catalog('','',mock(catalog({'123':product({price:'3'})})))).items;
    await helpers.stageCatalog(sub,p.id,job.id,higher,db);
    assert.equal(String((await db.query('SELECT selling_price_usd_units FROM manual_services WHERE id=$1',[imported.serviceIds[0]])).rows[0].selling_price_usd_units),'2450000000000');
  });
  await check('external service cannot be enabled via ordinary edit, SQL update or active customer catalog',async()=>{
    await assert.rejects(helpers.serviceRow(sub,imported.serviceIds[0],db,true),e=>e.status===404);
    await assert.rejects(helpers.saveService(sub,imported.serviceIds[0],{name:'Enabled bypass',serviceType:'imei',priceUsd:'2',active:true,displayOrder:0,requirements:[]},db),e=>e.status===409);
    await db.query('SAVEPOINT gate');
    await assert.rejects(db.query('UPDATE manual_services SET active=true WHERE id=$1',[imported.serviceIds[0]]));
    await db.query('ROLLBACK TO SAVEPOINT gate');
    await db.query('SAVEPOINT source');
    await assert.rejects(db.query("UPDATE manual_services SET fulfillment_source='manual',active=true WHERE id=$1",[imported.serviceIds[0]]));
    await db.query('ROLLBACK TO SAVEPOINT source');
  });
  await check('non-USD pricing blocked without explicit approved FX',async()=>{
    await assert.rejects(helpers.costFx(sub,'DZD',db),e=>e.status===409);
  });
  await check('successful complete absence marks staged missing, never deletes/disables/changes linked service',async()=>{
    assert.equal((await helpers.stageCatalog(sub,p.id,job.id,[],db)).missing,1);
    assert.equal((await db.query('SELECT missing FROM external_provider_catalog WHERE id=$1',[stage.id])).rows[0].missing,true);
    assert.equal((await db.query('SELECT count(*)::int n FROM manual_services WHERE id=$1',[imported.serviceIds[0]])).rows[0].n,1);
  });
  await check('existing manually fulfilled service creation and enablement remain operational',async()=>{
    const manual=await helpers.saveService(sub,undefined,{name:'Manual fixture',serviceType:'server',priceUsd:'1',active:true,displayOrder:0,requirements:[]},db);
    assert.equal(manual.active,true);assert.equal(manual.fulfillmentSource,'manual');
    assert.equal((await helpers.serviceRow(sub,manual.id,db,true)).id,manual.id);
  });
  await check('existing customer override > active group > standard pricing remains intact for canonical imports',async()=>{
    const client=randomUUID(),vip=randomUUID();
    await db.query(`INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,number_format,rate,decimals,enabled,client_default,is_base,rate_configured,registration_available)
      VALUES($1,'USD','US Dollar','$','','1,000.00',1,2,true,true,true,true,true) ON CONFLICT(subscriber_id,code) DO NOTHING`,[sub]);
    await db.query("INSERT INTO reseller_client_groups(id,subscriber_id,name) VALUES($1,$2,'Pricing fixture')",[vip,sub]);
    await db.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,client_code,username,preferred_currency,client_group_id)
      VALUES($1,$2,'Provider','Fixture',$3,'scrypt$fixture',$4,$5,'USD',$6)`,
      [client,sub,client+'@example.invalid',client.replaceAll('-','').slice(0,8).toUpperCase(),'fixture_'+client.slice(0,8),vip]);
    const currency={code:'USD',name:'US Dollar',prefix:'$',suffix:'',number_format:'1,000.00',rate:'1.000000',decimals:2,enabled:true,client_default:true,is_base:true,rate_configured:true,usd_basis_configured:true};
    const r=await helpers.serviceRow(sub,imported.serviceIds[0],db);
    const effective=()=>helpers.effectivePrice(sub,client,r,db,currency);
    assert.equal((await effective()).view.source,'STANDARD');
    await db.query("INSERT INTO client_group_service_prices(subscriber_id,group_id,service_id,method,value_units) VALUES($1,$2,$3,'FIXED_PRICE',3000000000000)",[sub,vip,r.id]);
    assert.equal((await effective()).view.source,'GROUP');assert.equal((await effective()).view.effectivePriceUsd,'3');
    await db.query("INSERT INTO customer_service_prices(subscriber_id,customer_id,service_id,method,value_units) VALUES($1,$2,$3,'FIXED_PRICE',1500000000000)",[sub,client,r.id]);
    assert.equal((await effective()).view.source,'CUSTOMER');assert.equal((await effective()).view.effectivePriceUsd,'1.5');
    await db.query('DELETE FROM customer_service_prices WHERE subscriber_id=$1 AND customer_id=$2',[sub,client]);
    await db.query('UPDATE reseller_client_groups SET is_active=false WHERE id=$1',[vip]);
    assert.equal((await effective()).view.source,'STANDARD');
  });
  await db.query('ROLLBACK');db.release();db=null;
  // Commit only fake provider/job fixtures to test competing actual PostgreSQL claims.
  const fixtureId=randomUUID();
  await pool.query(`INSERT INTO external_providers(id,subscriber_id,protocol,name,base_url,credentials_encrypted,enabled)
    VALUES($1,$2,'fusion_rest','Claim fixture','https://provider.example/api/reseller/v1','{}',false)`,[fixtureId,sub]);
  for(let n=0;n<2;n++){
    const provider=n?randomUUID():fixtureId;
    if(n)await pool.query(`INSERT INTO external_providers(id,subscriber_id,protocol,name,base_url,credentials_encrypted,enabled)
      VALUES($1,$2,'fusion_rest','Claim fixture 2','https://provider.example/api/reseller/v1','{}',false)`,[provider,sub]);
    await pool.query(`INSERT INTO external_provider_jobs(id,subscriber_id,provider_id,actor_id,kind,config_version)
      VALUES($1,$2,$3,$4,'SYNC',1)`,[randomUUID(),sub,provider,owner]);
  }
  await check('actual concurrent PostgreSQL workers enforce one running job per tenant',async()=>{
    const claims=await Promise.all([helpers.claimProviderJob(),helpers.claimProviderJob()]);
    assert.equal(claims.filter(Boolean).length,1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM external_provider_jobs WHERE subscriber_id=$1 AND state='RUNNING'",[sub])).rows[0].n,1);
    const j=claims.find(Boolean);
    await pool.query("UPDATE external_provider_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[j.id]);
    const reclaimed=await helpers.claimProviderJob();assert.equal(reclaimed.id,j.id);assert.notEqual(reclaimed.lease_token,j.lease_token);
    const stale=await pool.query("UPDATE external_provider_jobs SET state='COMPLETED' WHERE id=$1 AND lease_token=$2",[j.id,j.lease_token]);assert.equal(stale.rowCount,0);
  });
  await pool.query("UPDATE external_provider_jobs SET state='FAILED',lease_until=NULL,lease_token=NULL WHERE subscriber_id=$1",[sub]);
  const mockTransportPath=resolve('scripts/lib/provider-transport-mock.mjs');
  api=await bundle('http',`export {default as router} from '${entry}/routes/external-providers.ts';
    export {loadSession,csrfProtection} from '${entry}/lib/auth.ts';export {pool} from '@workspace/db';
    export {state} from '${mockTransportPath}';`,
    [{name:'quiet-test-logger',setup(b){b.onLoad({filter:/\/lib\/logger\.ts$/},()=>({contents:'export const logger={warn(){},info(){},error(){}};',loader:'ts'}));}},
     {name:'no-upstream-network',setup(b){b.onResolve({filter:/^node:(https|dns\/promises)$/},()=>({path:mockTransportPath}));}}]);
  const express=require('express'),cookieParser=require('cookie-parser'),app=express();
  app.use(express.json(),cookieParser(),api.loadSession);
  app.use('/api',api.csrfProtection,api.router);
  app.use((e,_req,res,_next)=>res.status(e.status??(e.name==='ZodError'?400:500)).json({error:e.name==='ZodError'?'Invalid input':e.message}));
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  const sessionDb=await pool.connect();
  const tokenA=await helpers.createSession(sessionDb,{id:owner,subscriber_id:sub,full_name:'Fixture A',admin:false});
  const tokenB=await helpers.createSession(sessionDb,{id:ownerB,subscriber_id:other,full_name:'Fixture B',admin:false});sessionDb.release();
  const call=async(path,method='GET',body,cookie=`bhru_session=${tokenA}`,headers={})=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/external-providers${path}`,{
      method,headers:{'Content-Type':'application/json','X-BHRU-Request':'1',Cookie:cookie,...headers},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  };
  let live;
  await check('actual HTTP subscriber sessions, customer/admin denial, CSRF and tenant ownership',async()=>{
    assert.equal((await call('','GET',undefined,'')).status,401);
    assert.equal((await call('','GET',undefined,'bhru_customer_session=fixture')).status,401);
    assert.equal((await call('','GET',undefined,`bhru_session=${tokenA}`,{'X-BHRU-Auth':'admin'})).status,401);
    assert.throws(()=>helpers.subscriberContext({auth:{id:owner,admin:true},get:()=>undefined}),e=>e.status===403);
    const input={name:'HTTP fixture',protocol:'fusion_rest',baseUrl:'https://provider.example/api/reseller/v1',token:'fixture-token',enabled:true};
    assert.equal((await call('','POST',input,undefined,{'X-BHRU-Request':'0'})).status,403);
    assert.equal((await call('','POST',input,undefined,{Origin:'https://evil.example'})).status,403);
    const saved=await call('','POST',input);assert.equal(saved.status,201);live=saved.body;
    assert(!JSON.stringify(live).includes('fixture-token'));assert.equal(live.health,'NOT_TESTED');
    const listB=await call('','GET',undefined,`bhru_session=${tokenB}`);assert(!listB.body.data.some(p=>p.id===live.id));
    for(const [path,method,body] of [[`/${live.id}`,'PATCH',input],[`/${live.id}/jobs`,'POST',{kind:'SYNC'}],[`/${live.id}/catalog`,'GET'],[`/${live.id}/jobs`,'GET']]){
      assert.equal((await call(path,method,body,`bhru_session=${tokenB}`)).status,404);
    }
    assert.equal((await call('/test','POST',{...input,baseUrl:'https://127.0.0.1/api/reseller/v1'})).status,400);
  });
  await check('real durable worker records successful account, catalog history and failed-response state without wallet mutation',async()=>{
    assert.equal((await call(`/${live.id}/jobs`,'POST',{kind:'TEST'})).status,202);
    let j=await helpers.claimProviderJob();assert(j);await helpers.runProviderJob(j,mock(response({currency:'USD',balance:'999.123456789012'})));
    let row=(await pool.query('SELECT * FROM external_providers WHERE id=$1',[live.id])).rows[0];
    assert.equal(row.health,'CONNECTED');assert.equal(row.balance,'999.123456789012');assert(row.last_test_at);
    assert.equal((await call(`/${live.id}/jobs`,'POST',{kind:'SYNC'})).status,202);
    j=await helpers.claimProviderJob();await helpers.runProviderJob(j,mock(catalog()));
    let hist=await call(`/${live.id}/jobs`);assert.equal(hist.body.data[0].state,'COMPLETED');assert.equal(hist.body.data[0].counts.fetched,1);
    assert.equal((await call(`/${live.id}/catalog`)).body.data.length,1);
    await call(`/${live.id}/jobs`,'POST',{kind:'SYNC'});j=await helpers.claimProviderJob();
    await helpers.runProviderJob(j,mock('<html>invalid fixture</html>'));
    hist=await call(`/${live.id}/jobs`);assert.equal(hist.body.data[0].state,'FAILED');assert.equal(hist.body.data[0].safeError,'INVALID_RESPONSE');
    assert.equal((await call(`/${live.id}/catalog`)).body.data[0].missing,false);
  });
  await check('actual concurrent import requests create exactly one canonical service/link',async()=>{
    const catalogResponse=await call(`/${live.id}/catalog`),item=catalogResponse.body.data[0];
    const data={items:[{id:item.id}],pricing:{percentage:'0',fixedUsd:'1',groups:[]}};
    const pv=await call(`/${live.id}/preview`,'POST',data);assert.equal(pv.status,200);
    const both=await Promise.all([call(`/${live.id}/import`,'POST',{...data,previewHash:pv.body.previewHash}),call(`/${live.id}/import`,'POST',{...data,previewHash:pv.body.previewHash})]);
    assert(both.every(r=>r.status===200));assert.equal(both.reduce((n,r)=>n+r.body.imported,0),1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM external_provider_service_links WHERE provider_id=$1',[live.id])).rows[0].n,1);
  });
  await check('transient failures use bounded backoff; retries exhaust; disabled provider fails without upstream I/O',async()=>{
    await call(`/${live.id}/jobs`,'POST',{kind:'TEST'});
    let j=await helpers.claimProviderJob();
    await helpers.runProviderJob(j,async()=>{throw new helpers.ProviderError('UNREACHABLE',true);});
    let stored=(await pool.query('SELECT * FROM external_provider_jobs WHERE id=$1',[j.id])).rows[0];
    assert.equal(stored.state,'QUEUED');assert(stored.next_attempt_at>new Date());
    for(let n=0;n<3;n++){
      await pool.query('UPDATE external_provider_jobs SET next_attempt_at=now() WHERE id=$1',[j.id]);
      j=await helpers.claimProviderJob();assert(j);
      await helpers.runProviderJob(j,async()=>{throw new helpers.ProviderError('UNREACHABLE',true);});
    }
    stored=(await pool.query('SELECT * FROM external_provider_jobs WHERE id=$1',[j.id])).rows[0];
    assert.equal(stored.attempts,4);assert.equal(stored.state,'FAILED');
    await call(`/${live.id}/jobs`,'POST',{kind:'SYNC'});j=await helpers.claimProviderJob();
    await call(`/${live.id}`,'PATCH',{name:live.name,protocol:'fusion_rest',baseUrl:live.baseUrl,enabled:false,currency:live.currency});
    let reads=0;await helpers.runProviderJob(j,async()=>{reads++;return catalog();});
    assert.equal(reads,0);assert.equal((await pool.query('SELECT state FROM external_provider_jobs WHERE id=$1',[j.id])).rows[0].state,'FAILED');
  });
  let legacyLive;
  await check('Legacy HTTP add/edit/test routes use masked credentials, authenticated states, CSRF and tenant isolation',async()=>{
    const created=await call('','POST',legacyInput);assert.equal(created.status,201);legacyLive=created.body;
    assert.equal(legacyLive.health,'NOT_TESTED');assert(!JSON.stringify(created.body).includes('fixture-legacy'));
    assert.equal((await call(`/${legacyLive.id}/catalog`,'GET',undefined,`bhru_session=${tokenB}`)).status,404);
    assert.equal((await call(`/${legacyLive.id}`,'PATCH',legacyInput,`bhru_session=${tokenB}`)).status,404);
    assert.equal((await call(`/${legacyLive.id}/jobs`,'POST',{kind:'SYNC'},`bhru_session=${tokenB}`)).status,404);
    assert.equal((await call(`/${legacyLive.id}/import`,'POST',{items:[{id:randomUUID()}],
      pricing:{percentage:'0',fixedUsd:'1',groups:[]}},`bhru_session=${tokenB}`)).status,404);
    assert.equal((await call(`/${legacyLive.id}`,'PATCH',legacyInput,undefined,{'X-BHRU-Request':'0'})).status,403);
    assert.equal((await call('/test','POST',{...legacyInput,baseUrl:'https://127.0.0.1'})).status,400);
    api.state.body=legacyAccount;
    const success=await call('/test','POST',legacyInput);assert.equal(success.status,200);
    assert.equal(success.body.health,'CONNECTED');assert.equal(success.body.balance,'123.123456789012');
    assert.equal(api.state.captured.options.method,'POST');
    for(const wrong of [{username:'wrong-user'},{apiAccessKey:'wrong-key'}]){
      api.state.body='{"ERROR":[{"MESSAGE":"Authentication Failed"}]}';
      const failed=await call('/test','POST',{...legacyInput,...wrong});
      assert.equal(failed.body.health,'AUTHENTICATION_FAILED');assert.equal(failed.body.balance,null);
    }
    api.state.body='<html>failure</html>';
    assert.equal((await call('/test','POST',legacyInput)).body.health,'INVALID_RESPONSE');
    api.state.networkError=true;
    assert.equal((await call('/test','POST',legacyInput)).body.health,'UNREACHABLE');api.state.networkError=false;
    assert.equal((await call('/test','POST',{...legacyInput,enabled:false})).body.health,'DISABLED');
    assert.equal((await call(`/${legacyLive.id}`,'PATCH',{name:'Wrong protocol',protocol:'fusion_rest',
      baseUrl:'https://provider.example/api/reseller/v1',enabled:true,token:'fixture-rest-token'})).status,409);
  });
  await check('Legacy durable worker authenticates, syncs with currency, deduplicates and records independent history',async()=>{
    await call(`/${legacyLive.id}/jobs`,'POST',{kind:'TEST'});
    let j=await helpers.claimProviderJob();assert(j);await helpers.runProviderJob(j,legacyMock());
    let rows=(await call('')).body.data,stored=rows.find(r=>r.id===legacyLive.id);
    assert.equal(stored.health,'CONNECTED');assert.equal(stored.balance,'123.123456789012');
    const a=await call(`/${legacyLive.id}/jobs`,'POST',{kind:'SYNC'});
    assert.equal((await call(`/${legacyLive.id}/jobs`,'POST',{kind:'SYNC'})).body.id,a.body.id);
    j=await helpers.claimProviderJob();await helpers.runProviderJob(j,legacyMock());
    assert.equal((await call(`/${legacyLive.id}/catalog`)).body.data.length,1);
    await call(`/${legacyLive.id}/jobs`,'POST',{kind:'SYNC'});
    j=await helpers.claimProviderJob();await helpers.runProviderJob(j,legacyMock());
    const hist=await call(`/${legacyLive.id}/jobs`);assert.equal(hist.body.data[0].counts.new,0);assert.equal(hist.body.data[0].counts.changed,0);
    await call(`/${legacyLive.id}/jobs`,'POST',{kind:'TEST'});j=await helpers.claimProviderJob();
    await helpers.runProviderJob(j,async()=> '{"ERROR":[{"MESSAGE":"Authentication Failed"}]}');
    stored=(await call('')).body.data.find(r=>r.id===legacyLive.id);assert.equal(stored.health,'AUTHENTICATION_FAILED');
  });
  await check('Legacy pricing preview/import reuses canonical catalog, remains inactive and concurrent imports deduplicate',async()=>{
    const item=(await call(`/${legacyLive.id}/catalog`)).body.data[0];
    assert.equal(item.cost,'1.250000000001');assert.equal(item.currency,'USD');
    const data={items:[{id:item.id}],pricing:{percentage:'20',fixedUsd:'1',groups:[]}};
    const preview=await call(`/${legacyLive.id}/preview`,'POST',data);assert.equal(preview.status,200);
    const result=await Promise.all([call(`/${legacyLive.id}/import`,'POST',{...data,previewHash:preview.body.previewHash}),
      call(`/${legacyLive.id}/import`,'POST',{...data,previewHash:preview.body.previewHash})]);
    assert(result.every(r=>r.status===200));assert.equal(result.reduce((n,r)=>n+r.body.imported,0),1);
    const service=(await pool.query(`SELECT s.* FROM manual_services s JOIN external_provider_service_links l
      ON s.id=l.service_id AND s.subscriber_id=l.subscriber_id WHERE l.provider_id=$1`,[legacyLive.id])).rows[0];
    assert.equal(service.active,false);assert.equal(service.fulfillment_source,'external_provider');
    assert.equal(String(service.selling_price_usd_units),'2500000000001');
    await assert.rejects(pool.query('UPDATE manual_services SET active=true WHERE id=$1',[service.id]));
  });
  await check('Legacy disable keeps encrypted credentials and stops all upstream reads',async()=>{
    const {username,apiAccessKey,...data}=legacyInput;
    const before=(await pool.query('SELECT credentials_encrypted FROM external_providers WHERE id=$1',[legacyLive.id])).rows[0].credentials_encrypted;
    await call(`/${legacyLive.id}/jobs`,'POST',{kind:'TEST'});const j=await helpers.claimProviderJob();
    assert.equal((await call(`/${legacyLive.id}`,'PATCH',{...data,enabled:false})).body.health,'DISABLED');
    let reads=0;await helpers.runProviderJob(j,async()=>{reads++;return legacyAccount;});assert.equal(reads,0);
    assert.deepEqual((await pool.query('SELECT credentials_encrypted FROM external_providers WHERE id=$1',[legacyLive.id])).rows[0].credentials_encrypted,before);
    assert.equal((await call(`/${legacyLive.id}/jobs`,'POST',{kind:'TEST'})).status,409);
  });
  await check('wallet/ledger/orders/client prices/access and Retail data unchanged',async()=>assert.deepEqual(await digest(),before));
  console.log(`RESULT: ${passed} focused provider checks passed. No upstream network request or paid order.`);
}finally{
  if(db){await db.query('ROLLBACK');db.release();}
  if(server)await new Promise(r=>server.close(r));
  // Remove only disposable tenant fixtures, never reset/truncate/drop any table.
  const cleanup=await pool.connect();
  try{
    await cleanup.query('BEGIN');
    await cleanup.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])',[[owner,ownerB]]);
    await cleanup.query('DELETE FROM audit_logs WHERE actor_id=ANY($1::uuid[])',[[owner,ownerB]]);
    const tables=(await cleanup.query("SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND c.column_name='subscriber_id' AND t.table_type='BASE TABLE' AND c.table_name<>'subscribers'")).rows.map(r=>r.table_name);
    let pending=tables;
    for(let n=0;n<tables.length&&pending.length;n++){
      const next=[];
      for(const table of pending){
        assert(/^[a-z_]+$/.test(table));await cleanup.query('SAVEPOINT cleanup_one');
        try{await cleanup.query(`DELETE FROM "${table}" WHERE subscriber_id=ANY($1::uuid[])`,[tenants]);}
        catch{await cleanup.query('ROLLBACK TO SAVEPOINT cleanup_one');next.push(table);}
      }
      if(next.length===pending.length)throw Error('Disposable fixture cleanup is blocked.');
      pending=next;
    }
    await cleanup.query('DELETE FROM subscribers WHERE id=ANY($1::uuid[])',[tenants]);await cleanup.query('COMMIT');
  }catch(e){await cleanup.query('ROLLBACK');throw e;}finally{
    cleanup.release();await pool.end();if(helpers)await helpers.pool.end();if(api)await api.pool.end();await rm(out,{recursive:true,force:true});
  }
}
