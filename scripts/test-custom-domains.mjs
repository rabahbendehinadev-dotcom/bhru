// Isolated technical checks: no real database, external DNS or certificate issuance.
import assert from 'node:assert/strict';
import {build} from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
process.env.BHRU_DOMAIN_CNAME_TARGET='domains.bhru.net';
process.env.BHRU_DOMAIN_EDGE_IPS='203.0.113.10';
process.env.BHRU_DOMAIN_UPSTREAM='http://app:3000';
process.env.BHRU_DOMAIN_CERT_RESOLVER='letsencrypt';
process.env.SESSION_SECRET='isolated-domain-test-only-not-a-production-secret';
const records=new Map(),subscriberA=randomUUID(),subscriberB=randomUUID();
const query=async(sql,p=[])=>{
 if(sql.includes('WHERE d.hostname=$1'))return {rows:[...records.values()].filter(x=>x.hostname===p[0])};
 if(sql.includes('SELECT id FROM subscribers'))return {rows:[{id:p[0]}]};
 if(sql.includes('SELECT count(*)'))return {rows:[{count:[...records.values()].filter(r=>r.subscriber_id===p[0]).length}]};
 if(sql.includes('INSERT INTO subscriber_custom_domains')){
  if([...records.values()].some(r=>r.hostname===p[2]))throw Object.assign(new Error(),{code:'23505'});
  records.set(p[0],{id:p[0],subscriber_id:p[1],hostname:p[2],verification_token:p[3],verification_status:'pending',dns_status:'waiting',tls_status:'pending',is_primary:false});return {rows:[]};
 }
 if(sql.includes('SELECT * FROM subscriber_custom_domains'))return {rows:[...records.values()].filter(r=>r.subscriber_id===p[0]&&r.id===p[1])};
 if(sql.includes('DELETE FROM subscriber_custom_domains')){if(records.get(p[0])?.subscriber_id===p[1])records.delete(p[0]);return {rows:[]};}
 if(sql.includes('UPDATE subscriber_custom_domains'))return {rows:[]};
 if(sql.includes('FROM public_site_assets'))return {rows:[]};
 throw Error('Unexpected SQL '+sql);
};
globalThis.__domainTestDB={query};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
 export * from './artifacts/api-server/src/lib/domains/config';
 export * from './artifacts/api-server/src/lib/domains/service';
 export * from './artifacts/api-server/src/lib/domains/evidence';
 export {customDomainGateway,requestHost} from './artifacts/api-server/src/lib/domains/gateway';
 export {traefikDocument} from './artifacts/api-server/src/lib/domains/controller';`},
 bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.dirname':JSON.stringify(process.cwd()+'/artifacts/api-server/dist')},
 banner:{js:`import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(process.cwd()+'/artifacts/api-server/package.json')});`},
 plugins:[{name:'isolated',setup(b){
  b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'stub'}));
  b.onResolve({filter:/\/platform$/},()=>({path:'platform',namespace:'stub'}));
  b.onResolve({filter:/\/logger$/},()=>({path:'logger',namespace:'stub'}));
  b.onResolve({filter:/commerce\/navigation$/},()=>({path:'commerce',namespace:'stub'}));
  b.onResolve({filter:/\/public-site$/},()=>({path:'public',namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},a=>({loader:'js',contents:{
   db:'export const pool=globalThis.__domainTestDB;',
   platform:'export const transaction=fn=>fn(globalThis.__domainTestDB);',
   logger:'export const logger={warn(){},error(){}};',
   commerce:'export const tryCommerceDocument=async(req,res,path,custom)=>{res.status(200).send({path,custom});return true;};',
   public:'export const resolvePublicDocument=async()=>({});export const writePublicDocument=()=>{};',
  }[a.path]}));
 }}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
assert.equal(m.normalizeDomain(' HTTPS://Shop.Example.COM./path?q=yes '.trim()),'shop.example.com');
assert.equal(m.normalizeDomain('bücher.de'),'xn--bcher-kva.de');
for(const host of ['127.0.0.1','localhost','co.uk','*.example.com','https://u:p@example.com','example.com:443','evil.com\\@example.com','https://example.com:443','bad..example.com'])assert.throws(()=>m.normalizeDomain(host),host);
assert.notEqual(m.normalizeDomain('www.example.com'),m.normalizeDomain('example.com'));
assert.throws(()=>m.validateCustomerDomain('api.bhru.net'));
assert.equal(m.dnsInstructions('example.co.uk','x').some(r=>r.type==='CNAME'),false);
assert.equal(m.dnsInstructions('shop.example.co.uk','x').find(r=>r.type==='CNAME').name,'shop');
await m.addDomain(subscriberA,'shop-a.example.com');await m.addDomain(subscriberB,'shop-b.example.com');
await assert.rejects(()=>m.addDomain(subscriberB,'shop-a.example.com'),/already registered/);
const A=[...records.values()].find(r=>r.subscriber_id===subscriberA),B=[...records.values()].find(r=>r.subscriber_id===subscriberB);
assert.notEqual(A.verification_token,B.verification_token);assert.equal(A.verification_token.length,64);
await assert.rejects(()=>m.ownedDomain(subscriberB,A.id),/not found/);
await m.addDomain(subscriberA,'other.example.com');
await assert.rejects(()=>m.addDomain(subscriberA,'third.example.com'),/limit/);
assert.equal(m.evaluateDns(A,{txt:[],cname:[],addresses:['203.0.113.10']}).ownership,false);
assert.equal(m.evaluateDns(A,{txt:[['bhru-verification=',A.verification_token]],cname:[],addresses:['203.0.113.10']}).routes,true);
assert.equal(m.evaluateDns(A,{txt:[['bhru-verification='+A.verification_token]],cname:[],addresses:['127.0.0.1']}).routes,false);
async function hostRequest(host,path='/',extra={}){
 const req={headers:{host,...extra},query:{nonce:'a'.repeat(32)},rawHeaders:['Host',host],socket:{remoteAddress:'192.0.2.1'},path,method:'GET'};
 const result={status:0,body:null,next:false};
 const res={setHeader(){},status(n){result.status=n;return this;},end(){return this;},type(){return this;},send(body){result.body=body;return this;}};
 await m.customDomainGateway(req,res,()=>{result.next=true;});return result;
}
assert.equal((await hostRequest(A.hostname)).status,404);
for(const r of [A,B])Object.assign(r,{public_slug:r===A?'tenant-a':'tenant-b',verification_status:'verified',dns_status:'ready',tls_status:'ready',dns_checked_at:new Date()});
assert.deepEqual((await hostRequest(A.hostname)).body,{path:'/tenant-a',custom:true});
assert.deepEqual((await hostRequest(B.hostname)).body,{path:'/tenant-b',custom:true});
assert.equal((await hostRequest('unknown.example.com','/',{'x-forwarded-host':A.hostname,'x-subscriber-id':subscriberA})).status,404);
assert.equal((await hostRequest(A.hostname,'/api/public/commerce/tenant-b/catalog')).status,404);
assert.equal((await hostRequest(A.hostname,'/api/public/commerce/tenant-a/catalog')).next,true);
assert.equal((await hostRequest(A.hostname,'/m/domains')).status,404);
assert.equal((await hostRequest('bhru.net','/tenant-a')).next,true);
assert.equal((await hostRequest(A.hostname,`/.well-known/bhru-domain/${A.id}`)).body,m.domainProof(A,'a'.repeat(32)));
assert.ok(JSON.stringify(m.traefikDocument([A,B])).includes('Host(`shop-a.example.com`)'));
await m.modifyDomain(subscriberA,A.id,'remove');
assert.equal((await hostRequest(A.hostname)).status,404);
assert.equal((await hostRequest(B.hostname)).status,200);
const migration=readFileSync('lib/db/src/migrations/018_subscriber_custom_domains.sql','utf8');
assert.match(migration,/hostname text NOT NULL UNIQUE/);assert.match(migration,/WHERE is_primary/);
assert.ok(!/ALTER TABLE subscribers|DROP TABLE|DELETE FROM/i.test(migration));
console.log('PASS: normalization/IDN/reserved/apex DNS, two isolated tenants, duplicate/limit rejection, ownership evidence, forged headers, unverified/removed/private/cross-tenant paths, root mapping, challenge identity, Traefik output, migration constraints. DB/DNS/TLS simulated; no production access.');
