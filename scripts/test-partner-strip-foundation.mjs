// Focused source/HTTP/DOM-algorithm checks. DB and file storage are in-memory substitutes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import express from '../artifacts/api-server/node_modules/express/index.js';
const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
const root=process.cwd(),tenants=new Map(),assets=new Map(),files=new Map();
const db={async query(sql,p=[]){
 const t=tenants.get(p[0]), rows=x=>({rows:x,rowCount:x.length});
 if(sql.includes('INSERT INTO auth_rate_limits'))return rows([{attempts:1}]);
 if(sql.startsWith('SELECT id FROM subscriptions')||sql.startsWith('SELECT id FROM subscribers'))return rows([{id:p[0]}]);
 if(sql.startsWith('SELECT * FROM public_site_presentation'))return rows(t.row?[structuredClone(t.row)]:[]);
 if(sql.startsWith('SELECT id,')&&sql.includes(' FROM public_site_')&&!sql.includes(' FROM public_site_assets')) {
  const table=/ FROM (public_site_\w+)/.exec(sql)[1],keys=sql.slice(7,sql.indexOf(' FROM')).split(',');
  return rows((t.items[table]??[]).map(item=>Object.fromEntries(keys.map(k=>[k,item[k]]))));
 }
 if(sql.startsWith('SELECT id,storage_key'))return rows(p[1].filter(id=>assets.get(id)?.subscriber_id===p[0]).map(id=>assets.get(id)));
 if(sql.startsWith('SELECT count(*)'))return rows([{count:[...assets.values()].filter(a=>a.subscriber_id===p[0]).length,bytes:0}]);
 if(sql.startsWith('INSERT INTO public_site_assets')) {
  const [id,subscriber_id,storage_key,content_type,byte_size,width,height]=p;
  assets.set(id,{id,subscriber_id,storage_key,content_type,byte_size,width,height});return rows([]);
 }
 if(sql.startsWith('SELECT 1 FROM public_site_')) {
  const table=/FROM (\w+)/.exec(sql)[1];
  return rows([...tenants.entries()].flatMap(([id,t])=>id===p[1]?[]:(t.items[table]??[]).filter(x=>p[0].includes(x.id))));
 }
 if(sql.startsWith('INSERT INTO public_site_presentation')) {
  const fields=/subscriber_id,([^)]*)\)/.exec(sql)[1].split(',');
  t.row={...t.row,revision:(t.row?.revision??0)+1};fields.forEach((k,i)=>t.row[k]=p[i+1]);return rows([]);
 }
 if(sql.startsWith('DELETE FROM public_site_')){t.items[/FROM (\w+)/.exec(sql)[1]]=[];return rows([]);}
 if(sql.startsWith('INSERT INTO public_site_')) {
  const [,table,keys]=/INSERT INTO (\w+)\(([^)]*)\)/.exec(sql);
  const item=Object.fromEntries(keys.split(',').map((k,i)=>[k,p[i]]));
  assert.ok(item.sort_order>=0&&item.sort_order<10);
  tenants.get(item.subscriber_id).items[table].push(item);return rows([]);
 }
 throw Error('Unexpected simulated query: '+sql);
}};
globalThis.__partnerDB=db;globalThis.__partnerTenants=tenants;globalThis.__partnerFiles=files;
const output=await build({
 stdin:{resolveDir:root,loader:'ts',contents:`
 export {default as router} from './artifacts/api-server/src/routes/public-website.ts';
 export {emptyPresentation,validatePresentation,readPresentation,attachPresentation} from './artifacts/api-server/src/lib/public-site/presentation.ts';
 export {renderTopArea,TOP_AREA_STYLES} from './artifacts/api-server/src/lib/public-site/top-area-render.ts';
 export {TOP_AREA_SCRIPT,TOP_AREA_SCRIPT_HASH} from './artifacts/api-server/src/lib/public-site/top-area-script.ts';`},
 bundle:true,platform:'node',format:'esm',write:false,
 banner:{js:`import {createRequire as mk} from 'node:module';const require=mk(${JSON.stringify(root+'/artifacts/api-server/package.json')});`},
 plugins:[{name:'no-real-db-or-storage',setup(b){
  b.onResolve({filter:/^express$/},()=>({path:pathToFileURL(require.resolve('express')).href,external:true}));
  b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'test'}));
  b.onResolve({filter:/(?:^|\/)platform$/},()=>({path:'platform',namespace:'test'}));
  b.onResolve({filter:/public-site\/media$/},()=>({path:'media',namespace:'test'}));
  b.onLoad({filter:/.*/,namespace:'test'},a=>({loader:'js',contents:a.path==='db'?'export const pool=globalThis.__partnerDB;':
   a.path==='platform'?`export const transaction=fn=>fn(globalThis.__partnerDB);export const getSubscriber=async id=>({allowed:globalThis.__partnerTenants.has(id)});export const audit=async()=>{};export const cleanSubscriber=()=>{};`:
   `export const MAX_IMAGE_BYTES=5*1024*1024;
    export const normalizeImage=bytes=>({bytes,contentType:'image/png',extension:'png',width:120,height:40});
    export const writeImage=async(key,bytes)=>globalThis.__partnerFiles.set(key,bytes);
    export const readImage=async()=>null,removeImage=async()=>{},validPreviewToken=()=>false;
    export const previewImageUrl=(id,key)=>'/api/public/media/'+id+'.png',publicImageUrl=previewImageUrl;`}));
 }}],
});
const {router,emptyPresentation,validatePresentation,readPresentation,attachPresentation,renderTopArea,TOP_AREA_STYLES,TOP_AREA_SCRIPT,TOP_AREA_SCRIPT_HASH}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
function fresh(){
 const id=randomUUID(),defaults=emptyPresentation();
 const t={row:{...defaults,revision:1},items:{public_site_partner_logos:[],public_site_announcements:[],public_site_banners:[]}};
 tenants.set(id,t);return id;
}
const A=fresh(),B=fresh();
assert.deepEqual(emptyPresentation().logo_strip_settings,{display:'moving',speed:'normal',direction:'left',pause_on_hover:true});
assert.equal(emptyPresentation().logo_strip_enabled,true);assert.equal(emptyPresentation().logos.length,0);
const missing=fresh();tenants.get(missing).row=null;
assert.equal((await readPresentation(missing,db)).values.logo_strip_settings.display,'moving');
const legacy=fresh();tenants.get(legacy).row.logo_strip_settings=null;
assert.equal((await readPresentation(legacy,db)).values.logo_strip_settings.display,'static');
const app=express();app.use(express.json());
app.use((req,_res,next)=>{req.auth=req.headers['x-test-admin']?{id:'admin',admin:true,subscriber_id:null}:{id:'user',admin:false,subscriber_id:req.headers['x-test-tenant']};next();});
app.use(router);app.use((e,_req,res,_next)=>res.status(e.status??400).json({error:e.issues?.map(i=>i.message).join(' ')??e.message}));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/cms/public-website`;
async function request(id,path,method='GET',body,headers={}){
 const r=await fetch(base+path,{method,headers:{'x-test-tenant':id,'content-type':Buffer.isBuffer(body)?'image/png':'application/json',...headers},body:body?(Buffer.isBuffer(body)?body:JSON.stringify(body)):undefined});
 return {status:r.status,data:await r.json()};
}
try {
 for(const [id,count,label] of [[A,10,'Alpha'],[B,3,'Beta']]) {
  const config=await request(id,'/presentation');assert.equal(config.status,200);
  const logos=[];
  for(let i=0;i<count;i++){
   const uploaded=await request(id,'/assets','POST',Buffer.from(`simulated-${label}-${i}`));
   assert.equal(uploaded.status,201,JSON.stringify(uploaded.data));
   logos.push({id:randomUUID(),asset_id:uploaded.data.id,label:`${label}-${i}`,destination:'',new_tab:false,enabled:true});
  }
  const values={...config.data.values,logos};
  const savedResponse=await request(id,'/presentation','PUT',{values,revision:config.data.revision});
  assert.equal(savedResponse.status,200,JSON.stringify(savedResponse.data));
  const saved=await request(id,'/presentation');assert.equal(saved.data.values.logos.length,count);
  const html=renderTopArea(await attachPresentation({},id,db));
  assert.equal((html.match(/class="p2-logo-card"/g)??[]).length,count);
  assert.ok(html.includes('data-ticker')&&html.includes('data-pause-hover="true"'));
  assert.ok(!html.includes(id===A?'Beta-':'Alpha-'));
 }
 const config=(await request(A,'/presentation')).data,unchangedB=(await request(B,'/presentation')).data;
 const eleventh={...config.values.logos[0],id:randomUUID()};
 const rejected=await request(A,'/presentation','PUT',{values:{...config.values,logos:[...config.values.logos,eleventh]},revision:config.revision});
 assert.equal(rejected.status,400);assert.match(rejected.data.error,/10 partner logos/);
 const updated={...config.values,logo_strip_settings:{display:'moving',direction:'right',speed:'fast',pause_on_hover:false}};
 assert.equal((await request(A,'/presentation','PUT',{values:updated,revision:config.revision})).status,200);
 assert.deepEqual((await request(B,'/presentation')).data,unchangedB);
 let html=renderTopArea(await attachPresentation({},A,db));
 assert.match(html,/--p2-direction:reverse/);assert.match(html,/data-speed="75"/);assert.match(html,/data-pause-hover="false"/);
 let current=(await request(A,'/presentation')).data;
 const foreign={...current.values,logos:[{...current.values.logos[0],asset_id:unchangedB.values.logos[0].asset_id}]};
 assert.equal((await request(A,'/presentation','PUT',{values:foreign,revision:current.revision})).status,400);
 assert.equal((await request(A,'/presentation','PUT',{values:current.values,revision:current.revision},{'x-test-admin':'1'})).status,403);
 current=(await request(A,'/presentation')).data;
 assert.equal((await request(A,'/presentation','PUT',{values:{...current.values,logo_strip_settings:{...current.values.logo_strip_settings,display:'static'}},revision:current.revision})).status,200);
 html=renderTopArea(await attachPresentation({},A,db));assert.ok(!html.includes('data-ticker'));assert.equal((html.match(/class="p2-logo-card"/g)??[]).length,10);
 assert.equal(tenants.get(A).items.public_site_partner_logos.length,10,'No rendered loop copies persisted');
 assert.equal(files.size,13,'Ten Alpha + three distinct Beta simulated uploads');
} finally {await new Promise(r=>server.close(r));}
// Test the existing seamless-loop algorithm at desktop and phone widths, without a browser.
class Node {
 constructor(children=[]){this.children=children;children.forEach(x=>x.parent=this);this.attrs={};}
 appendChild(n){n.parent=this;this.children.push(n);}
 cloneNode(){const n=new Node(this.children.map(x=>x.cloneNode()));n.attrs={...this.attrs};return n;}
 setAttribute(k,v){this.attrs[k]=v;}
 querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll('*')]);return selector==='*'?all:selector==='[data-ticker-copy]'?all.filter(n=>'data-ticker-copy' in n.attrs):[];}
 getBoundingClientRect(){return {width:this.children.length*168};}
 remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
 contains(){return false;}
}
for(const viewport of [375,390,430,1440])for(const count of [2,10]){
 const group=new Node(Array.from({length:count},()=>new Node())),track=new Node([group]),classes=new Set(),props={};
 track.querySelector=()=>group;
 const ticker={clientWidth:viewport,dataset:{speed:'45'},scrollLeft:0,closest:()=>({}),
  classList:{contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,v)=>v?classes.add(x):classes.delete(x)},
  querySelector:s=>s==='.p2-ticker-track'?track:null,style:{setProperty:(k,v)=>props[k]=v},addEventListener:()=>{}};
 const top={classList:{toggle:()=>{}},querySelectorAll:()=>[ticker]};
 vm.runInNewContext(TOP_AREA_SCRIPT,{document:{querySelector:s=>s==='.p2-top-area'?top:null,hidden:false,addEventListener:()=>{}},
  window:{matchMedia:()=>({matches:false,addEventListener:()=>{}}),addEventListener:()=>{}},requestAnimationFrame:fn=>fn()});
 assert.ok(classes.has('p2-ready'));assert.equal(track.children.length,2);
 assert.equal(track.children[0].children.length,track.children[1].children.length);
 assert.ok(group.getBoundingClientRect().width>=viewport);
 assert.equal(props['--p2-duration'],group.getBoundingClientRect().width/45+'s');
}
assert.equal(TOP_AREA_SCRIPT_HASH,createHash('sha256').update(TOP_AREA_SCRIPT).digest('base64'));
assert.match(TOP_AREA_STYLES,/translateX\(-50%\)/);assert.match(TOP_AREA_STYLES,/object-fit:contain/);
const migration=fs.readFileSync('lib/db/src/migrations/017_partner_logo_strip_capacity_defaults.sql','utf8');
assert.match(migration,/CHECK\(sort_order>=0\)/);assert.match(migration,/AFTER INSERT ON subscribers/);
assert.ok(!/UPDATE\s+public_site_|DELETE\s+FROM|INSERT INTO public_site_partner_logos/i.test(migration));
const editor=fs.readFileSync('artifacts/bhru/src/components/subscriber/public-website/PresentationEditor.tsx','utf8');
assert.match(editor,/Partner logos:/);assert.match(editor,/canUpload=\{\(\) => p\.logos\.length < MAX_LOGOS\}/);
assert.match(editor,/Maximum of 10 partner logos reached/);
assert.match(fs.readFileSync('artifacts/bhru/src/hooks/use-public-website.ts','utf8'),/MAX_LOGOS = 10/);
await build({entryPoints:['artifacts/bhru/src/components/subscriber/public-website/PresentationEditor.tsx'],bundle:true,packages:'external',platform:'browser',format:'esm',outdir:'/tmp/partner-strip-check',write:false,logLevel:'silent'});
console.log('PASS: two fresh tenants; 10/3 simulated upload/save/reload; 11th logo rejected clearly; A-only direction/speed changes; foreign-asset/admin-write rejection; static mode; old NULL-mode compatibility; equal seamless halves at 375/390/430/1440; aspect-ratio/CSP checks; additive future-only defaults and UI compile. No real DB/files accessed.');
