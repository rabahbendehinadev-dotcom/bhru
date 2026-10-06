import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {pool,base,load,api} from './lib/public-site-fixtures.mjs';
assert(process.env.NODE_ENV!=='production','Development verification only');
const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
const {PNG}=require('pngjs');
const fixtures=await load(),[a,b]=fixtures.sites,actors=[{},{}];
const ids=fixtures.sites.map(s=>s.id);
const tables=['subscriber_public_sites','public_site_assets','public_site_presentation','public_site_partner_logos','public_site_announcements','public_site_banners'];
const fingerprint=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[
  table,(await pool.query(`SELECT md5(coalesce(string_agg(row_to_json(t)::text,'|' ORDER BY row_to_json(t)::text),'')) AS hash
    FROM ${table} t WHERE subscriber_id<>ALL($1::uuid[])`,[ids])).rows[0].hash,
])));
const original=await fingerprint();
let passed=0;
const pass=name=>console.log(`PASS ${++passed}: ${name}`);
const p='/cms/public-website/presentation';
const get=async actor=>(await api(actor,p)).data;
const put=(actor,values,revision)=>api(actor,p,'PUT',{values,revision});
const publicHTML=async actor=>{const r=await fetch(`${base}/${actor.slug}`,{headers:actor.cookie?{Cookie:actor.cookie}:{}});assert.equal(r.status,200);return {html:await r.text(),csp:r.headers.get('content-security-policy')};};
const upload=async actor=>{
  const png=new PNG({width:120,height:36});png.data.fill(210);
  for(let i=3;i<png.data.length;i+=4)png.data[i]=255;
  const r=await fetch(`${base}/api/cms/public-website/assets`,{method:'POST',headers:{Cookie:actor.cookie,'X-BHRU-Request':'1','X-BHRU-Auth':'subscriber','Content-Type':'image/png'},body:PNG.sync.write(png)});
  assert.equal(r.status,201);return r.json();
};
const assetDelete=actor=>id=>fetch(`${base}/api/cms/public-website/assets/${id}`,{method:'DELETE',headers:{Cookie:actor.cookie,'X-BHRU-Request':'1','X-BHRU-Auth':'subscriber'}});
try{
  for(let i=0;i<2;i++)assert.equal((await api(actors[i],'/auth/login','POST',{identifier:fixtures.sites[i].username,password:fixtures.password})).status,200);
  const [A,B]=actors;
  const first=await get(A),beta=await get(B);
  assert.equal(first.revision,0);assert.equal(first.values.hero_mode,'classic');
  assert.equal(first.values.logo_strip_enabled,false);assert.equal(first.values.announcements_enabled,false);
  const before=await publicHTML({slug:a.slug});
  assert(!before.html.includes('p2-top-area'));assert(!before.html.includes('data-banner-slider'));
  const emptySave=await put(A,first.values,0);assert.equal(emptySave.status,200);
  assert.equal((await publicHTML({slug:a.slug})).html,before.html);
  assert.equal((await publicHTML({slug:a.slug})).csp,before.csp);
  pass('No Phase 2 row and explicit empty Phase 2 defaults have byte-identical frozen V2 HTML/CSP; Classic remains default');

  assert.equal((await api({},p)).status,401);
  assert.equal((await api(A,`${p}?subscriber_id=${b.id}`)).status,400);
  assert.equal((await api(A,`${p}/${b.id}`)).status,404);
  assert.equal((await api(A,p,'PUT',{values:first.values,revision:1,subscriber_id:b.id})).status,400);
  for(const bad of [
    {...first.values,subscriber_id:b.id},
    {...first.values,announcements:[{id:randomUUID(),enabled:true,text:'Injected',destination:'',background_color:'#ffffff',text_color:'#000000',movement:'static',direction:'left',speed:'normal',subscriber_id:b.id}]},
  ])assert.equal((await put(A,bad,1)).status,400);
  assert.deepEqual(await get(B),beta);
  pass('Private CMS authentication, query/path/body/nested owner injection blocked; no cross-tenant read');

  const images=await Promise.all([upload(A),upload(A),upload(A),upload(B)]);
  const banner=(asset,alt,enabled=true)=>({id:randomUUID(),asset_id:asset.id,alt_text:alt,destination:'#services',enabled});
  let config=await get(A);
  let values={...config.values,hero_mode:'banner',banners:[banner(images[0],'First banner')]};
  assert.equal((await put(A,values,config.revision)).status,200);
  let rendered=await publicHTML({slug:a.slug});
  assert(rendered.html.includes('First banner'));assert(!rendered.html.includes('data-banner-slider'));
  assert(!rendered.html.includes('data-banner-prev'));assert(!rendered.html.includes('Your next phone service starts here.'));
  assert.equal((await fetch(base+images[0].url.split('?')[0])).status,200);
  pass('One enabled banner replaces only Hero, preserves header/services, remains static and publishes its owned image');

  config=await get(A);
  values={...config.values,banners:[banner(images[1],'Second banner'),config.values.banners[0],banner(images[2],'Disabled banner',false)],slider_interval:3};
  assert.equal((await put(A,values,config.revision)).status,200);
  rendered=await publicHTML({slug:a.slug});
  assert(rendered.html.indexOf('Second banner')<rendered.html.indexOf('First banner'));
  assert(!rendered.html.includes('Disabled banner'));assert(rendered.html.includes('data-banner-slider'));
  assert(rendered.html.includes('data-banner-prev'));assert(rendered.html.includes('data-banner-dot'));
  assert.equal((rendered.csp.match(/sha256-/g)||[]).length,2);
  assert.equal((await fetch(base+images[2].url.split('?')[0])).status,404);
  assert.equal((await assetDelete(A)(images[2].id)).status,409);
  pass('Multiple banners/order/disabled filtering/slider settings/hash CSP; disabled saved references stay protected but unpublished');

  config=await get(A);
  const announce=(text,movement='static')=>({id:randomUUID(),enabled:true,text,destination:'#services',background_color:'#123456',text_color:'#ffffff',movement,direction:'right',speed:'fast'});
  values={...config.values,logo_strip_enabled:true,announcements_enabled:true,
    logos:[{id:randomUUID(),asset_id:images[1].id,label:'Logo Second',destination:'#services',new_tab:true,enabled:true},{id:randomUUID(),asset_id:images[0].id,label:'Logo First',destination:'',new_tab:false,enabled:true}],
    announcements:[announce('Announcement two','scrolling'),announce('Announcement one'),{...announce('Disabled announcement'),enabled:false}],
    custom_html_enabled:true,custom_html:'<p>Safe HTML <strong>message</strong><a href="#services">Services</a></p><script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)" onclick="alert(1)">Unsafe</a><svg onload="alert(1)"></svg><form><input autofocus></form><div style="position:fixed">No styles</div>',
  };
  assert.equal((await put(A,values,config.revision)).status,200);
  config=await get(A);rendered=await publicHTML({slug:a.slug});
  assert(rendered.html.indexOf('Logo Second')<rendered.html.indexOf('Logo First'));
  assert(rendered.html.indexOf('Announcement two')<rendered.html.indexOf('Announcement one'));
  assert(!rendered.html.includes('Disabled announcement'));
  assert(rendered.html.indexOf('<div class="p2-top-area">')<rendered.html.indexOf('<header'));
  assert(!config.values.custom_html.match(/script|iframe|onerror|onclick|javascript:|style=|<svg|<form|<input/i));
  assert(config.values.custom_html.includes('<strong>message</strong>'));
  assert(rendered.html.includes('prefers-reduced-motion'));assert(!rendered.html.includes('<marquee'));
  assert(rendered.html.includes('animation-direction:reverse'));assert(rendered.html.includes('noopener noreferrer'));
  pass('Top Area logo/announcement order, enabled filtering, colour/motion controls and parser-based HTML sanitization persist and render');

  const betaBanner=banner(images[3],'Beta only banner');
  const betaLogo={id:randomUUID(),asset_id:images[3].id,label:'Beta only logo',destination:'',new_tab:false,enabled:true};
  const betaBar=announce('Beta only announcement');
  let betaSaved=await put(B,{...beta.values,hero_mode:'banner',logos:[betaLogo],logo_strip_enabled:true,banners:[betaBanner],announcements:[betaBar],announcements_enabled:true},0);
  assert.equal(betaSaved.status,200);
  for(const injected of [
    {...config.values,banners:[betaBanner]},
    {...config.values,logos:[betaLogo]},
    {...config.values,announcements:[betaBar]},
    {...config.values,banners:[banner(images[3],'Cross-owner image')]},
    {...config.values,logos:[{...config.values.logos[0],id:betaBanner.id}]},
  ])assert.equal((await put(A,injected,config.revision)).status,400);
  assert.equal((await assetDelete(A)(images[3].id)).status,404);
  const protectedB=await get(B);
  assert.deepEqual(protectedB.values,betaSaved.data.values);
  assert.equal(protectedB.revision,betaSaved.data.revision);
  const publicB=await publicHTML({slug:b.slug,cookie:A.cookie});
  assert(publicB.html.includes('Beta only banner'));assert(!publicB.html.includes('First banner'));
  assert(!publicB.html.includes(a.id));assert(!publicB.html.includes(b.id));
  assert.equal((await api(A,'/cms/public-website')).data.public_slug,a.slug);
  pass('A cannot edit/delete/reorder B item IDs or use/manage B media; authenticated A visits B public content and retains A session');

  const baseConfig=(await api(A,'/cms/public-website')).data;
  const preview=await api(A,'/cms/public-website/preview','POST',{values:baseConfig.values,presentation:{...config.values,announcements:[announce('Unsaved announcement')]}});
  assert.equal(preview.status,200);assert(preview.data.html.includes('Unsaved announcement'));
  assert(preview.data.html.includes('data-banner-slider'));assert(!((await publicHTML({slug:a.slug})).html.includes('Unsaved announcement')));
  assert.deepEqual((await get(A)).values,config.values);
  assert(Object.keys(preview.data.asset_urls).includes(images[0].id));
  pass('Same renderer previews unsaved Top Area/Banner values and signed media without persistence');
  const uppercase=await api(A,'/cms/public-website/preview','POST',{values:baseConfig.values,presentation:{...config.values,
    banners:config.values.banners.map(i=>({...i,id:i.id.toUpperCase(),asset_id:i.asset_id.toUpperCase()})),
  }});
  assert.equal(uppercase.status,200);assert(uppercase.data.html.includes('First banner'));
  pass('Equivalent uppercase UUIDs normalize safely instead of failing an owned-image preview');

  for(const patch of [
    {slider_interval:4},{hero_mode:'other'},{announcements:[{...announce('Bad colour'),background_color:'red'}]},
    {banners:[{...config.values.banners[0],destination:'javascript:alert(1)'}]},
    {logos:[{...config.values.logos[0],destination:'/login'}]},
    {logos:[{...config.values.logos[0],destination:'https://bhru.net/%6d/dashboard'}]},
    {logos:[{...config.values.logos[0],destination:'//evil.test'}]},
    {logos:[{...config.values.logos[0],destination:'https://user:pass@evil.test'}]},
    {banners:[config.values.banners[0],config.values.banners[0]]},
    {banners:Array.from({length:9},()=>banner(images[0],'Too many'))},
    {logos:Array.from({length:7},()=>({...config.values.logos[0],id:randomUUID()}))},
    {announcements:Array.from({length:9},()=>announce('Too many'))},
    {custom_html:'x'.repeat(4097)},
  ])assert.equal((await put(A,{...config.values,...patch},config.revision)).status,400);
  assert.deepEqual((await get(A)).values,config.values);
  pass('Enums, HEX, duplicate IDs and executable/credential/protocol-relative/private destinations rejected without mutation');
  const linksPreview=await api(A,'/cms/public-website/preview','POST',{values:baseConfig.values,presentation:{...config.values,banners:[{...config.values.banners[0],destination:`/${b.slug}#services`}]}}); 
  assert.equal(linksPreview.status,200);assert(linksPreview.data.html.includes(`href="/${b.slug}#services"`));
  pass('Safe public /slug anchors work without creating routes or enabling private-route destinations');

  const concurrent=await Promise.all([put(A,config.values,config.revision),put(A,config.values,config.revision)]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  config=await get(A);
  const joint=await api(A,'/cms/public-website','PUT',{values:{...baseConfig.values,hero_title:'Atomic title'},revision:baseConfig.revision,presentation:config.values,presentation_revision:config.revision-1});
  assert.equal(joint.status,409);
  assert.equal((await api(A,'/cms/public-website')).data.values.hero_title,baseConfig.values.hero_title);
  const good=await api(A,'/cms/public-website','PUT',{values:{...baseConfig.values,hero_title:'Atomic title'},revision:baseConfig.revision,presentation:config.values,presentation_revision:config.revision});
  assert.equal(good.status,200);assert(good.data.presentation);assert.equal(good.data.values.hero_title,'Atomic title');
  pass('Concurrent revisions yield one 200/one409; joint Phase1+2 save is atomic and reloads both');

  config=await get(A);
  values={...config.values,hero_mode:'classic'};
  assert.equal((await put(A,values,config.revision)).status,200);
  rendered=await publicHTML({slug:a.slug});assert(rendered.html.includes('Atomic title'));assert(!rendered.html.includes('data-banner-slider'));
  assert.equal((await assetDelete(A)(images[1].id)).status,409);
  config=await get(A);
  values={...config.values,hero_mode:'banner',banners:config.values.banners.map(i=>({...i,enabled:false}))};
  assert.equal((await put(A,values,config.revision)).status,200);
  assert((await publicHTML({slug:a.slug})).html.includes('Atomic title'));
  pass('Classic fields retained, zero enabled banners safely fall back to Classic; hidden/shared item images remain protected');

  for(const table of ['public_site_partner_logos','public_site_banners']){
    const client=await pool.connect();
    await client.query('BEGIN');
    try{
      await assert.rejects(client.query(`UPDATE ${table} SET asset_id=$1 WHERE subscriber_id=$2`,[images[3].id,a.id]),e=>e.code==='23503');
    }finally{await client.query('ROLLBACK');client.release();}
  }
  pass('Composite foreign keys independently block cross-owner image references');
}finally{
  for(const table of ['public_site_partner_logos','public_site_announcements','public_site_banners','public_site_presentation','subscriber_public_sites']) await pool.query(`DELETE FROM ${table} WHERE subscriber_id=ANY($1::uuid[])`,[ids]);
  for(let i=0;i<2;i++){
    const assets=(await pool.query('SELECT id FROM public_site_assets WHERE subscriber_id=$1',[fixtures.sites[i].id])).rows;
    for(const row of assets)assert.equal((await assetDelete(actors[i])(row.id)).status,204);
  }
  assert.deepEqual(await fingerprint(),original,'Original CMS and media records unchanged');
  await pool.end();
}
await writeFile('/tmp/bhru-phase2-unit-ready','Owned backend fixtures reset; safe for browser journey.');
console.log('Phase 2 backend fixture configuration/media removed; original data unchanged. Browser fixtures retained.');
