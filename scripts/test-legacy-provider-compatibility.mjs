// Offline companion to test-external-providers.mjs. No DB imports or live I/O.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const {build}=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url))('esbuild');
const out=await mkdtemp(join(tmpdir(),'bhru-legacy-compatibility-'));
let passed=0;
const check=async(label,run)=>{await run();console.log(`PASS ${++passed}: ${label}`)};
try{
  const entry=resolve('artifacts/api-server/src/lib/providers'),mock=resolve('scripts/lib/provider-transport-mock.mjs');
  await build({
    stdin:{contents:`export {providerAdapter} from '${entry}/adapter.ts';
      export {safeLegacyRead,safeRead,providerUrl,ProviderError} from '${entry}/transport.ts';
      export {runProviderJob} from '${entry}/worker.ts';
      export {TestExternalProviderDraftResponse} from '${resolve('lib/api-zod/src/generated/api.ts')}';
      export {state} from '${mock}';
      export {providerFailureMessage,providerSavedFailureMessage} from '${resolve('artifacts/bhru/src/lib/provider-diagnostics.ts')}';`,
      resolveDir:process.cwd(),loader:'ts'},
    bundle:true,platform:'node',format:'esm',outfile:join(out,'offline.mjs'),
    alias:{'@workspace/currency-presentation':resolve('lib/currency-presentation/src/index.mts')},
    plugins:[{name:'no-live-network',setup(b){
      b.onResolve({filter:/^node:(https|dns\/promises)$/},()=>({path:mock}));
      b.onLoad({filter:/\/lib\/auth\.ts$/},()=>({
        contents:'export class HttpError extends Error {constructor(status,message){super(message);this.status=status}}',loader:'ts'}));
      b.onLoad({filter:/\/lib\/logger\.ts$/},()=>({
        contents:`export {logger} from '${mock}';`,loader:'ts'}));
      b.onLoad({filter:/\/lib\/platform\.ts$/},()=>({
        contents:`import {state} from '${mock}';
          export const transaction=async fn=>fn({query:async(sql,values)=>{
            state.queries.push({sql,values});return {rowCount:1,rows:[]};}});`,loader:'ts'}));
      b.onLoad({filter:/\/providers\/connections\.ts$/},()=>({
        contents:`import {state} from '${mock}';
          export const providerRow=async(sub,id)=>{
            if(sub!==state.workerProvider.subscriber_id||id!==state.workerProvider.id)throw Error('Wrong tenant');
            return state.workerProvider;};`,loader:'ts'}));
      b.onLoad({filter:/\/providers\/credentials\.ts$/},()=>({
        contents:`import {state} from '${mock}'; export const decryptToken=()=>state.workerCredentials;`,loader:'ts'}));
    }}],
  });
  const m=await import('file://'+join(out,'offline.mjs'));
  const a=m.providerAdapter('DHRU_FUSION_LEGACY_V61'),rest=m.providerAdapter('fusion_rest');
  const endpoint='https://provider.example',username='synthetic user+&é',key='synthetic-key+=&';
  const credentials=JSON.stringify({username,apiAccessKey:key});
  const valid='{"SUCCESS":[{"AccoutInfo":{"credit":123.123456789012,"currency":"USD"}}],"apiversion":"6.1"}';
  const reset=()=>Object.assign(m.state,{status:200,body:valid,contentType:'application/json; charset=utf-8',
    encoding:'identity',networkError:false,networkErrorCode:null,hang:false,requireJsonFormat:false,logs:[],queries:[],
    workerProvider:null,workerCredentials:credentials,records:[{address:'8.8.8.8',family:4}]});
  const rejected=async(reason,category='INVALID_RESPONSE',status=undefined)=>{
    let error;
    try{await a.account(endpoint,credentials)}catch(e){error=e}
    assert(error,'Expected a rejected fixture');
    assert.equal(error.category,category);assert.equal(error.diagnosticCode,reason);
    assert.equal(error.upstreamHttpStatus,status);
    const exposed=JSON.stringify(error)+' '+error.message+' '+error.safeError+' '+
      m.providerFailureMessage(category,reason,error.upstreamHttpStatus)+' '+
      m.providerSavedFailureMessage(error.safeError)+' '+JSON.stringify(m.state.logs);
    for(const sensitive of [username,key,'secret-upstream-value','someone@private.example','198.51.100.99',
      'fixture-token','synthetic-rest-token','postgres://private-db:private-password@private-host/private-db'])
      assert(!exposed.includes(sensitive),'Confidential fixture value was exposed');
    return error;
  };
  reset();
  await check('Legacy account accepts official v6.1 JSON and preserves exact numeric money',async()=>{
    assert.deepEqual(await a.account(endpoint,credentials),{currency:'USD',balance:'123.123456789012'});
  });
  await check('Legacy form encoding, JSON selector, exact root, TLS pinning and headers',async()=>{
    const c=m.state.captured,p=new URLSearchParams(c.body);
    assert.equal(c.url,endpoint+'/');assert.equal(c.options.method,'POST');
    assert.equal(new URL(c.url).search,'');assert.equal(c.options.headers.Authorization,undefined);
    assert.equal(c.options.headers['Content-Type'],'application/x-www-form-urlencoded');
    assert.equal(c.options.headers['Content-Length'],String(Buffer.byteLength(c.body)));
    assert.equal(c.options.headers['Accept-Encoding'],'identity');assert.equal(c.options.rejectUnauthorized,true);
    assert.equal(c.address,'8.8.8.8');assert.equal(p.get('username'),username);assert.equal(p.get('apiaccesskey'),key);
    assert.equal(p.get('action'),'accountinfo');assert.equal(p.get('requestformat'),'JSON');
    assert.deepEqual([...p.keys()].sort(),['action','apiaccesskey','requestformat','username']);
  });
  await check('Configured explicit path is preserved; catalog read also negotiates JSON',async()=>{
    reset();await m.safeLegacyRead(endpoint+'/explicit/listener.php',credentials,'imeiservicelist');
    assert.equal(m.state.captured.url,endpoint+'/explicit/listener.php');
    const p=new URLSearchParams(m.state.captured.body);
    assert.equal(p.get('action'),'imeiservicelist');assert.equal(p.get('requestformat'),'JSON');
  });
  await check('Conditional XML-default fixture succeeds with the actual JSON form selector',async()=>{
    reset();m.state.requireJsonFormat=true;
    assert.equal((await a.account(endpoint,credentials)).currency,'USD');
    // Control proves this mocked listener rejects omission; no provider assumption.
    // Control also uses a completely offline mock, with no credentials.
    const mockApi=await import('file://'+mock);
    await new Promise(resolveDone=>{
      mockApi.state.requireJsonFormat=true;
      mockApi.request(new URL(endpoint),{lookup:(_h,_o,cb)=>cb(null,[{address:'8.8.8.8',family:4}])},
        res=>{assert.equal(res.headers['content-type'],'application/xml');resolveDone()}).end('action=accountinfo');
    });
  });
  for(const [type,reason] of [['application/xml','UNEXPECTED_XML'],['text/xml','UNEXPECTED_XML'],
    ['text/html','UNEXPECTED_HTML'],['application/xhtml+xml','UNEXPECTED_HTML'],
    ['text/plain','UNSUPPORTED_RESPONSE_FORMAT'],['','UNSUPPORTED_RESPONSE_FORMAT']]){
    await check(`Declared ${type||'missing MIME'} is classified safely`,async()=>{
      reset();m.state.contentType=type;await rejected(reason);
    });
  }
  for(const [body,reason] of [['<!doctype html><html>secret-upstream-value</html>','UNEXPECTED_HTML'],
    ['<?xml version="1.0"?><error>secret-upstream-value</error>','UNEXPECTED_XML'],
    ['{"invalid":secret-upstream-value','MALFORMED_JSON']]){
    await check(`${reason} body declared as JSON remains rejected and redacted`,async()=>{
      reset();m.state.body=body;await rejected(reason);
    });
  }
  for(const [message,reason,category] of [['Authentication Failed','AUTHENTICATION_REJECTED','AUTHENTICATION_FAILED'],
    ['Invalid API key','AUTHENTICATION_REJECTED','AUTHENTICATION_FAILED'],
    ['IP not allowed','IP_RESTRICTED','AUTHENTICATION_FAILED'],
    ['IP address is blocked','IP_RESTRICTED','AUTHENTICATION_FAILED'],
    ['No IP restriction','UPSTREAM_REJECTION','INVALID_RESPONSE'],
    ['Check IP Guard and credentials','UPSTREAM_REJECTION','INVALID_RESPONSE'],
    ['secret-upstream-value someone@private.example 198.51.100.99','UPSTREAM_REJECTION','INVALID_RESPONSE']]){
    await check(`Explicit rejection classification: ${reason} (synthetic)`,async()=>{
      reset();m.state.body=JSON.stringify({ERROR:[{MESSAGE:message}]});await rejected(reason,category);
    });
  }
  for(const body of ['[]','{"SUCCESS":[]}','{"SUCCESS":[{}]}','{"ERROR":[]}',
    '{"ERROR":[null]}','{"SUCCESS":[{"AccoutInfo":{"credit":"1 USD","currency":"USD"}}]}',
    '{"SUCCESS":[{"AccoutInfo":{"credit":"1","currency":"usd"}}]}',
    '{"SUCCESS":[{"AccoutInfo":{"credit":"1","currency":"USD"}}],"apiversion":"6.0"}']){
    await check('Unexpected account schema remains rejected',async()=>{
      reset();m.state.body=body;await rejected('UNEXPECTED_RESPONSE_SCHEMA');
    });
  }
  for(const [status,category] of [[302,'INVALID_RESPONSE'],[400,'INVALID_RESPONSE'],[401,'AUTHENTICATION_FAILED'],
    [402,'AUTHENTICATION_FAILED'],[403,'AUTHENTICATION_FAILED'],[404,'INVALID_RESPONSE'],
    [405,'INVALID_RESPONSE'],[429,'UNREACHABLE'],[500,'UNREACHABLE'],[502,'UNREACHABLE'],[503,'UNREACHABLE']]){
    await check(`HTTP ${status} yields HTTP_FAILURE without guessing an IP/credential cause`,async()=>{
      reset();m.state.status=status;
      // Must not parse/log any error body, even HTML containing credentials.
      m.state.contentType='text/html';m.state.body=[
        credentials,'secret-upstream-value','someone@private.example','198.51.100.99',
        'authorization: fixture-token','Bearer synthetic-rest-token',
        'postgres://private-db:private-password@private-host/private-db',
      ].join(' ');
      const error=await rejected('HTTP_FAILURE',category,status);
      assert.equal(error.safeError,`${category}:HTTP_FAILURE:${status}`);
      assert.equal(error.retryable,status===429||status>=500);
      const result={health:error.category,diagnosticCode:error.diagnosticCode,
        upstreamHttpStatus:error.upstreamHttpStatus,currency:null,balance:null};
      assert.deepEqual(m.TestExternalProviderDraftResponse.parse(result),result);
      assert.match(m.providerFailureMessage(category,'HTTP_FAILURE',status),new RegExp(`HTTP ${status}`));
      assert.match(m.providerSavedFailureMessage(error.safeError),new RegExp(`HTTP ${status}`));
      assert.deepEqual(m.state.logs,[{fields:{providerProtocol:'DHRU_FUSION_LEGACY_V61',
        diagnosticCode:'HTTP_FAILURE',upstreamHttpStatus:status},
        message:'Legacy provider returned an unsuccessful HTTP response'}]);
      assert.equal(new URLSearchParams(m.state.captured.body).get('requestformat'),'JSON');
    });
  }
  await check('Catalog HTTP failure preserves the status and safe sync-history encoding',async()=>{
    reset();m.state.status=405;
    await assert.rejects(a.catalog(endpoint,credentials),e=>
      e.category==='INVALID_RESPONSE'&&e.diagnosticCode==='HTTP_FAILURE'&&
      e.upstreamHttpStatus===405&&e.safeError==='INVALID_RESPONSE:HTTP_FAILURE:405');
  });
  await check('Catalog-list failure after successful accountinfo retains its own HTTP status',async()=>{
    reset();
    const actions=[];
    await assert.rejects(a.catalog(endpoint,credentials,async(base,token,action)=>{
      actions.push(action);
      if(action==='imeiservicelist')m.state.status=404;
      return m.safeLegacyRead(base,token,action);
    }),e=>e.diagnosticCode==='HTTP_FAILURE'&&e.upstreamHttpStatus===404&&
      e.safeError==='INVALID_RESPONSE:HTTP_FAILURE:404');
    assert.deepEqual(actions,['accountinfo','imeiservicelist']);
    assert.equal(new URLSearchParams(m.state.captured.body).get('action'),'imeiservicelist');
  });
  await check('Actual TEST/SYNC worker persists status to both error fields using only mocked transactions',async()=>{
    for(const kind of ['TEST','SYNC']){
      for(const [status,category] of [[401,'AUTHENTICATION_FAILED'],[403,'AUTHENTICATION_FAILED'],
        [404,'INVALID_RESPONSE'],[405,'INVALID_RESPONSE'],[429,'UNREACHABLE'],[500,'UNREACHABLE']]){
        reset();m.state.status=status;
        m.state.workerProvider={id:'synthetic-provider',subscriber_id:'synthetic-subscriber',
          enabled:true,config_version:1,protocol:'DHRU_FUSION_LEGACY_V61',base_url:endpoint,
          credentials_encrypted:'synthetic-not-an-encrypted-credential',currency:null};
        await m.runProviderJob({id:'synthetic-job',subscriber_id:'synthetic-subscriber',
          provider_id:'synthetic-provider',config_version:1,kind,attempts:4,lease_token:'synthetic-lease'});
        assert.equal(m.state.queries.length,2);
        const [job,provider]=m.state.queries;
        assert.match(job.sql,/UPDATE external_provider_jobs/);
        assert.equal(job.values[2],'FAILED');
        assert.equal(job.values[3],`${category}:HTTP_FAILURE:${status}`);
        assert.match(provider.sql,/UPDATE external_providers/);
        assert.deepEqual(provider.values,['synthetic-subscriber','synthetic-provider',category,
          `${category}:HTTP_FAILURE:${status}`,1]);
        assert.match(m.providerSavedFailureMessage(provider.values[3]),new RegExp(`HTTP ${status}`));
        for(const secret of [username,key,credentials,'synthetic-not-an-encrypted-credential']){
          assert(!JSON.stringify({queries:m.state.queries,logs:m.state.logs}).includes(secret));
        }
      }
    }
  });
  await check('Malformed or absent statuses cannot inject text into diagnostic/log output',async()=>{
    for(const status of [undefined,null,0,99,600,400.5,NaN,'403 secret-upstream-value']){
      const e=new m.ProviderError('INVALID_RESPONSE',false,'HTTP_FAILURE',status);
      assert.equal(e.upstreamHttpStatus,undefined);
      assert.equal(e.safeError,'INVALID_RESPONSE:HTTP_FAILURE');
      assert(!m.providerFailureMessage(e.category,e.diagnosticCode,status).includes('secret-upstream-value'));
    }
    for(const suffix of ['403 secret-upstream-value','403.5','600','0','NaN']){
      assert(!m.providerSavedFailureMessage(`INVALID_RESPONSE:HTTP_FAILURE:${suffix}`).includes('secret-upstream-value'));
      assert(!m.providerSavedFailureMessage(`INVALID_RESPONSE:HTTP_FAILURE:${suffix}`).includes(`HTTP ${suffix}`));
    }
    reset();m.state.status=undefined;await rejected('HTTP_FAILURE');
    assert.deepEqual(m.state.logs,[]);
    assert.equal(new m.ProviderError('INVALID_RESPONSE',false,'MALFORMED_JSON',403).upstreamHttpStatus,undefined);
  });
  await check('Compression rejection remains fail-closed',async()=>{
    reset();m.state.encoding='gzip';await rejected('UNSUPPORTED_CONTENT_ENCODING');
  });
  await check('Network failures retain category and retryability with a safe diagnostic',async()=>{
    reset();m.state.networkError=true;await rejected('NETWORK_FAILURE','UNREACHABLE');
    assert.deepEqual(m.state.logs,[]);
  });
  await check('TLS certificate failure is a network diagnostic, never a guessed HTTP status',async()=>{
    reset();m.state.networkError=true;m.state.networkErrorCode='ERR_TLS_CERT_ALTNAME_INVALID';
    await rejected('NETWORK_FAILURE','UNREACHABLE');assert.deepEqual(m.state.logs,[]);
  });
  await check('DNS security failure has no upstream HTTP status',async()=>{
    reset();m.state.records=[{address:'127.0.0.1',family:4}];
    await rejected('NETWORK_FAILURE','UNREACHABLE');assert.deepEqual(m.state.logs,[]);
  });
  await check('Response timeout has no upstream HTTP status or sensitive exception text',async()=>{
    reset();m.state.hang=true;
    const original=globalThis.setTimeout;
    // Only shorten the actual transport's 20s deadline; no network is performed.
    globalThis.setTimeout=(fn,delay,...args)=>{
      const timer=original(fn,delay===20000?1:delay,...args);
      if(delay===20000)timer.unref=()=>timer;
      return timer;
    };
    try{await rejected('NETWORK_FAILURE','UNREACHABLE');assert.deepEqual(m.state.logs,[]);}
    finally{globalThis.setTimeout=original;}
  });
  await check('Oversized body is rejected without leaking data',async()=>{
    reset();m.state.body=' '.repeat(8*1024*1024+1);await rejected('RESPONSE_TOO_LARGE');
  });
  await check('Legacy catalog still normalizes valid services using account currency',async()=>{
    reset();
    const list={SUCCESS:[{LIST:{group:{GROUPNAME:'Group',GROUPTYPE:'IMEI',SERVICES:{
      '123':{SERVICEID:'123',SERVICETYPE:'IMEI',SERVICENAME:'Synthetic service',CREDIT:'1.250000000001'}}}}}],apiversion:'6.1'};
    const actions=[];
    const r=await a.catalog(endpoint,credentials,async(_base,_credentials,action)=>{
      actions.push(action);return action==='accountinfo'?valid:JSON.stringify(list)});
    assert.deepEqual(actions,['accountinfo','imeiservicelist']);assert.equal(r.items[0].currency,'USD');
    assert.equal(r.items[0].costUnits,'1250000000001');
  });
  await check('REST success, Bearer GET, URL, JSON envelope and money are unchanged',async()=>{
    reset();m.state.body='{"status":"success","code":200,"data":{"currency":"USD","balance":123.123456789012}}';
    const r=await rest.account(endpoint+'/api/reseller/v1','synthetic-rest-token');
    assert.equal(r.currency,'USD');assert.equal(r.balance,'123.123456789012');
    assert.equal(m.state.captured.url,endpoint+'/api/reseller/v1/account');
    assert.equal(m.state.captured.options.method,'GET');assert.equal(m.state.captured.body,null);
    assert.equal(m.state.captured.options.headers.Authorization,'Bearer synthetic-rest-token');
  });
  await check('REST error categories and absence of Legacy diagnostics are unchanged',async()=>{
    for(const status of [302,403,500]){
      reset();m.state.status=status;
      await assert.rejects(m.safeRead(endpoint+'/api/reseller/v1','synthetic-rest-token','account'),
        e=>e.category===({302:'INVALID_RESPONSE',403:'AUTH_FAILED',500:'UNREACHABLE'})[status]&&
          e.diagnosticCode===undefined&&e.upstreamHttpStatus===undefined&&e.safeError===e.category);
      assert.deepEqual(m.state.logs,[]);
    }
    reset();m.state.contentType='text/html';
    await assert.rejects(m.safeRead(endpoint+'/api/reseller/v1','synthetic-rest-token','account'),
      e=>e.category==='INVALID_RESPONSE'&&e.diagnosticCode===undefined);
    assert.equal(m.providerSavedFailureMessage('AUTH_FAILED'),'AUTH_FAILED');
    assert.equal(m.providerSavedFailureMessage('INVALID_RESPONSE'),'INVALID_RESPONSE');
  });
  await check('Saved diagnostic display is fixed text; unknown/error-like secret values are not reflected',async()=>{
    assert.match(m.providerSavedFailureMessage('INVALID_RESPONSE:UNEXPECTED_XML'),/XML/);
    assert(!m.providerFailureMessage('secret-upstream-value','secret-upstream-value').includes('secret-upstream-value'));
    assert(!m.providerSavedFailureMessage('secret-upstream-value').includes('secret-upstream-value'));
    assert(!m.providerFailureMessage('INVALID_RESPONSE','constructor').includes('function'));
  });
  await check('Unimplemented Simple Listener and paid actions remain blocked before transport',async()=>{
    assert.throws(()=>m.providerAdapter('simple_listener'),e=>e.category==='UNSUPPORTED_PROVIDER');
    reset();const n=m.state.requests;
    await assert.rejects(m.safeLegacyRead(endpoint,credentials,'placeimeiorder'),e=>e.category==='INVALID_RESPONSE');
    assert.equal(m.state.requests,n);
  });
  console.log(`RESULT: ${passed} offline checks passed; zero live upstream calls, real credentials or database access.`);
}finally{await rm(out,{recursive:true,force:true})}
