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
      export {safeLegacyRead,safeRead,providerUrl} from '${entry}/transport.ts';
      export {state} from '${mock}';
      export {providerFailureMessage,providerSavedFailureMessage} from '${resolve('artifacts/bhru/src/lib/provider-diagnostics.ts')}';`,
      resolveDir:process.cwd(),loader:'ts'},
    bundle:true,platform:'node',format:'esm',outfile:join(out,'offline.mjs'),
    alias:{'@workspace/currency-presentation':resolve('lib/currency-presentation/src/index.mts')},
    plugins:[{name:'no-live-network',setup(b){
      b.onResolve({filter:/^node:(https|dns\/promises)$/},()=>({path:mock}));
      b.onLoad({filter:/\/lib\/auth\.ts$/},()=>({
        contents:'export class HttpError extends Error {constructor(status,message){super(message);this.status=status}}',loader:'ts'}));
    }}],
  });
  const m=await import('file://'+join(out,'offline.mjs'));
  const a=m.providerAdapter('DHRU_FUSION_LEGACY_V61'),rest=m.providerAdapter('fusion_rest');
  const endpoint='https://provider.example',username='synthetic user+&é',key='synthetic-key+=&';
  const credentials=JSON.stringify({username,apiAccessKey:key});
  const valid='{"SUCCESS":[{"AccoutInfo":{"credit":123.123456789012,"currency":"USD"}}],"apiversion":"6.1"}';
  const reset=()=>Object.assign(m.state,{status:200,body:valid,contentType:'application/json; charset=utf-8',
    encoding:'identity',networkError:false,hang:false,requireJsonFormat:false,records:[{address:'8.8.8.8',family:4}]});
  const rejected=async(reason,category='INVALID_RESPONSE')=>{
    let error;
    try{await a.account(endpoint,credentials)}catch(e){error=e}
    assert(error,'Expected a rejected fixture');
    assert.equal(error.category,category);assert.equal(error.diagnosticCode,reason);
    const exposed=JSON.stringify(error)+' '+error.message+' '+m.providerFailureMessage(category,reason);
    for(const sensitive of [username,key,'secret-upstream-value','someone@private.example','198.51.100.99'])
      assert(!exposed.includes(sensitive),'Confidential fixture value was exposed');
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
    [403,'AUTHENTICATION_FAILED'],[429,'UNREACHABLE'],[500,'UNREACHABLE']]){
    await check(`HTTP ${status} yields HTTP_FAILURE without guessing an IP/credential cause`,async()=>{
      reset();m.state.status=status;await rejected('HTTP_FAILURE',category);
    });
  }
  await check('Compression rejection remains fail-closed',async()=>{
    reset();m.state.encoding='gzip';await rejected('UNSUPPORTED_CONTENT_ENCODING');
  });
  await check('Network failures retain category and retryability with a safe diagnostic',async()=>{
    reset();m.state.networkError=true;await rejected('NETWORK_FAILURE','UNREACHABLE');
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
        e=>e.category===({302:'INVALID_RESPONSE',403:'AUTH_FAILED',500:'UNREACHABLE'})[status]&&e.diagnosticCode===undefined);
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
