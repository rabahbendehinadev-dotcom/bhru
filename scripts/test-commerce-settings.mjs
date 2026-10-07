// Focused source/HTTP checks with an in-memory DB substitute. Never connects to PostgreSQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import express from '../artifacts/api-server/node_modules/express/index.js';
import { commerceSettingsPayload } from '../artifacts/bhru/src/lib/commerce-settings.ts';

const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
const root=process.cwd();
const migrations='lib/db/src/migrations/';
const schema=fs.readFileSync(migrations+'008_subscriber_ecommerce.sql','utf8');
const initialization=fs.readFileSync(migrations+'011_new_subscriber_usd_currency.sql','utf8');
const usd=fs.readFileSync(migrations+'012_usd_money_foundation.sql','utf8');
const tenants=new Map();
let writes=0;
const fake={
 async query(sql,params=[]) {
  const [id]=params, tenant=tenants.get(id);
  if(sql.startsWith('SELECT public_slug'))return {rows:[{public_slug:tenant.slug}],rowCount:1};
  if(sql.startsWith('SELECT * FROM store_settings'))return {rows:[structuredClone(tenant.settings)],rowCount:1};
  if(sql.startsWith('SELECT id FROM subscribers')||sql.startsWith('SELECT id FROM subscriptions'))return {rows:[{id}],rowCount:1};
  if(sql.startsWith('SELECT enabled FROM subscriber_modules'))return {rows:[{enabled:tenant.entitled}],rowCount:1};
  if(sql.startsWith('INSERT INTO store_settings')) {
   const keys=/INSERT INTO store_settings\(subscriber_id,([^)]*)\)/.exec(sql)[1].split(',');
   assert.ok(!keys.includes('money_model_version')&&!keys.includes('public_slug'));
   keys.forEach((k,i)=>{tenant.settings[k]=params[i+1];});
   assert.equal(tenant.settings.currency,'USD');
   assert.equal(tenant.settings.money_model_version,2);
   writes++;return {rows:[],rowCount:1};
  }
  if(sql.includes('JOIN store_settings st')&&sql.includes('WHERE s.public_slug=$1')) {
   const t=[...tenants.values()].find(t=>t.slug===id&&t.settings.enabled&&t.entitled);
   return {rows:t?[{id:t.id,public_slug:t.slug}]:[],rowCount:t?1:0};
  }
  throw Error('Unexpected simulated query: '+sql);
 },
};
globalThis.__settingsTestDB=fake;
globalThis.__settingsTestTenants=tenants;
const result=await build({
 stdin:{contents:`
 export {default as router} from './artifacts/api-server/src/routes/commerce.ts';
 export {settingsInput,DEFAULT_STORE} from './artifacts/api-server/src/lib/commerce/validation.ts';
 export {publicStore} from './artifacts/api-server/src/lib/commerce/data.ts';
 `,resolveDir:root,sourcefile:'focused-settings-entry.ts',loader:'ts'},
 bundle:true,platform:'node',format:'esm',write:false,
 banner:{js:`import {createRequire as makeRequire} from 'node:module';const require=makeRequire(${JSON.stringify(root+'/artifacts/api-server/package.json')});`},
 plugins:[{name:'isolated-settings',setup(b){
  b.onResolve({filter:/^express$/},()=>({path:pathToFileURL(require.resolve('express')).href,external:true}));
  b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'test'}));
  b.onResolve({filter:/(?:^|\/)platform$/},()=>({path:'platform',namespace:'test'}));
  b.onResolve({filter:/public-site\/media$/},()=>({path:'media',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},args=>({
   loader:'js',contents:args.path==='db'?'export const pool=globalThis.__settingsTestDB;':
    args.path==='platform'?`export async function transaction(fn){return fn(globalThis.__settingsTestDB)}
     export async function getSubscriber(id){return {allowed:globalThis.__settingsTestTenants.get(id)?.entitled}}
     export async function audit(){throw Error('Unexpected audit')}
     export const cleanSubscriber=()=>{};`:
    `export const MAX_IMAGE_BYTES=1;export const normalizeImage=()=>{},writeImage=()=>{},removeImage=()=>{},previewImageUrl=()=>'',publicImageUrl=()=>'';`,
  }));
 }}],
});
const {router,settingsInput,DEFAULT_STORE,publicStore}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const dbDefaults={};
for(const key of Object.keys(DEFAULT_STORE)) {
 const match=new RegExp(`\\b${key} (?:boolean|text) NOT NULL DEFAULT ('[^']*'|true|false)`).exec(schema);
 assert.ok(match,'Persisted default: '+key);
 dbDefaults[key]=match[1].startsWith("'")?match[1].slice(1,-1):match[1]==='true';
}
assert.match(initialization,/INSERT INTO store_settings\(subscriber_id,currency\) VALUES\(NEW\.id,'USD'\)/);
assert.match(initialization,/VALUES\(NEW\.id,'USD','US Dollar','\$','USD','1,234\.56',1\.00000,2,true,true,true\)/);
assert.match(usd,/ALTER COLUMN money_model_version SET DEFAULT 2/);
assert.match(fs.readFileSync(migrations+'009_subscriber_currencies.sql','utf8'),/AFTER INSERT ON subscribers/);
dbDefaults.currency='USD';
assert.deepEqual(dbDefaults,DEFAULT_STORE,'SQL registration defaults match valid source defaults');

function fresh(id,slug) {
 const tenant={id,slug,entitled:true,settings:{...dbDefaults,money_model_version:2},
  currencies:[{code:'USD',rate:'1.000000',is_base:true,client_default:true,enabled:true}]};
 tenants.set(id,tenant);return tenant;
}
const app=express();app.use(express.json());
app.use((req,_res,next)=>{
 const id=req.headers['x-test-tenant'];
 if(id)req.auth=req.headers['x-test-admin']?{id:'admin',subscriber_id:null,admin:true}:{id:'user',subscriber_id:id,admin:false};
 next();
});
app.use(router);
app.use((err,_req,res,_next)=>res.status(err.status??400).json({error:err.message}));
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
async function request(id,method,body,headers={}) {
 const response=await fetch(base+'/commerce/settings',{method,headers:{'content-type':'application/json','x-test-tenant':id,...headers},body:body?JSON.stringify(body):undefined});
 return {status:response.status,body:await response.json()};
}
try {
 for(const [id,slug] of [['00000000-0000-4000-8000-000000000001','fresh-one'],['00000000-0000-4000-8000-000000000002','fresh-two']]) {
  const tenant=fresh(id,slug);
  assert.deepEqual(tenant.currencies.map(c=>c.code),['USD']);
  const initial=await request(id,'GET');
  assert.equal(initial.status,200);
  assert.equal(initial.body.data.money_model_version,2);
  const {public_slug,...oldPayload}=initial.body.data;
  const rejected=settingsInput.safeParse({...oldPayload,enabled:true});
  assert.equal(rejected.success,false);
  assert.ok(rejected.error.issues.some(i=>i.code==='unrecognized_keys'&&i.keys.includes('money_model_version')));
  const values={...initial.body.data,enabled:true};
  const payload=commerceSettingsPayload(values,true);
  assert.ok(!('money_model_version' in payload)&&!('public_slug' in payload));
  assert.equal(payload.whatsapp,'');
  const saved=await request(id,'POST',payload);
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.equal((await request(id,'GET')).body.data.enabled,true);
  const publicResult=await publicStore(slug,fake);
  assert.equal(publicResult.id,id);
  assert.equal(publicResult.settings.enabled,true);
 }
 const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const payload=commerceSettingsPayload(tenants.get(id).settings,true),count=writes;
 for(const [patch,message] of [[{title:''},'Store title is required.'],[{email_mode:'bogus'},'Invalid customer email requirement.'],
  [{address_mode:'bogus'},'Invalid customer address requirement.'],[{whatsapp:'secret-invalid-phone'},'WhatsApp number must be blank'],
  [{confirmation_message:null},'Order confirmation message is required.']]) {
  const response=await request(id,'POST',{...payload,...patch});
  assert.equal(response.status,400);assert.ok(response.body.error.includes(message));
  assert.ok(!response.body.error.includes('secret-invalid-phone'));
 }
 const unknown=await request(id,'POST',{...payload,money_model_version:1});
 assert.equal(unknown.status,400);assert.match(unknown.body.error,/Reload this page/);
 assert.equal(writes,count);
 assert.equal((await request(id,'POST',{...payload,currency:'DZD'})).status,409);
 assert.equal((await request(id,'POST',payload,{'x-test-admin':'1','x-bhru-preview-subscriber':other})).status,403);
 assert.equal((await request(id,'POST',{...payload,subscriber_id:other})).status,400);
 assert.equal(writes,count);
 assert.equal((await request(id,'POST',{...payload,title:'My unchanged configuration',show_state:false})).status,200);
 assert.equal((await request(other,'GET')).body.data.title,'Our Products');
 const own=(await request(id,'GET')).body.data;
 assert.equal(own.title,'My unchanged configuration');assert.equal(own.show_state,false);
 assert.equal(settingsInput.safeParse({...payload,currency:'TND'}).success,true,'Persisted legacy reference is still readable/writable; route forbids changing it');
 assert.deepEqual(tenants.get(id).currencies,[{code:'USD',rate:'1.000000',is_base:true,client_default:true,enabled:true}]);
 console.log('PASS: exact metadata rejection reproduced; SQL defaults match source; two fresh USD-only tenants save/open/reload; empty public-store resolver succeeds; safe validation reasons; USD reference guard; tenant isolation; admin-preview write rejection; existing configured values retained.');
} finally { await new Promise(resolve=>server.close(resolve)); }
await build({entryPoints:['artifacts/bhru/src/pages/ecommerce.tsx'],bundle:true,packages:'external',platform:'browser',format:'esm',write:false,logLevel:'silent'});
console.log('PASS: focused E-Commerce UI compile.');
