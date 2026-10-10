// Offline only: synthetic records, mocked SQL/credentials/logger/transport.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const {build}=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url))('esbuild');
const out=await mkdtemp(join(tmpdir(),'bhru-metadata-'));
let passed=0;
const check=async(label,fn)=>{await fn();console.log(`PASS ${++passed}: ${label}`)};
const tenant='10000000-0000-4000-8000-000000000001';
const provider='20000000-0000-4000-8000-000000000001';
const job='30000000-0000-4000-8000-000000000001';
const catalogId='40000000-0000-4000-8000-000000000001';
const now=Date.now();
const auth=changes=>JSON.stringify({tenantId:tenant,providerId:provider,jobId:job,
  expiresAt:new Date(now+10*60*1000).toISOString(),...changes});
try{
  const entry=resolve('artifacts/api-server/src/lib/providers');
  await build({stdin:{contents:`
    export * from '${entry}/legacy-metadata-diagnostics.ts';
    export {providerAdapter} from '${entry}/adapter.ts';
    export {runProviderJob} from '${entry}/worker.ts';
    export {state} from 'offline-state';
    `,resolveDir:process.cwd(),loader:'ts'},
    bundle:true,platform:'node',format:'esm',outfile:join(out,'test.mjs'),
    alias:{'@workspace/currency-presentation':resolve('lib/currency-presentation/src/index.mts')},
    plugins:[{name:'offline-only',setup(b){
      b.onResolve({filter:/^offline-state$/},()=>({path:'state',namespace:'offline-state'}));
      b.onLoad({filter:/.*/,namespace:'offline-state'},()=>({contents:
        'export const state={logs:[],queries:[],provider:null,lease:true,rollback:false,logThrows:false};',loader:'js'}));
      b.onLoad({filter:/\/lib\/auth\.ts$/},()=>({contents:
        'export class HttpError extends Error {constructor(status,message){super(message);this.status=status}}',loader:'ts'}));
      b.onLoad({filter:/\/providers\/transport\.ts$/},()=>({contents:`
        export class ProviderError extends Error {constructor(category,retryable=false,diagnosticCode){
          super(category);Object.assign(this,{category,retryable,diagnosticCode});}
          get safeError(){return this.category}}
        export const safeLegacyRead=async()=>{throw Error('Live transport forbidden')};
        export const safeRead=safeLegacyRead;`,loader:'ts'}));
      b.onLoad({filter:/\/lib\/logger\.ts$/},()=>({contents:`
        import {state} from 'offline-state';
        export const logger={info:(fields,message)=>{
          if(state.logThrows)throw Error('Synthetic logger failure');
          state.logs.push({fields,message});},warn(){},error(){}};`,loader:'ts'}));
      b.onLoad({filter:/\/lib\/platform\.ts$/},()=>({contents:`
        import {state} from 'offline-state';
        export const audit=async()=>{};
        export const transaction=async fn=>{
          const result=await fn({query:async(sql,values)=>{
            state.queries.push({sql,values});
            if(sql.startsWith('SELECT * FROM external_provider_catalog'))
              return {rowCount:1,rows:[{id:'${catalogId}',upstream_id:'123',source_snapshot:{},missing:false}]};
            if(sql.includes("lease_until>now()"))return {rowCount:state.lease?1:0,rows:[]};
            return {rowCount:1,rows:[]};
          }});
          if(state.rollback&&state.queries.some(q=>q.sql.startsWith('INSERT INTO external_provider_catalog')))
            {state.rollback=false;throw Error('Synthetic rollback');}
          return result;
        };`,loader:'ts'}));
      b.onLoad({filter:/\/providers\/connections\.ts$/},()=>({contents:`
        import {state} from 'offline-state';
        export const providerRow=async(sub,id)=>{
          if(sub!==state.provider.subscriber_id||id!==state.provider.id)throw Error('Wrong tenant');
          return state.provider;};`,loader:'ts'}));
      b.onLoad({filter:/\/providers\/credentials\.ts$/},()=>({contents:
        `export const decryptToken=()=> '{"username":"fixture-user","apiAccessKey":"fixture-key"}';`,loader:'ts'}));
    }}]});
  const m=await import('file://'+join(out,'test.mjs'));
  const a=m.providerAdapter('DHRU_FUSION_LEGACY_V61');
  const service=extra=>({SERVICEID:'123',SERVICETYPE:'IMEI',SERVICENAME:'Synthetic Service',
    CREDIT:'0.005',TIME:'1 minute',INFO:'',QNT:'0',...extra});
  const read=extra=>async(_base,_credentials,action)=>{
    if(action==='accountinfo')return JSON.stringify({SUCCESS:[{AccoutInfo:{currency:'USD',credit:'10'}}]});
    assert.equal(action,'imeiservicelist','Only read-only actions are permitted');
    return JSON.stringify({SUCCESS:[{LIST:{group:{GROUPNAME:'Synthetic Group',GROUPTYPE:'IMEI',
      SERVICES:{123:service(extra)}}}}]});
  };
  await check('Only unknown service-level metadata triggers diagnostics',async()=>{
    assert.deepEqual(m.unknownLegacyKeys(service({'Requires.SN':'Required',CAPABILITIES:'synthetic-value'})),['CAPABILITIES']);
    let called=false;
    await a.catalog('','',read({}),()=>{called=true});
    assert.equal(called,false);
  });
  await check('Sanitized names exclude credentials, authentication, tokens and personal fields',()=>{
    const result=m.sanitizeLegacyMetadataKeys(['CAPABILITIES','apiaccesskey','AUTH','TOKEN','PASSWORD','USERNAME',
      'EMAIL','PHONE','IMEI','SERIAL','CUSTOMER','ADDRESS','PAYMENT','IP','COOKIE','BANK','DEVICE','PASSPORT','SSN']);
    assert.deepEqual(result,{fieldNames:['CAPABILITIES'],omitted:true});
  });
  await check('Suspicious names have fixed redacted fallback, never escaped copies',()=>{
    const result=m.sanitizeLegacyMetadataKeys(['<script>','a@b.example','a\nb','../private','MixedOpaque123',
      '__proto__','A'.repeat(65),'0123456789abcdef','FIELD123456','A'.repeat(25)]);
    assert.deepEqual(result,{fieldNames:[],omitted:true});
  });
  await check('Count, scan and length bounds are strict',()=>{
    const result=m.sanitizeLegacyMetadataKeys(Array.from({length:200},(_,i)=>`FIELD_${i}`));
    assert.equal(result.fieldNames.length,16);assert.equal(result.omitted,true);
    assert(result.fieldNames.every(key=>key.length<=64));
  });
  await check('Default-disabled and malformed authorization fail closed',()=>{
    for(const config of ['',undefined,'true','{}','null','[]','x'.repeat(513),auth({extra:true})]){
      assert.equal(m.legacyMetadataDiagnosticsAuthorized(tenant,provider,job,config,now),false);
    }
  });
  await check('Exact tenant, provider and job scope is required',()=>{
    assert.equal(m.legacyMetadataDiagnosticsAuthorized(tenant,provider,job,auth(),now),true);
    for(const changed of [{tenantId:provider},{providerId:tenant},{jobId:tenant}]){
      assert.equal(m.legacyMetadataDiagnosticsAuthorized(tenant,provider,job,auth(changed),now),false);
    }
  });
  await check('Expired, overlong, malformed expiry and invalid IDs fail closed',()=>{
    for(const expiresAt of [new Date(now).toISOString(),new Date(now+16*60*1000).toISOString(),'tomorrow',123]){
      assert.equal(m.legacyMetadataDiagnosticsAuthorized(tenant,provider,job,auth({expiresAt}),now),false);
    }
    assert.equal(m.legacyMetadataDiagnosticsAuthorized('not-a-uuid',provider,job,auth(),now),false);
  });
  await check('Diagnostics do not affect snapshot, hash, price, requirements or review',async()=>{
    const extra={CAPABILITIES:'never-copy-this-value','Requires.SN':'Required'};
    const plain=await a.catalog('','',read(extra));let names;
    const diagnostic=await a.catalog('','',read(extra),(_id,safe)=>{names=safe});
    assert.deepEqual(diagnostic,plain);assert.deepEqual(names,{fieldNames:['CAPABILITIES'],omitted:false});
    assert.equal(diagnostic.items[0].costUnits,'5000000000');
    assert(diagnostic.items[0].reviewReasons.includes('Undocumented Legacy service metadata needs review.'));
    assert(!JSON.stringify(diagnostic).includes('never-copy-this-value'));
  });
  await check('Quantity, unknown inputs and conflicting types remain blocked',async()=>{
    for(const extra of [{QNT:'1'},{'Requires.Network':'Required'},{SERVICETYPE:'FILE'},
      {'Requires.Custom':[{fieldname:'DATE',fieldtype:'datepicker',required:'1'}]}]){
      const result=await a.catalog('','',read(extra));
      assert(result.items[0].reviewReasons.length);
    }
  });
  const reset=()=>{
    Object.assign(m.state,{logs:[],queries:[],lease:true,rollback:false,logThrows:false,
      provider:{id:provider,subscriber_id:tenant,enabled:true,config_version:1,
        protocol:'DHRU_FUSION_LEGACY_V61',base_url:'https://synthetic.invalid',currency:'USD'}});
    delete process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS;
  };
  const run=async(kind='SYNC',extra={CAPABILITIES:'never-copy-this-value',APIKEY:'private-key'})=>
    m.runProviderJob({id:job,subscriber_id:tenant,provider_id:provider,kind,
      config_version:1,lease_token:'synthetic-lease',attempts:1},read(extra));
  await check('Default worker sync does not emit metadata logs',async()=>{
    reset();await run();assert.deepEqual(m.state.logs,[]);
  });
  await check('Authorized sync emits bounded names and exact internal tenant/provider/job/catalog IDs',async()=>{
    reset();process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS=auth();await run();
    assert.equal(m.state.logs.length,1);
    assert.deepEqual(m.state.logs[0].fields,{diagnosticCode:'LEGACY_UNKNOWN_METADATA',
      tenantId:tenant,providerId:provider,jobId:job,catalogId,
      fieldNames:['CAPABILITIES'],fieldNamesOmitted:true,
      reviewReason:'Undocumented Legacy service metadata needs review.'});
    const exposed=JSON.stringify(m.state.logs);
    for(const value of ['never-copy-this-value','private-key','APIKEY','fixture-key','fixture-user','synthetic.invalid'])
      assert(!exposed.includes(value));
    const persisted=m.state.queries.find(q=>q.sql.startsWith('INSERT INTO external_provider_catalog')).values;
    assert.equal(persisted[0],tenant);assert.equal(persisted[1],provider);assert.equal(persisted[2],job);
    assert(!persisted[3].includes('CAPABILITIES'));assert(!persisted[3].includes('never-copy-this-value'));
  });
  await check('Wrong tenant/provider/job authorization emits nothing',async()=>{
    for(const change of [{tenantId:provider},{providerId:tenant},{jobId:tenant}]){
      reset();process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS=auth(change);await run();
      assert.deepEqual(m.state.logs,[]);
    }
  });
  await check('Lost lease, rollback and TEST jobs emit no catalog diagnostics',async()=>{
    reset();process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS=auth();m.state.lease=false;await run();
    assert.deepEqual(m.state.logs,[]);
    reset();process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS=auth();m.state.rollback=true;await run();
    assert.deepEqual(m.state.logs,[]);
    reset();process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS=auth();await run('TEST');
    assert.deepEqual(m.state.logs,[]);
  });
  await check('Logger failure never retries or marks an already-committed sync failed',async()=>{
    reset();process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS=auth();m.state.logThrows=true;await run();
    assert(!m.state.queries.some(q=>q.sql.includes("state='FAILED'")));
  });
  await check('Per-job diagnostics cap at 100 catalog services without approving them',async()=>{
    reset();process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS=auth();
    const services=Object.fromEntries(Array.from({length:105},(_,i)=>{
      const id=String(i+123);
      return [id,{...service({CAPABILITIES:'never-copy-this-value'}),SERVICEID:id}];
    }));
    await m.runProviderJob({id:job,subscriber_id:tenant,provider_id:provider,kind:'SYNC',
      config_version:1,lease_token:'synthetic-lease',attempts:1},async(_base,_credentials,action)=>
      action==='accountinfo'?JSON.stringify({SUCCESS:[{AccoutInfo:{currency:'USD',credit:'10'}}]}):
        JSON.stringify({SUCCESS:[{LIST:{group:{GROUPNAME:'Synthetic Group',GROUPTYPE:'IMEI',SERVICES:services}}}]}));
    assert.equal(m.state.logs.length,100);
    const completed=m.state.queries.find(q=>q.sql.includes('SET state=$3,counts=$4'));
    assert.equal(completed.values[2],'COMPLETED_WITH_WARNINGS');
    assert.equal(completed.values[3].unsupported,105);
  });
  await check('Rejected response after capture emits no partial diagnostics',async()=>{
    reset();process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS=auth();
    await m.runProviderJob({id:job,subscriber_id:tenant,provider_id:provider,kind:'SYNC',
      config_version:1,lease_token:'synthetic-lease',attempts:1},async(_base,_credentials,action)=>
      action==='accountinfo'?JSON.stringify({SUCCESS:[{AccoutInfo:{currency:'USD',credit:'10'}}]}):
        JSON.stringify({SUCCESS:[{LIST:{group:{GROUPNAME:'Synthetic Group',GROUPTYPE:'IMEI',
          SERVICES:{123:service({CAPABILITIES:'never-copy-this-value'}),124:service({SERVICEID:'wrong-id'})}}}}]}));
    assert.deepEqual(m.state.logs,[]);
  });
  await check('REST catalog never invokes Legacy metadata diagnostic hook',async()=>{
    let called=false;
    await m.providerAdapter('fusion_rest').catalog('','',async()=>JSON.stringify({
      status:'success',code:200,data:{currency:'USD',categories:{},products:{}}}),
      ()=>{called=true});
    assert.equal(called,false);
  });
  await check('Emitter revalidates scope and names defensively',()=>{
    reset();m.logLegacyMetadataDiagnostic(tenant,provider,job,catalogId,{fieldNames:['CAPABILITIES'],omitted:false});
    assert.deepEqual(m.state.logs,[]);
    process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS=auth();
    m.logLegacyMetadataDiagnostic(tenant,provider,job,catalogId,{fieldNames:['CAPABILITIES','PASSWORD'],omitted:false});
    assert.deepEqual(m.state.logs[0].fields.fieldNames,['CAPABILITIES']);
    assert.equal(m.state.logs[0].fields.fieldNamesOmitted,true);
  });
  console.log(`RESULT: ${passed} offline metadata diagnostics checks passed; no real network or database access.`);
}finally{
  delete process.env.BHRU_LEGACY_METADATA_DIAGNOSTICS;
  await rm(out,{recursive:true,force:true});
}
