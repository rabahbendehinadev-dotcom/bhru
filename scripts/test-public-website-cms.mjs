import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pool, base, load, api } from './lib/public-site-fixtures.mjs';

assert(process.env.NODE_ENV !== 'production','Development verification only');
const require=createRequire(new URL('../artifacts/api-server/package.json',import.meta.url));
const {PNG}=require('pngjs'), jpeg=require('jpeg-js');
const fixtures=await load(), [a,b]=fixtures.sites;
const actors=[{},{}];
let passed=0;
const pass=text=>console.log(`PASS ${++passed}: ${text}`);
const send=(actor,path,method='GET',body,extra={})=>fetch(`${base}/api${path}`,{
  method,headers:{'X-BHRU-Request':'1',...(actor.cookie?{Cookie:actor.cookie}:{}),...extra},
  ...(body===undefined?{}:{body}),redirect:'manual',
});
const png=new PNG({width:16,height:16});
png.data.fill(255);
for(let i=0;i<png.data.length;i+=4) {png.data[i]=26;png.data[i+1]=127;png.data[i+2]=100;}
const pngBytes=PNG.sync.write(png);
const jpegBytes=jpeg.encode({width:16,height:16,data:png.data},85).data;
const upload=(actor,bytes=pngBytes,type='image/png')=>send(actor,'/cms/public-website/assets','POST',bytes,{'Content-Type':type});
const cmsFingerprints=async()=>Object.fromEntries(await Promise.all(['subscriber_public_sites','public_site_assets'].map(async table=>[
  table,(await pool.query(`SELECT md5(coalesce(json_agg(t ORDER BY t.subscriber_id)::text,'[]')) AS fingerprint FROM ${table} t
    WHERE subscriber_id<>ALL($1::uuid[])`,[fixtures.sites.map(site=>site.id)])).rows[0].fingerprint,
])));
const original=await cmsFingerprints();
try {
  assert.equal((await api({},'/cms/public-website')).status,401);
  for(let index=0;index<2;index++) assert.equal((await api(actors[index],'/auth/login','POST',{
    identifier:fixtures.sites[index].username,password:fixtures.password,
  })).status,200);
  const [actorA,actorB]=actors;
  let config=(await api(actorA,'/cms/public-website')).data;
  const configB=(await api(actorB,'/cms/public-website')).data;
  assert.equal(config.public_slug,a.slug); assert.equal(configB.public_slug,b.slug);
  assert.equal(config.revision,0); assert.equal(config.values.logo_asset_id,null);
  assert.equal(config.public_url,`https://bhru.net/${a.slug}`);
  pass('Owner derived from session; existing subscriber defaults and immutable canonical slug returned without a CMS backfill');

  assert.equal((await api(actorA,`/cms/public-website?subscriber_id=${b.id}`)).status,400);
  assert.equal((await api(actorA,'/cms/public-website','PUT',{values:config.values,revision:0,subscriber_id:b.id})).status,400);
  assert.equal((await api(actorA,'/cms/public-website','PUT',{values:{...config.values,subscriber_id:b.id},revision:0})).status,400);
  assert.equal((await api(actorA,'/cms/public-website','PUT',{values:{...config.values,public_slug:'changed'},revision:0})).status,400);
  pass('Query, outer-body and nested owner/slug injection blocked');

  for(const color of ['red','#123','</style><script>evil</script>']) {
    assert.equal((await api(actorA,'/cms/public-website','PUT',{values:{...config.values,primary_color:color},revision:0})).status,400);
  }
  for(const destination of ['javascript:alert(1)','data:text/html,evil','//evil.example','/login','https://user:password@example.com/','https://bhru.net/dashboard']) {
    assert.equal((await api(actorA,'/cms/public-website','PUT',{values:{...config.values,primary_cta_destination:destination},revision:0})).status,400);
  }
  assert.equal((await api(actorA,'/cms/public-website')).data.revision,0);
  pass('Invalid HEX, executable/protocol-relative/credential/private CTA destinations rejected without a write');

  assert.equal((await upload({},pngBytes)).status,401);
  assert.equal((await fetch(`${base}/api/cms/public-website/assets`,{method:'POST',headers:{Cookie:actorA.cookie,'Content-Type':'image/png'},body:pngBytes})).status,403);
  const bad=[
    [Buffer.from('<svg onload="alert(1)"></svg>'),'image/png'],
    [Buffer.from('MZ executable'),'image/jpeg'],
    [Buffer.from('GIF89a'),'image/png'],
    [pngBytes,'image/jpeg'],
    [Buffer.concat([pngBytes,Buffer.from('<script>evil</script>')]),'image/png'],
    [Buffer.concat([jpegBytes,Buffer.from('evil'),Buffer.from([255,217])]),'image/jpeg'],
  ];
  for(const [bytes,type] of bad) assert.equal((await upload(actorA,bytes,type)).status,400);
  assert.equal((await upload(actorA,Buffer.alloc(5*1024*1024+1),'image/png')).status,413);
  const bomb=Buffer.from(pngBytes);bomb.writeUInt32BE(10000,16);
  assert.equal((await upload(actorA,bomb)).status,400);
  pass('Authentication/CSRF, real decoding, MIME mismatch, SVG/GIF/executable/trailing payload, oversized and pixel-bomb validation');

  const aUpload=await upload(actorA), bUpload=await upload(actorB,jpegBytes,'image/jpeg');
  assert.equal(aUpload.status,201);assert.equal(bUpload.status,201);
  const assetA=await aUpload.json(),assetB=await bUpload.json();
  assert.match(assetA.id,/^[a-f0-9-]{36}$/);
  assert(!assetA.url.includes(a.id));assert(!JSON.stringify(assetA).includes('storage_key'));
  assert.equal((await fetch(`${base}${assetA.url}`)).status,200);
  assert.equal((await fetch(`${base}${assetA.url.split('?')[0]}`)).status,404);
  assert.equal((await fetch(`${base}${assetA.url.replace(/preview=[^&]+/,'preview=0000000000.'+'0'.repeat(64))}`)).status,404);
  assert.equal((await api(actorA,'/cms/public-website','PUT',{values:{...config.values,logo_asset_id:assetB.id},revision:0})).status,400);
  assert.equal((await send(actorA,`/cms/public-website/assets/${assetB.id}`,'DELETE')).status,404);
  pass('PNG/JPEG normalized to generated keys; draft previews temporary; cross-owner assignment/deletion denied');

  const draft={...config.values,display_name:`CMS A ${fixtures.tag}`,primary_color:'#1A7F64',
    hero_badge:'Device services',hero_title:'A scoped hero title',hero_description:'Real saved configuration.',
    business_description:'A subscriber-owned short description.',logo_asset_id:assetA.id,hero_asset_id:assetA.id,
    primary_cta_label:'Explore catalogue',primary_cta_destination:'#services',
    secondary_cta_label:'Contact business',secondary_cta_destination:'https://example.com/contact'};
  const preview=await api(actorA,'/cms/public-website/preview','POST',{values:draft});
  assert.equal(preview.status,200);
  assert(preview.data.html.includes(draft.hero_title)&&preview.data.html.includes(draft.display_name));
  assert(preview.data.html.includes('Content-Security-Policy'));
  assert(!JSON.stringify(preview.data).includes(a.id));
  assert.equal((await api(actorA,'/cms/public-website')).data.revision,0);
  const before=await(await fetch(`${base}/${a.slug}`)).text();
  assert(!before.includes(draft.hero_title));
  pass('Unsaved preview reuses shared template without persisting or leaking owner identifiers');

  const saved=await api(actorA,'/cms/public-website','PUT',{values:draft,revision:0});
  assert.equal(saved.status,200);config=saved.data;
  assert.equal(config.values.primary_color,'#1a7f64');assert.equal(config.revision,1);
  assert.deepEqual((await api(actorA,'/cms/public-website')).data.values,config.values);
  const publicA=await fetch(`${base}/${a.slug}`),publicHTML=await publicA.text();
  assert.equal(publicA.status,200);assert.equal(publicA.headers.get('set-cookie'),null);
  for(const text of [draft.display_name,draft.hero_badge,draft.hero_title,draft.hero_description,draft.business_description,draft.primary_cta_label,draft.secondary_cta_destination]) assert(publicHTML.includes(text));
  assert(publicHTML.includes('#1a7f64'));
  assert.equal((await fetch(`${base}${assetA.url.split('?')[0]}`)).status,200);
  assert.equal((await send(actorA,`/cms/public-website/assets/${assetA.id}`,'DELETE')).status,409);
  pass('Save/reload and public adapter reflect branding, hero, colour, both CTAs and published images; referenced-image deletion blocked');

  const pageB=await fetch(`${base}/${b.slug}`,{headers:{Cookie:actorA.cookie}}),htmlB=await pageB.text();
  assert.equal(pageB.status,200);assert(!htmlB.includes(draft.hero_title)&&htmlB.includes(b.company));
  assert.equal(pageB.headers.get('set-cookie'),null);
  assert.equal((await api(actorA,'/cms/public-website')).data.public_slug,a.slug);
  assert.deepEqual((await api(actorB,'/cms/public-website')).data.values,configB.values);
  pass('Authenticated A visiting public B stays B; private A session and B configuration unchanged');

  const writes=await Promise.all([1,2].map(index=>api(actorA,'/cms/public-website','PUT',{
    values:{...config.values,hero_title:`Concurrent ${index}`},revision:config.revision,
  })));
  assert.deepEqual(writes.map(result=>result.status).sort(),[200,409]);
  config=(await api(actorA,'/cms/public-website')).data;
  pass('Concurrent saves serialize; exactly one succeeds and stale revision receives 409');

  const xss=await api(actorA,'/cms/public-website/preview','POST',{values:{...config.values,hero_title:'<script>CMS_INJECTION</script>'}});
  assert.equal(xss.status,200);assert(!xss.data.html.includes('<script>CMS_INJECTION</script>'));
  assert(xss.data.html.includes('&lt;script&gt;CMS_INJECTION&lt;/script&gt;'));
  pass('CMS text is HTML escaped; preview retains only the fixed menu script');

  const removed=await api(actorA,'/cms/public-website','PUT',{values:{...config.values,logo_asset_id:null},revision:config.revision});
  assert.equal(removed.status,200);config=removed.data;
  assert.equal((await fetch(`${base}${assetA.url.split('?')[0]}`)).status,200,'Shared hero reference retains image');
  const replacementResponse=await upload(actorA,jpegBytes,'image/jpeg');
  assert.equal(replacementResponse.status,201);const replacement=await replacementResponse.json();
  const replaced=await api(actorA,'/cms/public-website','PUT',{values:{...config.values,hero_asset_id:replacement.id},revision:config.revision});
  assert.equal(replaced.status,200);config=replaced.data;
  assert.equal((await fetch(`${base}${assetA.url.split('?')[0]}`)).status,404);
  assert.equal((await pool.query('SELECT 1 FROM public_site_assets WHERE id=$1',[assetA.id])).rowCount,0);
  assert.equal((await fetch(`${base}${replacement.url.split('?')[0]}`)).status,200);
  pass('Remove/replace commits before cleanup; shared slot references retained and old unreferenced media removed');

  await pool.query("UPDATE subscriptions SET status='SUSPENDED' WHERE subscriber_id=$1",[a.id]);
  try {
    assert.equal((await api(actorA,'/cms/public-website')).status,403);
    assert.equal((await api(actorA,'/cms/public-website','PUT',{values:config.values,revision:config.revision})).status,403);
    assert.equal((await fetch(`${base}/${a.slug}`)).status,404);
    assert.equal((await fetch(`${base}${replacement.url.split('?')[0]}`)).status,404);
    assert.equal((await pool.query('SELECT revision FROM subscriber_public_sites WHERE subscriber_id=$1',[a.id])).rows[0].revision,config.revision);
  } finally {await pool.query("UPDATE subscriptions SET status='ACTIVE' WHERE subscriber_id=$1",[a.id]);}
  pass('Existing eligibility blocks public site/media and CMS writes without deleting saved configuration or changing licence rules');
} finally {
  await pool.query('DELETE FROM subscriber_public_sites WHERE subscriber_id=ANY($1::uuid[])',[[a.id,b.id]]);
  for(let index=0;index<2;index++) {
    const rows=(await pool.query('SELECT id FROM public_site_assets WHERE subscriber_id=$1',[fixtures.sites[index].id])).rows;
    for(const row of rows) assert.equal((await send(actors[index],`/cms/public-website/assets/${row.id}`,'DELETE')).status,204);
  }
  assert.deepEqual(await cmsFingerprints(),original);
  console.log('CMS verification data/media removed; existing CMS owner data unchanged. Public-site fixtures retained for browser verification.');
  await pool.end();
}
