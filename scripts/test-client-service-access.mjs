import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function testClientServiceAccess({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,newClient}){
 const sql=async(query,args=[])=>(await pool.query(query,args)).rows;
 const one=async(query,args=[])=>(await sql(query,args))[0];
 const send=(path,body,method='POST',cookie=ownerCookieA)=>req(path,{body,method,cookie});
 const get=(path,cookie=ownerCookieA)=>req(path.replaceAll(' ','%20'),{cookie});
 const customer=randomUUID();
 await pool.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,client_code,username,preferred_currency)
  VALUES($1,$2,'Access','Client','access-client@example.invalid',$3,'ACCESS01','AccessClient','USD')`,[customer,sidA,newClient.password_hash]);
 assert.equal((await one(`SELECT g.is_default FROM public_customer_accounts c JOIN reseller_client_groups g
  ON g.subscriber_id=c.subscriber_id AND g.id=c.client_group_id WHERE c.id=$1`,[customer])).is_default,true);
 const logged=await send('/api/public/customer/site-a/login',{email:'access-client@example.invalid',password},'POST','');
 assert.equal(logged.status,200,logged.text);
 const cookie=logged.cookie,url='/api/public/customer/site-a/panel';
 const group=(await send('/api/client-groups',{name:'Access group'})).json;
 assert.equal((await send(`/api/clients/${customer}/group`,{groupId:group.id},'PUT')).status,200);
 const category=(await send('/api/service-groups',{name:'Access category'})).json;
 const otherCategory=(await send('/api/service-groups',{name:'Access hidden category'})).json;
 const policy=(target,effect,type='SERVICE',individual=false,subject=individual?customer:group.id,who=ownerCookieA)=>
  send(`/api/${individual?'clients':'client-groups'}/${subject}/access`,{targetType:type,targetIds:Array.isArray(target)?target:[target],effect},'POST',who);
 const create=async(name,groupId=category.id,priceUsd='10')=>{
  const r=await send('/api/manual-services',{name,groupId,priceUsd,description:name+' PRIVATE INPUT CONFIG',serviceType:'imei',requirements:[],active:true,displayOrder:0});
  assert.equal(r.status,201,r.text);return r.json;
 };
 const a=await create('Access premium'),b=await create('Access basic'),hidden=await create('Access hidden',otherCategory.id);
 const quote=s=>send(url+'/quote',{serviceId:s.id},'POST',cookie);
 const preview=s=>get(`/api/clients/${customer}/access/${s.id}`);
 const order=(s,q,key=randomUUID())=>send(url+'/orders',{serviceId:s.id,inputs:{},idempotencyKey:key,expectedPriceUsdUnits:q.priceUsdUnits,
  expectedPriceAccountUnits:q.priceAccountUnits},'POST',cookie);
 const snapshot=async()=>({
  wallet:await one('SELECT * FROM customer_wallets WHERE customer_id=$1',[customer]),
  orders:await sql('SELECT * FROM service_orders WHERE customer_id=$1 ORDER BY id',[customer]),
  ledger:await sql('SELECT * FROM customer_wallet_ledger WHERE customer_id=$1 ORDER BY id',[customer]),
  events:await sql("SELECT * FROM client_activity_events WHERE customer_id=$1 AND event_category IN('FINANCIAL','ORDER') ORDER BY id",[customer]),
 });
 const protectedTables=['reseller_payment_gateways','payment_funding_requests','payment_transactions','payment_gateway_events','payment_initiations','payment_processing_jobs','store_orders'];
 const preserved=()=>Promise.all(protectedTables.map(async t=>(await one(`SELECT md5(coalesce(string_agg(to_jsonb(r)::text,',' ORDER BY to_jsonb(r)::text),'')) digest FROM ${t} r`)).digest));
 const protectedBefore=await preserved();
 const oldSessions=await sql('SELECT * FROM public_customer_sessions WHERE customer_id<>$1 ORDER BY token_hash',[customer]);
 const oldLogins=await sql('SELECT * FROM customer_login_history ORDER BY id');
 let accepted,qBefore,charged;
 await check('access: no policies preserve existing availability and new customer default membership',async()=>{
  assert.ok((await one('SELECT client_group_id FROM public_customer_accounts WHERE id=$1',[customer])).client_group_id);
  const p=await preview(a);assert.equal(p.status,200,p.text);assert.deepEqual(p.json,{allowed:true,reasonCode:'ALLOWED_BY_DEFAULT',source:'DEFAULT',matchedPolicyId:null});
  const list=await get(url+'/services?search=Access',cookie);assert.equal(list.status,200,list.text);
  assert.ok(list.json.data.some(s=>s.id===a.id));assert.equal((await quote(a)).status,200);
 });
 await check('access: group service ALLOW/DENY and inherited reset are authoritative',async()=>{
  assert.equal((await policy(a.id,'DENY')).status,200);assert.equal((await preview(a)).json.source,'GROUP_SERVICE');
  assert.equal((await quote(a)).status,404);
  assert.equal((await policy(a.id,'ALLOW')).status,200);assert.equal((await preview(a)).json.allowed,true);
  assert.equal((await policy(a.id,'INHERIT')).status,200);assert.equal((await preview(a)).json.source,'DEFAULT');
 });
 await check('access: customer ALLOW overrides group DENY; customer DENY overrides group ALLOW',async()=>{
  await policy(a.id,'DENY');await policy(a.id,'ALLOW','SERVICE',true);
  let p=await preview(a);assert.equal(p.json.allowed,true);assert.equal(p.json.source,'CUSTOMER_SERVICE');
  await policy(a.id,'ALLOW');await policy(a.id,'DENY','SERVICE',true);
  p=await preview(a);assert.equal(p.json.allowed,false);assert.equal(p.json.reasonCode,'DENIED_BY_CUSTOMER');
  await policy(a.id,'INHERIT','SERVICE',true);await policy(a.id,'INHERIT');
 });
 await check('access: group service ALLOW overrides soft category DENY and keeps only accessible category navigation',async()=>{
  await policy(category.id,'DENY','CATEGORY');await policy(a.id,'ALLOW');
  assert.equal((await preview(a)).json.allowed,true);assert.equal((await preview(b)).json.allowed,false);
  await policy(otherCategory.id,'DENY','CATEGORY');
  const list=await get(url+'/services?search=Access',cookie);
  assert.ok(list.json.data.some(s=>s.id===a.id));assert.ok(!list.json.data.some(s=>s.id===b.id||s.id===hidden.id));
  assert.ok(list.json.groups.some(c=>c.id===category.id));assert.ok(!list.json.groups.some(c=>c.id===otherCategory.id));
 });
 await check('access: customer category DENY outranks group service ALLOW; own service ALLOW overrides own category DENY',async()=>{
  await policy(category.id,'DENY','CATEGORY',true);
  let p=await preview(a);assert.equal(p.json.allowed,false);assert.equal(p.json.source,'CUSTOMER_CATEGORY');
  await policy(a.id,'ALLOW','SERVICE',true);p=await preview(a);assert.equal(p.json.allowed,true);assert.equal(p.json.source,'CUSTOMER_SERVICE');
  await policy(category.id,'INHERIT','CATEGORY',true);await policy(a.id,'INHERIT','SERVICE',true);
 });
 await check('access: globally disabled service cannot be overridden by explicit customer ALLOW',async()=>{
  await policy(a.id,'ALLOW','SERVICE',true);
  const r=await send('/api/manual-services/'+a.id,{name:a.name,description:a.description,priceUsd:'10',serviceType:'imei',groupId:category.id,requirements:[],displayOrder:0,active:false},'PATCH');assert.equal(r.status,200,r.text);
  const p=await preview(a);assert.equal(p.json.allowed,false);assert.equal(p.json.reasonCode,'DENIED_GLOBAL_SERVICE');
  assert.equal((await quote(a)).status,404);assert.equal((await get(url+'/services/'+a.id,cookie)).status,404);
  await send('/api/manual-services/'+a.id,{name:a.name,priceUsd:'10',serviceType:'imei',groupId:category.id,requirements:[],displayOrder:0,active:true},'PATCH');
 });
 await check('access: globally disabled category cannot be overridden; disabled category never appears',async()=>{
  await send('/api/service-groups/'+category.id,{enabled:false},'PATCH');
  const p=await preview(a);assert.equal(p.json.allowed,false);assert.equal(p.json.reasonCode,'DENIED_GLOBAL_CATEGORY');
  const list=await get(url+'/services?search=Access',cookie);assert.ok(!list.json.groups.some(c=>c.id===category.id));
  assert.equal((await quote(a)).status,404);
  await send('/api/service-groups/'+category.id,{enabled:true},'PATCH');await policy(a.id,'INHERIT','SERVICE',true);
 });
 await check('access: inactive group policies are ignored; explicit customer rules still apply',async()=>{
  await send('/api/client-groups/'+group.id,{name:group.name,active:false},'PATCH');
  assert.equal((await preview(b)).json.allowed,true);assert.equal((await preview(b)).json.source,'DEFAULT');
  await policy(b.id,'DENY','SERVICE',true);assert.equal((await preview(b)).json.allowed,false);
  await policy(b.id,'INHERIT','SERVICE',true);
  assert.equal((await one('SELECT client_group_id FROM public_customer_accounts WHERE id=$1',[customer])).client_group_id,group.id);
  await send('/api/client-groups/'+group.id,{name:group.name,active:true},'PATCH');
 });
 await check('access: hidden metadata, pricing, search and direct details/quotes are non-enumerating',async()=>{
  const list=await get(url+'/services?search=Access basic',cookie);assert.equal(list.json.data.length,0);
  assert.ok(!JSON.stringify(list.json).includes(b.name));
  for(const response of [await get(url+'/services/'+b.id,cookie),await quote(b)]){
   assert.equal(response.status,404);assert.deepEqual(response.json,{error:'Service not found or unavailable.'});
   assert.ok(!response.text.includes('price')&&!response.text.includes('PRIVATE'));
  }
 });
 await check('access: authorization precedes pagination and hasMore counts',async()=>{
  const denied=[];for(let i=0;i<33;i++)denied.push((await create('Access page '+String(i).padStart(2,'0'),otherCategory.id)).id);
  await policy(denied,'DENY');
  const visible=await create('Access page visible',category.id);await policy(visible.id,'ALLOW');
  const list=await get(url+'/services?search=Access page',cookie);assert.equal(list.json.data.length,1);assert.equal(list.json.data[0].id,visible.id);assert.equal(list.json.hasMore,false);
  const second=await get(url+'/services?search=Access page&page=2',cookie);assert.equal(second.json.data.length,0);assert.equal(second.json.hasMore,false);
 });
 await check('access: denied direct order creates no order, debit, ledger or financial/order activity',async()=>{
  const before=await snapshot();
  const r=await order(b,{priceUsdUnits:'10000000000000',priceAccountUnits:'10000000000000'});assert.equal(r.status,404,r.text);
  assert.deepEqual(await snapshot(),before);
 });
 await check('access: blocked customer eligibility cannot be overridden and creates no charge',async()=>{
  await policy(a.id,'ALLOW','SERVICE',true);
  await pool.query('UPDATE public_customer_accounts SET enabled=false WHERE id=$1',[customer]);
  const before=await snapshot(),p=await preview(a);assert.equal(p.json.allowed,false);assert.equal(p.json.reasonCode,'DENIED_EXISTING_ELIGIBILITY');
  assert.ok([401,403].includes((await quote(a)).status));
  assert.ok([401,403].includes((await order(a,{priceUsdUnits:'10000000000000',priceAccountUnits:'10000000000000'})).status));
  assert.deepEqual(await snapshot(),before);
  await pool.query('UPDATE public_customer_accounts SET enabled=true WHERE id=$1',[customer]);await policy(a.id,'INHERIT','SERVICE',true);
 });
 await check('access: policy revocation after a quote prevents a new charge',async()=>{
  qBefore=(await quote(a)).json;await policy(a.id,'DENY','SERVICE',true);
  const before=await snapshot();assert.equal((await order(a,qBefore)).status,404);assert.deepEqual(await snapshot(),before);
  await policy(a.id,'INHERIT','SERVICE',true);
 });
 await check('access: permitted order preserves Slice 6A pricing, exact debit, source snapshot and idempotency',async()=>{
  assert.equal((await send(`/api/clients/${customer}/pricing/${a.id}`,{method:'FIXED_PRICE',value:'8'},'PUT')).status,200);
  const funded=await send(`/api/clients/${customer}/wallet`,{operation:'add',direction:'credit',amount:'100',reason:'Verified access fixture',method:'Bank transfer',idempotencyKey:randomUUID()});assert.equal(funded.status,200,funded.text);
  const q=await quote(a);assert.equal(q.json.priceUsdUnits,'8000000000000');const before=BigInt((await snapshot()).wallet.available_balance),key=randomUUID();
  const r=await order(a,q.json,key);assert.equal(r.status,201,r.text);accepted=r.json;charged=await one('SELECT * FROM service_orders WHERE id=$1',[accepted.id]);
  assert.equal(charged.pricing_snapshot.source,'CUSTOMER');assert.equal(charged.pricing_snapshot.effectivePriceUsd,'8');
  assert.equal(BigInt((await snapshot()).wallet.available_balance),before-8000000000000n);
  await policy(a.id,'DENY','SERVICE',true);
  assert.equal((await order(a,q.json,key)).json.id,accepted.id); // Historical replay, no new placement.
  assert.equal(BigInt((await snapshot()).wallet.available_balance),before-8000000000000n);
 });
 await check('access: accepted order stays visible/unchanged after revocation and rejects with exact refund',async()=>{
  assert.equal((await get(url+'/orders/'+accepted.id,cookie)).status,200);
  assert.ok((await get(url+'/orders',cookie)).json.data.some(o=>o.id===accepted.id));
  assert.deepEqual(await one('SELECT * FROM service_orders WHERE id=$1',[accepted.id]),charged);
  const before=BigInt((await snapshot()).wallet.available_balance);
  const r=await send('/api/service-orders/'+accepted.id,{status:'rejected',reason:'Access fixture exact refund'},'PUT');assert.equal(r.status,200,r.text);
  assert.equal(BigInt((await snapshot()).wallet.available_balance),before+8000000000000n);
  await send('/api/service-orders/'+accepted.id,{status:'rejected',reason:'Access fixture exact refund'},'PUT');
  assert.equal(BigInt((await snapshot()).wallet.available_balance),before+8000000000000n);
  await policy(a.id,'INHERIT','SERVICE',true);
 });
 async function race(change){
  const q=(await quote(a)).json,before=await snapshot(),db=await pool.connect();let pending;
  try{
   await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtextextended('bhru-client-pricing:'||$1,0))",[sidA]);
   await change(db);pending=order(a,q);await new Promise(r=>setTimeout(r,30));await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  const r=await pending;assert.equal(r.status,404,r.text);assert.deepEqual(await snapshot(),before);
 }
 await check('access: policy revocation/order concurrency cannot commit a stale authorization',async()=>{
  await race(async db=>{
   await db.query("SELECT set_config('bhru.service_access_actor',$1,true)",[(await one('SELECT id FROM account_users WHERE subscriber_id=$1',[sidA])).id]);
   await db.query("INSERT INTO client_group_service_access(subscriber_id,group_id,service_id,effect) VALUES($1,$2,$3,'DENY') ON CONFLICT(subscriber_id,group_id,service_id) DO UPDATE SET effect=excluded.effect",[sidA,group.id,a.id]);
  });
  await policy(a.id,'ALLOW');
 });
 await check('access: reassignment/order concurrency uses the current stored group, not browser IDs',async()=>{
  const deniedGroup=(await send('/api/client-groups',{name:'Denied access group'})).json;await policy(a.id,'DENY','SERVICE',false,deniedGroup.id);
  await race(db=>db.query('UPDATE public_customer_accounts SET client_group_id=$2 WHERE id=$1',[customer,deniedGroup.id]));
  await send(`/api/clients/${customer}/group`,{groupId:group.id},'PUT');
 });
 await check('access: global service disable/order concurrency prevents charge',async()=>{
  await race(db=>db.query('UPDATE manual_services SET active=false WHERE subscriber_id=$1 AND id=$2',[sidA,a.id]));
  await send('/api/manual-services/'+a.id,{name:a.name,priceUsd:'10',serviceType:'imei',groupId:category.id,requirements:[],displayOrder:0,active:true},'PATCH');
 });
 await check('access: category disable/order concurrency prevents charge',async()=>{
  await race(db=>db.query('UPDATE manual_service_groups SET enabled=false WHERE subscriber_id=$1 AND id=$2',[sidA,category.id]));
  await send('/api/service-groups/'+category.id,{enabled:true},'PATCH');
 });
 await check('access: group activation/order concurrency resolves the newly applicable DENY',async()=>{
  await policy(a.id,'DENY');await send('/api/client-groups/'+group.id,{name:group.name,active:false},'PATCH');
  await race(db=>db.query('UPDATE reseller_client_groups SET is_active=true WHERE subscriber_id=$1 AND id=$2',[sidA,group.id]));
  await policy(a.id,'ALLOW');
 });
 await check('access: owner service/category lists show policies, availability, inherited group and pricing indicators',async()=>{
  const r=await get(`/api/clients/${customer}/access?search=Access premium`);assert.equal(r.status,200,r.text);
  const entry=r.json.data[0];assert.equal(entry.id,a.id);assert.equal(entry.groupPolicy.effect,'ALLOW');assert.equal(entry.hasPricingRule,true);assert.equal(r.json.currentGroup.id,group.id);
  const cats=await get(`/api/client-groups/${group.id}/access?targetType=CATEGORY`);assert.equal(cats.status,200,cats.text);
  assert.equal(cats.json.data.find(c=>c.id===category.id).policy.effect,'DENY');
  assert.equal(cats.json.data.find(c=>c.id===category.id).effective.allowed,true); // Specific ALLOW service survives.
 });
 await check('access: individual service/category audit records actor, target, previous/new effects and is immutable',async()=>{
  for(const effect of ['ALLOW','DENY','INHERIT'])assert.equal((await policy(b.id,effect,'SERVICE',true)).status,200);
  const events=await sql('SELECT * FROM client_service_access_events WHERE customer_id=$1 AND service_id=$2 ORDER BY created_at,id',[customer,b.id]);
  assert.deepEqual(events.slice(-3).map(e=>[e.action,e.previous_effect,e.new_effect]),[['created',null,'ALLOW'],['updated','ALLOW','DENY'],['removed','DENY',null]]);
  const owner=(await one('SELECT id FROM account_users WHERE subscriber_id=$1',[sidA])).id;
  for(const e of events){assert.equal(e.actor_id,owner);assert.equal(e.subscriber_id,sidA);assert.equal(e.service_id,b.id);}
  await assert.rejects(pool.query("UPDATE client_service_access_events SET new_effect='ALLOW' WHERE id=$1",[events[0].id]),/immutable/);
  await assert.rejects(pool.query('DELETE FROM client_service_access_events WHERE id=$1',[events[0].id]),/immutable/);
  const activity=await sql("SELECT * FROM client_activity_events WHERE customer_id=$1 AND event_type LIKE 'customer_service_access_%'",[customer]);
  assert.ok(activity.length>=3);for(const e of activity)assert.equal(e.actor_type,'subscriber_owner');
 });
 await check('access: group/category audit, no-op suppression and safe reset leave no redundant policy',async()=>{
  const before=(await one('SELECT count(*)::int n FROM client_service_access_events')).n;
  await policy(a.id,'ALLOW');assert.equal((await one('SELECT count(*)::int n FROM client_service_access_events')).n,before);
  await policy(category.id,'ALLOW','CATEGORY',true);await policy(category.id,'INHERIT','CATEGORY',true);
  const history=await sql('SELECT * FROM client_service_access_events WHERE customer_id=$1 AND category_id=$2',[customer,category.id]);
  assert.ok(history.some(e=>e.new_effect==='ALLOW')&&history.some(e=>e.action==='removed'));
  assert.equal((await one('SELECT count(*)::int n FROM customer_category_access WHERE customer_id=$1',[customer])).n,0);
 });
 await check('access: foreign-tenant service/category/group/customer mutations and previews are rejected',async()=>{
  const foreignGroup=(await get('/api/client-groups',ownerCookieB)).json.data[0].id;
  const foreignCustomer=(await one('SELECT id FROM public_customer_accounts WHERE subscriber_id=$1 LIMIT 1',[sidB])).id;
  const foreignService=(await send('/api/manual-services',{name:'Foreign access fixture',priceUsd:'1',serviceType:'server',active:true,requirements:[],displayOrder:0},'POST',ownerCookieB)).json;
  const foreignCategory=(await send('/api/service-groups',{name:'Foreign access category'},'POST',ownerCookieB)).json;
  for(const r of [await policy(a.id,'DENY','SERVICE',false,foreignGroup),await policy(a.id,'DENY','SERVICE',true,foreignCustomer),
   await policy(foreignService.id,'DENY'),await policy(foreignCategory.id,'ALLOW','CATEGORY'),await get(`/api/clients/${foreignCustomer}/access/${a.id}`),
   await get(`/api/clients/${customer}/access/${foreignService.id}`)])assert.equal(r.status,404,r.text);
  assert.equal((await get(url+'/services/'+foreignService.id,cookie)).status,404);
  assert.equal((await send(url+'/quote',{serviceId:foreignService.id},'POST',cookie)).status,404);
  const before=await snapshot();
  assert.equal((await order(foreignService,{priceUsdUnits:'1000000000000',priceAccountUnits:'1000000000000'})).status,404);
  assert.deepEqual(await snapshot(),before);
  const db=await pool.connect();try{
   await db.query('BEGIN');await db.query("SELECT set_config('bhru.service_access_actor',$1,true)",[(await one('SELECT id FROM account_users WHERE subscriber_id=$1',[sidA])).id]);
   await assert.rejects(db.query("INSERT INTO client_group_service_access(subscriber_id,group_id,service_id,effect) VALUES($1,$2,$3,'ALLOW')",[sidA,foreignGroup,a.id]),/foreign key/);
   await db.query('ROLLBACK');
   for(const [table,columns,values] of [
    ['customer_service_access','customer_id,service_id',[foreignCustomer,a.id]],
    ['client_group_category_access','group_id,category_id',[group.id,foreignCategory.id]],
    ['customer_category_access','customer_id,category_id',[foreignCustomer,category.id]],
   ]){
    await db.query('BEGIN');await db.query("SELECT set_config('bhru.service_access_actor',$1,true)",[(await one('SELECT id FROM account_users WHERE subscriber_id=$1',[sidA])).id]);
    await assert.rejects(db.query(`INSERT INTO ${table}(subscriber_id,${columns},effect) VALUES($1,$2,$3,'ALLOW')`,[sidA,...values]),/foreign key/);
    await db.query('ROLLBACK');
   }
  }finally{db.release();}
 });
 await check('access: customer self-escalation and forged browser group/policy flags are rejected',async()=>{
  assert.ok([401,403].includes((await policy(b.id,'ALLOW','SERVICE',true,customer,cookie)).status));
  assert.ok([401,403].includes((await get(`/api/clients/${customer}/access/${a.id}`,cookie)).status));
  const q=(await quote(a)).json;
  const r=await send(url+'/orders',{serviceId:b.id,inputs:{},idempotencyKey:randomUUID(),expectedPriceUsdUnits:q.priceUsdUnits,
   groupId:group.id,allowed:true,policyId:randomUUID()},'POST',cookie);assert.equal(r.status,400);
 });
 await check('access: bulk updates/reset are atomic, bounded, unique and independently audited',async()=>{
  const x=await create('Access bulk x'),y=await create('Access bulk y');
  assert.equal((await policy([x.id,y.id],'ALLOW')).status,200);
  assert.equal((await one('SELECT count(*)::int n FROM client_group_service_access WHERE service_id=ANY($1::uuid[])',[[x.id,y.id]])).n,2);
  assert.equal((await policy([x.id,y.id],'INHERIT')).status,200);
  assert.equal((await one('SELECT count(*)::int n FROM client_group_service_access WHERE service_id=ANY($1::uuid[])',[[x.id,y.id]])).n,0);
  const n=(await one('SELECT count(*)::int n FROM client_service_access_events')).n;
  assert.equal((await policy([x.id,randomUUID()],'DENY')).status,404);assert.equal((await one('SELECT count(*)::int n FROM client_service_access_events')).n,n);
  assert.equal((await policy([x.id,x.id],'ALLOW')).status,400);assert.equal((await policy(Array.from({length:51},()=>randomUUID()),'DENY')).status,400);
  await pool.query(`CREATE FUNCTION test_access_failure() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN IF NEW.service_id='${y.id}'::uuid THEN RAISE EXCEPTION 'Fixture late batch failure'; END IF; RETURN NEW; END $$;
   CREATE TRIGGER test_access_failure BEFORE INSERT ON client_group_service_access FOR EACH ROW EXECUTE FUNCTION test_access_failure()`);
  try{
   assert.equal((await policy([x.id,y.id],'ALLOW')).status,500);
   assert.equal((await one('SELECT count(*)::int n FROM client_group_service_access WHERE service_id=ANY($1::uuid[])',[[x.id,y.id]])).n,0);
   assert.equal((await one('SELECT count(*)::int n FROM client_service_access_events')).n,n);
  }finally{await pool.query('DROP TRIGGER test_access_failure ON client_group_service_access; DROP FUNCTION test_access_failure()');}
 });
 await check('access: one accepted transaction prevents policy revocation from overtaking commit',async()=>{
  const q=(await quote(a)).json,db=await pool.connect();let mutation;
  try{
   await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('bhru-client-pricing:'||$1,0))",[sidA]);
   assert.equal((await db.query('SELECT allowed FROM resolve_client_service_access($1,$2,NULL,$3)',[sidA,customer,a.id])).rows[0].allowed,true);
   mutation=policy(a.id,'DENY','SERVICE',true);
   let settled=false;mutation.then(()=>{settled=true;});
   await new Promise(r=>setTimeout(r,40));assert.equal(settled,false);await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  assert.equal((await mutation).status,200);assert.equal((await order(a,q)).status,404);
  await policy(a.id,'INHERIT','SERVICE',true);
 });
 await check('access: immutable DZD Account Currency, FX and refunds remain unchanged',async()=>{
  const fx=await one("SELECT * FROM public_customer_accounts WHERE email='fx-pricing@example.invalid'");
  const currency=await one("SELECT * FROM subscriber_currencies WHERE subscriber_id=$1 AND code='DZD'",[sidA]);
  const l=await send('/api/public/customer/site-a/login',{email:fx.email,password},'POST','');assert.equal(l.status,200,l.text);
  const priceService=await create('Access FX fixture');
  await send(`/api/clients/${fx.id}/pricing/${priceService.id}`,{method:'FIXED_PRICE',value:'2'},'PUT');
  await policy(priceService.id,'ALLOW','SERVICE',true,fx.id);
  const q=await send(url+'/quote',{serviceId:priceService.id},'POST',l.cookie);assert.equal(q.json.currency,'DZD');assert.equal(q.json.priceAccountUnits,'520000000000000');
  const before=(await one('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[fx.id])).available_balance;
  const ordered=await send(url+'/orders',{serviceId:priceService.id,inputs:{},idempotencyKey:randomUUID(),expectedPriceUsdUnits:q.json.priceUsdUnits,
   expectedPriceAccountUnits:q.json.priceAccountUnits},'POST',l.cookie);assert.equal(ordered.status,201,ordered.text);
  await policy(priceService.id,'DENY','SERVICE',true,fx.id);
  const rejected=await send('/api/service-orders/'+ordered.json.id,{status:'rejected',reason:'FX preserved'},'PUT');assert.equal(rejected.status,200,rejected.text);
  assert.equal((await one('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[fx.id])).available_balance,before);
  assert.deepEqual(await one("SELECT * FROM subscriber_currencies WHERE subscriber_id=$1 AND code='DZD'",[sidA]),currency);
  assert.equal((await one('SELECT preferred_currency FROM public_customer_accounts WHERE id=$1',[fx.id])).preferred_currency,'DZD');
 });
 await check('access: payment/retail records, existing login history and other original sessions remain intact',async()=>{
  const after=await preserved();
  assert.deepEqual(after,protectedBefore);
  for(const s of oldSessions){
   const now=await one('SELECT * FROM public_customer_sessions WHERE token_hash=$1',[s.token_hash]);assert.deepEqual(now,s);
  }
  for(const h of oldLogins)assert.deepEqual(await one('SELECT * FROM customer_login_history WHERE id=$1',[h.id]),h);
 });
 await check('access: retail guest quote/checkout remains successful and never uses the service wallet',async()=>{
  const before=await snapshot(),retailBefore=(await one('SELECT count(*)::int n FROM store_orders WHERE subscriber_id=$1',[sidA])).n;
  const product=await send('/api/commerce/products',{name:'Retail access isolation fixture',slug:'retail-access-fixture',short_description:'',description:'',
   category_id:null,sku:'ACCESS-RETAIL',price:'2',compare_at:null,active:true,featured:false,in_stock:true,stock_quantity:10,sort_order:0,image_ids:[]});
  assert.equal(product.status,200,product.text);
  const productId=product.json.data.id,items=[{product_id:productId,quantity:1}];
  const quote=await send('/api/public/commerce/site-a/quote',{items},'POST','');assert.equal(quote.status,200,quote.text);
  const purchase=await send('/api/public/commerce/site-a/orders',{items,checkout_key:randomUUID(),customer_name:'Retail Guest',phone:'+213555123456'},'POST','');
  assert.equal(purchase.status,201,purchase.text);
  assert.equal((await one('SELECT count(*)::int n FROM store_orders WHERE subscriber_id=$1',[sidA])).n,retailBefore+1);
  assert.deepEqual(await snapshot(),before);
 });
}
