import assert from 'node:assert/strict';
import { pool, base, load, api } from './lib/public-site-fixtures.mjs';
assert(process.env.NODE_ENV!=='production','Development fixture cleanup only');
const fixtures=await load();
try {
  const ids=fixtures.sites.map(site=>site.id);
  for(const table of ['public_site_partner_logos','public_site_announcements','public_site_banners','public_site_presentation','subscriber_public_sites'])
    await pool.query(`DELETE FROM ${table} WHERE subscriber_id=ANY($1::uuid[])`,[ids]);
  for(const site of fixtures.sites) {
    const rows=(await pool.query('SELECT id FROM public_site_assets WHERE subscriber_id=$1',[site.id])).rows;
    if (!rows.length) continue;
    const actor={};
    assert.equal((await api(actor,'/auth/login','POST',{identifier:site.username,password:fixtures.password})).status,200);
    for(const row of rows) {
      const response=await fetch(`${base}/api/cms/public-website/assets/${row.id}`,{
        method:'DELETE',headers:{Cookie:actor.cookie,'X-BHRU-Request':'1','X-BHRU-Auth':'subscriber'},
      });
      assert.equal(response.status,204,'Remove only owned, unreferenced fixture media through storage adapter');
    }
  }
  console.log('Owned CMS verification configurations and media removed; no original subscriber data targeted.');
} finally {await pool.end();}
