import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function testClientGroupsPricing({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,newClient}){
 const url='/api/public/customer/site-a/panel',id=newClient.id;
 const send=(path,body,method='POST',cookie=ownerCookieA)=>req(path,{body,method,cookie});
 const row=async(sql,args=[])=>(await pool.query(sql,args)).rows[0];
 const bal=async(customer=id)=>String((await row('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[customer])).available_balance);
 const login=await send('/api/public/customer/site-a/login',{email:newClient.email,password},'POST','');
 assert.equal(login.status,200,login.text);const cookie=login.cookie;
 const ownerGet=path=>req(path,{cookie:ownerCookieA});
 const groups=async()=>(await ownerGet('/api/client-groups')).json.data;
 const assign=groupId=>send(`/api/clients/${id}/group`,{groupId},'PUT');
 const rule=(target,service,method,value,customer=false)=>send(`/api/${customer?'clients':'client-groups'}/${target}/pricing/${service}`,{method,...(value===undefined?{}:{value})},'PUT');
 const create=async(name,priceUsd='10',active=true,groupId=null)=>{
  const r=await send('/api/manual-services',{name,priceUsd,active,serviceType:'imei',groupId,requirements:[],displayOrder:0});
  assert.equal(r.status,201,r.text);return r.json;
 };
 const quote=(service,clientCookie=cookie)=>send(url+'/quote',{serviceId:service.id},'POST',clientCookie);
 const preview=(service,customer=id)=>ownerGet(`/api/clients/${customer}/price-preview/${service.id}`);
 const purchase=(service,q,key=randomUUID(),clientCookie=cookie)=>send(url+'/orders',{
  serviceId:service.id,expectedPriceUsdUnits:q.priceUsdUnits,expectedPriceAccountUnits:q.priceAccountUnits,idempotencyKey:key,inputs:{}},'POST',clientCookie);
 let vip,standard,service,order,bodyOrder,defaultBefore;
 const protectedTables=['payment_funding_requests','payment_transactions','payment_gateway_events','payment_initiations','payment_processing_jobs','public_customer_sessions','store_orders'];
 const preserved=()=>Promise.all(protectedTables.map(async t=>(await row(`SELECT md5(coalesce(string_agg(to_jsonb(r)::text,',' ORDER BY to_jsonb(r)::text),'')) digest FROM ${t} r`)).digest));
 const stableBefore=await preserved();
 await check('pricing: one deterministic active default per existing tenant and no mandatory business group names',async()=>{
  const g=await groups();standard=g.find(g=>g.isDefault);defaultBefore=standard.id;
  assert.equal(g.filter(g=>g.isDefault&&g.active).length,1);
  assert.equal((await row('SELECT count(*)::int n FROM reseller_client_groups WHERE subscriber_id=$1 AND is_default',[sidB])).n,1);
  const r=await send('/api/client-groups',{name:'VIP',description:'Preferred clients',sortOrder:2});assert.equal(r.status,201,r.text);vip=r.json;
  assert.equal((await send('/api/client-groups',{name:'VIP'})).status,409);
  assert.equal((await send('/api/client-groups',{name:'VIP'},'POST',ownerCookieB)).status,201);
 });
 await check('pricing: future subscribers automatically get a default group',async()=>{
  const tenant=randomUUID();await pool.query('INSERT INTO subscribers(id,business,public_slug) VALUES($1,$2,$3)',[tenant,'Default fixture','default-'+tenant.slice(0,8)]);
  assert.equal((await row('SELECT count(*)::int n FROM reseller_client_groups WHERE subscriber_id=$1 AND is_default AND is_active',[tenant])).n,1);
 });
 await check('pricing: default changes retain existing assignments; default cannot be disabled/deleted',async()=>{
  const before=await row('SELECT client_group_id FROM public_customer_accounts WHERE id=$1',[id]);
  assert.equal((await send(`/api/client-groups/${vip.id}/default`,{})).status,200);
  assert.deepEqual(await row('SELECT client_group_id FROM public_customer_accounts WHERE id=$1',[id]),before);
  assert.equal((await send(`/api/client-groups/${vip.id}`,{name:'VIP',active:false},'PATCH')).status,409);
  assert.equal((await send(`/api/client-groups/${vip.id}`,{},'DELETE')).status,409);
  const c=await send('/api/public/customer/site-a/challenge',{},'POST','');
  const registration=await send('/api/public/customer/site-a/register',{firstName:'Pricing',lastName:'Registration',
   email:'pricing-register@example.invalid',password,confirmPassword:password,whatsappPhone:'+213555000001',countryCode:'DZ',preferredLanguage:'en',preferredCurrency:'USD',termsAccepted:true,
   challengeId:c.json.id,challengeAnswer:c.json.testAnswer},'POST',c.cookie);
  assert.equal(registration.status,201,registration.text);
  assert.equal((await row("SELECT client_group_id FROM public_customer_accounts WHERE email='pricing-register@example.invalid'")).client_group_id,vip.id);
  assert.equal((await send(`/api/client-groups/${standard.id}/default`,{})).status,200);
  assert.equal((await row("SELECT client_group_id FROM public_customer_accounts WHERE email='pricing-register@example.invalid'")).client_group_id,vip.id);
 });
 await check('pricing: group assignment/list filter/details and owner activity are tenant scoped',async()=>{
  assert.equal((await assign(vip.id)).status,200);
  const list=await ownerGet(`/api/clients?groupId=${vip.id}`);assert.equal(list.status,200,list.text);
  assert.ok(list.json.data.some(c=>c.id===id&&c.groupName==='VIP'));
  assert.equal((await ownerGet(`/api/clients/${id}`)).json.client.groupId,vip.id);
  const foreign=(await req('/api/client-groups',{cookie:ownerCookieB})).json.data[0].id;
  assert.equal((await assign(foreign)).status,404);
  assert.ok([401,403].includes((await send(`/api/clients/${id}/group`,{groupId:standard.id},'PUT',cookie)).status));
  const event=await row("SELECT * FROM client_activity_events WHERE customer_id=$1 AND event_type='customer_group_changed' ORDER BY created_at DESC LIMIT 1",[id]);
  assert.equal(event.actor_type,'subscriber_owner');
  assert.equal((await assign(null)).status,400);
 });
 await check('pricing: standard price fallback, service creation, base quote and preview share one calculation',async()=>{
  service=await create('Pricing fixture');
  const q=await quote(service);assert.equal(q.status,200,q.text);assert.equal(q.json.priceUsdUnits,'10000000000000');
  const p=await preview(service);assert.equal(p.json.source,'STANDARD');assert.equal(p.json.priceAccountUnits,q.json.priceAccountUnits);
 });
 await check('pricing: fixed group price then percent discount and markup are exact, noncumulative',async()=>{
  for(const [method,value,expected] of [['FIXED_PRICE','7.25','7.25'],['PERCENT_DISCOUNT','10','9'],['PERCENT_MARKUP','12.5','11.25']]){
   assert.equal((await rule(vip.id,service.id,method,value)).status,200);
   const p=await preview(service);assert.equal(p.json.effectivePriceUsd,expected);assert.equal(p.json.source,'GROUP');
   const q=await quote(service);assert.equal(q.json.priceAccountUnits,p.json.priceAccountUnits);
  }
 });
 await check('pricing: customer fixed/percentage overrides take precedence over group and inherit deletes redundant rules',async()=>{
  assert.equal((await rule(id,service.id,'FIXED_PRICE','8',true)).status,200);
  let p=await preview(service);assert.equal(p.json.effectivePriceUsd,'8');assert.equal(p.json.source,'CUSTOMER');
  assert.equal((await rule(id,service.id,'PERCENT_DISCOUNT','20',true)).status,200);
  p=await preview(service);assert.equal(p.json.effectivePriceUsd,'8'); // 20% of standard 10, not group 11.25.
  assert.equal((await rule(id,service.id,'INHERIT_DEFAULT',undefined,true)).status,200);
  assert.equal((await preview(service)).json.source,'GROUP');
  assert.equal((await row('SELECT count(*)::int n FROM customer_service_prices WHERE customer_id=$1',[id])).n,0);
  await rule(id,service.id,'FIXED_PRICE','8',true);
 });
 await check('pricing: negative/zero, invalid, unbounded percentages and unsupported methods fail',async()=>{
  for(const [method,value] of [['FIXED_PRICE','-1'],['FIXED_PRICE','0'],['FIXED_PRICE','1e3'],['PERCENT_DISCOUNT','100'],['PERCENT_DISCOUNT','-2'],['PERCENT_MARKUP','10001'],['PERCENT_DISCOUNT','1.001'],['UNKNOWN','2']])
   assert.equal((await rule(vip.id,service.id,method,value)).status,400);
 });
 await check('pricing: catalog/detail/quote show customer price without exposing other-customer rules',async()=>{
  const list=await req(url+'/services',{cookie});assert.equal(list.status,200,list.text);
  assert.equal(list.json.data.find(s=>s.id===service.id).priceUsd,'8');
  const detail=await req(url+'/services/'+service.id,{cookie});assert.equal(detail.json.priceUsd,'8');
  const q=await quote(service);assert.equal(q.json.formattedTotal,detail.json.formattedPrice);
  assert.ok(!JSON.stringify(list.json).includes('customer_rule_id'));
 });
 await check('pricing: active override cannot expose a disabled service or disabled service category',async()=>{
  const disabled=await create('Hidden pricing fixture','10',false);
  await rule(id,disabled.id,'FIXED_PRICE','1',true);
  assert.equal((await quote(disabled)).status,404);
  const g=await send('/api/service-groups',{name:'Hidden category'});
  const s=await create('Hidden category fixture','10',true,g.json.id);
  await rule(id,s.id,'FIXED_PRICE','1',true);
  assert.equal((await send(`/api/service-groups/${g.json.id}`,{enabled:false},'PATCH')).status,200);
  assert.equal((await quote(s)).status,404);
 });
 await check('pricing: wallet order uses effective price, freezes source/standard/rule/group/FX and retries once',async()=>{
  const funded=await send(`/api/clients/${id}/wallet`,{operation:'add',direction:'credit',amount:'200',reason:'Fixture verified funds',method:'Bank transfer',idempotencyKey:randomUUID()});assert.equal(funded.status,200,funded.text);
  const q=(await quote(service)).json,before=BigInt(await bal()),key=randomUUID();
  const r=await purchase(service,q,key);assert.equal(r.status,201,r.text);order=r.json;
  assert.equal(BigInt(await bal()),before-BigInt(q.priceAccountUnits));
  assert.equal((await purchase(service,q,key)).json.id,order.id);
  assert.equal(BigInt(await bal()),before-BigInt(q.priceAccountUnits));
  bodyOrder=await row('SELECT * FROM service_orders WHERE id=$1',[order.id]);
  assert.equal(bodyOrder.pricing_snapshot.standardPriceUsd,'10');assert.equal(bodyOrder.pricing_snapshot.effectivePriceUsd,'8');
  assert.equal(bodyOrder.pricing_snapshot.source,'CUSTOMER');assert.equal(bodyOrder.pricing_group_id,vip.id);
  assert.ok(bodyOrder.pricing_snapshot.ruleId);assert.equal(bodyOrder.pricing_snapshot.rate,'1.000000');
 });
 await check('pricing: future group, rule and service-price changes leave historical snapshots immutable',async()=>{
  await assign(standard.id);await rule(id,service.id,'FIXED_PRICE','6',true);
  const s=await send('/api/manual-services/'+service.id,{name:service.name,serviceType:'imei',priceUsd:'12',active:true,displayOrder:0,requirements:[]},'PATCH');assert.equal(s.status,200,s.text);
  const saved=await row('SELECT * FROM service_orders WHERE id=$1',[order.id]);assert.deepEqual(saved,bodyOrder);
  await assert.rejects(pool.query("UPDATE service_orders SET pricing_snapshot='{}' WHERE id=$1",[order.id]),/immutable/);
 });
 await check('pricing: rejection refunds exact original account charge regardless of current group/price',async()=>{
  const before=BigInt(await bal());const r=await send('/api/service-orders/'+order.id,{status:'rejected',reason:'Fixture refund'},'PUT');assert.equal(r.status,200,r.text);
  assert.equal(BigInt(await bal()),before+BigInt(bodyOrder.price_account_units));
  await send('/api/service-orders/'+order.id,{status:'rejected',reason:'Fixture refund'},'PUT');
  assert.equal(BigInt(await bal()),before+BigInt(bodyOrder.price_account_units));
 });
 await check('pricing: inactive group keeps membership, falls back to standard, but direct override survives',async()=>{
  await assign(vip.id);
  assert.equal((await send('/api/client-groups/'+vip.id,{name:'VIP',active:false},'PATCH')).status,200);
  assert.equal((await preview(service)).json.source,'CUSTOMER');
  await rule(id,service.id,'INHERIT_DEFAULT',undefined,true);
  const p=await preview(service);assert.equal(p.json.source,'STANDARD');assert.equal(p.json.groupId,vip.id);assert.equal(p.json.groupActive,false);
  assert.equal((await assign(vip.id)).status,409);
  assert.equal((await send(`/api/client-groups/${vip.id}/default`,{})).status,409);
  await send('/api/client-groups/'+vip.id,{name:'VIP',active:true},'PATCH');await rule(vip.id,service.id,'FIXED_PRICE','8');
 });
 await check('pricing: used/historical groups cannot be deleted; unused groups can be safely deleted',async()=>{
  assert.equal((await send(`/api/client-groups/${vip.id}`,{},'DELETE')).status,409);
  const g=(await send('/api/client-groups',{name:'Unused'})).json;
  assert.equal((await send('/api/client-groups/'+g.id,{},'DELETE')).status,200);
  assert.equal((await groups()).find(x=>x.id===g.id),undefined);
 });
 await check('pricing: immutable account FX applies once and rejection restores exact DZD charge',async()=>{
  await pool.query(`INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,rate,decimals,enabled,client_default,is_base,rate_configured,registration_available)
   VALUES($1,'DZD','Dinar','','DZD',260,2,true,false,false,true,true) ON CONFLICT(subscriber_id,code) DO UPDATE SET rate=260,rate_configured=true,registration_available=true,enabled=true`,[sidA]);
  const customer=randomUUID();await pool.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,client_code,username,preferred_currency,client_group_id)
   VALUES($1,$2,'FX','Pricing','fx-pricing@example.invalid',$3,'FXPRICE1','FXPricing','DZD',$4)`,[customer,sidA,newClient.password_hash,vip.id]);
  const login=await send('/api/public/customer/site-a/login',{email:'fx-pricing@example.invalid',password},'POST','');assert.equal(login.status,200,login.text);
  await rule(customer,service.id,'FIXED_PRICE','8',true);
  const funded=await send(`/api/clients/${customer}/wallet`,{operation:'add',direction:'credit',amount:'5000',reason:'Fixture DZD',method:'Bank transfer',idempotencyKey:randomUUID()});assert.equal(funded.status,200,funded.text);
  const q=await quote(service,login.cookie);assert.equal(q.status,200,q.text);assert.equal(q.json.currency,'DZD');assert.equal(q.json.priceAccountUnits,'2080000000000000');
  const p=await preview(service,customer);assert.equal(p.json.priceAccountUnits,q.json.priceAccountUnits);
  const ordered=await purchase(service,q.json,randomUUID(),login.cookie);assert.equal(ordered.status,201,ordered.text);
  assert.equal(await bal(customer),'2920000000000000');
  await rule(customer,service.id,'FIXED_PRICE','2',true);
  const rejected=await send('/api/service-orders/'+ordered.json.id,{status:'rejected',reason:'Exact FX fixture'},'PUT');assert.equal(rejected.status,200,rejected.text);
  assert.equal(await bal(customer),'5000000000000000');
 });
 await check('pricing: percentages retain fractional base units until final account-minor rounding',async()=>{
  const s=await create('Rounding boundary','0.006');
  await rule(id,s.id,'PERCENT_MARKUP','20',true);
  const p=await preview(s);assert.equal(p.json.effectivePriceUsd,'0.0072');assert.equal(p.json.priceAccountUnits,'10000000000');
 });
 await check('pricing: insufficient wallet and manipulated quoted amounts cannot debit or create an order',async()=>{
  const expensive=await create('Insufficient fixture','999999');
  const before=await bal(),count=(await row('SELECT count(*)::int n FROM service_orders WHERE customer_id=$1',[id])).n;
  assert.equal((await purchase(expensive,(await quote(expensive)).json)).status,409);
  const q=(await quote(service)).json;q.priceUsdUnits='1';q.priceAccountUnits='1';
  assert.equal((await purchase(service,q)).status,409);
  assert.equal(await bal(),before);assert.equal((await row('SELECT count(*)::int n FROM service_orders WHERE customer_id=$1',[id])).n,count);
 });
 await check('pricing: concurrent writer and order serialize; stale quote fails rather than mixing rule versions',async()=>{
  const old=(await quote(service)).json,db=await pool.connect();let pending;
  try{
   await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('bhru-client-pricing:'||$1,0))",[sidA]);
   await db.query("UPDATE client_group_service_prices SET value_units=6000000000000,updated_at=now() WHERE subscriber_id=$1 AND group_id=$2 AND service_id=$3",[sidA,vip.id,service.id]);
   pending=purchase(service,old);await new Promise(r=>setTimeout(r,30));await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  assert.equal((await pending).status,409);
  const fresh=(await quote(service)).json;assert.equal(fresh.priceUsdUnits,'6000000000000');
  const ordered=await purchase(service,fresh);assert.equal(ordered.status,201,ordered.text);
  const stored=await row('SELECT pricing_snapshot FROM service_orders WHERE id=$1',[ordered.json.id]);assert.equal(stored.pricing_snapshot.effectivePriceUsd,'6');assert.equal(stored.pricing_snapshot.standardPriceUsd,'12');
 });
 await check('pricing: tenant isolation rejects group/service/customer override and preview forgery',async()=>{
  const foreign=(await row('SELECT id FROM public_customer_accounts WHERE subscriber_id=$1 LIMIT 1',[sidB])).id;
  assert.equal((await rule(foreign,service.id,'FIXED_PRICE','1',true)).status,404);
  const s=await send('/api/manual-services',{name:'Foreign',priceUsd:'4',active:true,serviceType:'server',requirements:[],displayOrder:0},'POST',ownerCookieB);
  assert.equal((await rule(vip.id,s.json.id,'FIXED_PRICE','1')).status,404);
  assert.equal((await preview(service,foreign)).status,404);
  assert.equal((await send(`/api/client-groups/${vip.id}/pricing/${service.id}`,{method:'FIXED_PRICE',value:'1'},'PUT',ownerCookieB)).status,404);
  assert.ok([401,403].includes((await req(`/api/clients/${id}/pricing`,{cookie})).status));
  await assert.rejects(pool.query("INSERT INTO customer_service_prices(subscriber_id,customer_id,service_id,method,value_units) VALUES($1,$2,$3,'FIXED_PRICE',1)",[sidA,foreign,service.id]),/foreign key/);
 });
 await check('pricing: concurrent default changes keep exactly one default; historical-only group references prevent deletion',async()=>{
  const results=await Promise.all([send(`/api/client-groups/${vip.id}/default`,{}),send(`/api/client-groups/${standard.id}/default`,{})]);
  for(const r of results)assert.equal(r.status,200,r.text);
  assert.equal((await groups()).filter(g=>g.isDefault&&g.active).length,1);
  await send(`/api/client-groups/${standard.id}/default`,{});
  const historical=(await send('/api/client-groups',{name:'Historical only'})).json;
  await assign(historical.id);const q=await quote(service);
  const ordered=await purchase(service,q.json);assert.equal(ordered.status,201,ordered.text);
  await assign(vip.id);
  assert.equal((await groups()).find(g=>g.id===historical.id).customerCount,0);
  assert.equal((await send(`/api/client-groups/${historical.id}`,{},'DELETE')).status,409);
  const legacy=(await groups()).find(g=>g.name==='Existing membership');
  assert.equal((await send(`/api/client-groups/${legacy.id}`,{},'DELETE')).status,409);
 });
 await check('pricing: default constraint, audit attribution, counts and payment/retail/security conservation',async()=>{
  await assert.rejects(pool.query('UPDATE reseller_client_groups SET is_default=false WHERE subscriber_id=$1 AND is_default',[sidA]),/Exactly one/);
  const audit=await row("SELECT actor_type FROM client_activity_events WHERE customer_id=$1 AND event_type='customer_pricing_override_changed' LIMIT 1",[id]);assert.equal(audit.actor_type,'subscriber_owner');
  const g=(await groups()).find(g=>g.id===vip.id);assert.ok(g.customerCount>=1);assert.ok(g.pricingRuleCount>=1);
  assert.equal((await groups()).find(g=>g.isDefault).id,defaultBefore);
  // Registration/login legitimately adds sessions; existing session identities/rows remain intact.
  const stableAfter=await preserved();
  for(let i=0;i<protectedTables.length;i++)if(protectedTables[i]!=='public_customer_sessions')assert.equal(stableAfter[i],stableBefore[i]);
 });
}
