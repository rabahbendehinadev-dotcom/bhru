import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Script } from 'node:vm';
import { readFile } from 'node:fs/promises';

export async function testCustomerPanel({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,api}) {
  let cookie;
  await check('client login lands on dashboard; all eight slug pages require existing customer auth and account is compatible',async()=>{
    const login=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:'new@example.invalid',password}});
    assert.equal(login.status,200,login.text);cookie=login.cookie;
    assert.equal(login.json.next,'/site-a/customer/dashboard');
    for(const page of ['dashboard','services','orders','wallet','transactions','announcements','profile','security','account']) {
      const response=await req('/site-a/customer/'+page,{cookie});
      assert.equal(response.status,200,response.text);
      assert.match(response.text,new RegExp('data-page="'+(page==='account'?'dashboard':page)+'"'));
      assert.match(response.text,/Customer mobile navigation/);
      assert.match(response.text,/\/site-a\/customer\/dashboard/);
      assert.match(response.headers['content-security-policy'],/sha256-/);
      assert.equal((await req('/site-a/customer/'+page)).status,303);
    }
    const source=await readFile(new URL('../artifacts/api-server/src/lib/customer-auth/panel-ui.ts',import.meta.url),'utf8');
    const script=source.split('export const PANEL_SCRIPT = String.raw`')[1].split('`;')[0];
    new Script(script);
    assert.match(source,/Place New Order/);assert.match(source,/Ledger credits/i);
    assert.match(source,/Ledger debits/i);assert.match(source,/Account Statement/);
    assert.ok(!source.includes('Due / Credit')&&!source.includes('formattedDue'));
    assert.match(source,/if \(!ZERO\(f\.lockedAmount\)\)/);
  });
  await check('custom-host panel routes and post-login destination stay on verified host; unknown/foreign hosts do not resolve',async()=>{
    const host='shop-a.example.com';
    const login=await req('/api/public/customer/site-a/login',{host,method:'POST',body:{email:'CustomHost',password}});
    assert.equal(login.status,200,login.text);assert.equal(login.json.next,'/customer/dashboard');
    for(const page of ['dashboard','services','orders','wallet','transactions','announcements','profile','security','account']) {
      const response=await req('/customer/'+page,{host,cookie:login.cookie});
      assert.equal(response.status,200,response.text);
      const html=response.text.split('<script>')[0];
      assert.ok(html.includes('href="/customer/dashboard"'));
      assert.ok(!html.includes('href="/site-a/customer/')&&!html.includes('href="https://bhru.net'));
    }
    assert.equal((await req('/api/public/customer/site-b/panel/announcements',{host,cookie:login.cookie})).status,404);
    assert.equal((await req('/customer/dashboard',{host:'unknown.example.com',cookie:login.cookie})).status,404);
    const dashboard=await req('/api/public/customer/site-a/panel',{cookie});
    assert.equal(dashboard.status,200);assert.equal(dashboard.json.financial.accountCurrency,'USD');
    assert.ok('totalCredits' in dashboard.json.financial && 'processing' in dashboard.json.orderSummary);
  });
  await check('client announcements reuse enabled tenant CMS rows and honor global disable; no cross-tenant or anonymous access',async()=>{
    for(const sub of [sidA,sidB]) await pool.query(`INSERT INTO public_site_presentation(subscriber_id,announcements_enabled)
      VALUES($1,true) ON CONFLICT(subscriber_id) DO UPDATE SET announcements_enabled=true`,[sub]);
    for(const [sub,text,enabled,sort] of [[sidA,'Client A announcement',true,0],[sidA,'Hidden announcement',false,1],[sidB,'Tenant B private announcement',true,0]])
      await pool.query(`INSERT INTO public_site_announcements(id,subscriber_id,text,enabled,destination,background_color,text_color,movement,direction,speed,sort_order)
        VALUES($1,$2,$3,$4,'https://example.com/update','#ffffff','#123456','scrolling','left','normal',$5)`,[randomUUID(),sub,text,enabled,sort]);
    let response=await req('/api/public/customer/site-a/panel/announcements',{cookie});
    assert.equal(response.status,200);assert.deepEqual(response.json.data.map(r=>r.text),['Client A announcement']);
    assert.equal(response.json.data[0].href,'https://example.com/update');
    await pool.query("UPDATE public_site_announcements SET destination='javascript:alert(1)' WHERE subscriber_id=$1 AND enabled",[sidA]);
    const unsafe=await req('/api/public/customer/site-a/panel/announcements',{cookie});
    assert.equal(unsafe.status,503); // Existing public CMS validation fails closed.
    assert.ok(!unsafe.text.includes('href="javascript:'));
    await pool.query("UPDATE public_site_announcements SET destination='https://example.com/update' WHERE subscriber_id=$1 AND enabled",[sidA]);
    assert.equal((await req('/api/public/customer/site-a/panel')).status,401);
    assert.equal((await req('/api/public/customer/site-b/panel/announcements',{cookie})).status,401);
    await pool.query('UPDATE public_site_presentation SET announcements_enabled=false WHERE subscriber_id=$1',[sidA]);
    response=await req('/api/public/customer/site-a/panel/announcements',{cookie});
    assert.deepEqual(response.json.data,[]);
    assert.deepEqual((await req('/api/public/customer/site-a/panel',{cookie})).json.announcements,[]);
  });
  await check('disabled service groups hide services and filters and refuse detail/quote/order without any debit; owners remain tenant scoped',async()=>{
    const group=await req('/api/service-groups',{method:'POST',cookie:ownerCookieA,body:{name:'Withdrawable client group'}});
    assert.equal(group.status,201,group.text);
    const service=await req('/api/manual-services',{method:'POST',cookie:ownerCookieA,body:{
      name:'Withdrawable service',serviceType:'server',groupId:group.json.id,priceUsd:'1',description:'',
      estimatedTime:'Manual',active:true,displayOrder:0,requirements:[],
    }});
    assert.equal(service.status,201,service.text);
    let list=await req('/api/public/customer/site-a/panel/services',{cookie});
    assert.ok(list.json.data.some(s=>s.id===service.json.id));
    const walletBefore=(await req('/api/public/customer/site-a/panel',{cookie})).json.financial;
    assert.equal((await req('/api/service-groups/'+group.json.id,{method:'PATCH',cookie:ownerCookieB,body:{enabled:false}})).status,404);
    assert.equal((await req('/api/service-groups/'+group.json.id,{method:'PATCH',cookie:ownerCookieA,body:{enabled:false}})).status,200);
    list=await req('/api/public/customer/site-a/panel/services',{cookie});
    assert.ok(!list.json.data.some(s=>s.id===service.json.id));
    assert.ok(!list.json.groups.some(g=>g.id===group.json.id));
    assert.equal((await req('/api/public/customer/site-a/panel/services/'+service.json.id,{cookie})).status,404);
    assert.equal((await req('/api/public/customer/site-a/panel/quote',{method:'POST',cookie,body:{serviceId:service.json.id}})).status,404);
    assert.equal((await req('/api/public/customer/site-a/panel/orders',{method:'POST',cookie,body:{
      serviceId:service.json.id,inputs:{},idempotencyKey:randomUUID(),expectedPriceUsdUnits:service.json.priceUsdUnits,expectedPriceAccountUnits:service.json.priceUsdUnits,
    }})).status,404);
    assert.deepEqual((await req('/api/public/customer/site-a/panel',{cookie})).json.financial,walletBefore);
  });
}
