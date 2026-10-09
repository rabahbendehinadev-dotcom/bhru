import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function testClientActivity({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,newClient}){
  const owner=(await pool.query('SELECT id FROM account_users WHERE subscriber_id=$1',[sidA])).rows[0].id;
  const email=`audit-${randomUUID()}@example.invalid`;
  const profile={firstName:'Activity',lastName:'Client',email,username:'Audit'+randomUUID().slice(0,8),
    whatsappPhone:'+213555654321',password,confirmPassword:password,preferredLanguage:'en',preferredCurrency:'USD',
    newsletterOptIn:false,addressLine1:'',addressLine2:'',countryCode:'DZ',state:'',city:'',postalCode:'',termsAccepted:true};
  const base='/api/public/customer/site-a';
  let id,cookie;
  const events=async(category)=>req(`/api/clients/${id}/activity${category?'?category='+category:''}`,{cookie:ownerCookieA});
  const types=async()=>((await events()).json.data.map(e=>e.eventType));
  await check('registration creates one customer-attributed account event with safe request context',async()=>{
    await pool.query("UPDATE subscriber_currencies SET registration_available=true WHERE subscriber_id=$1 AND code='USD'",[sidA]);
    const c=await req(base+'/challenge',{method:'POST',body:{}});
    assert.equal(c.status,200);
    const registered=await req(base+'/register',{method:'POST',cookie:c.cookie,body:{...profile,challengeId:c.json.id,challengeAnswer:c.json.testAnswer}});
    assert.equal(registered.status,201,registered.text);
    id=(await pool.query('SELECT id FROM public_customer_accounts WHERE subscriber_id=$1 AND email=$2',[sidA,email])).rows[0].id;
    const created=(await events('ACCOUNT')).json.data;
    assert.equal(created.length,1);assert.equal(created[0].eventType,'account_created');
    assert.equal(created[0].actorType,'customer');assert.equal(created[0].actorId,id);
    assert.equal(created[0].referenceId,id);assert.equal(created[0].actorDisplay,'Activity Client');
    assert.ok(created[0].ipAddress);assert.ok(!JSON.stringify(created).includes(password));
    const login=await req(base+'/login',{method:'POST',body:{email,password}});
    assert.equal(login.status,200,login.text);cookie=login.cookie;
  });
  await check('block/unblock captures owner and optional reason, revokes sessions and ignores status retries',async()=>{
    const change=enabled=>req(`/api/clients/${id}/status`,{method:'PUT',cookie:ownerCookieA,body:{enabled,reason:'Owner review'}});
    assert.equal((await change(false)).status,200);
    assert.equal((await pool.query('SELECT count(*)::int n FROM public_customer_sessions WHERE subscriber_id=$1 AND customer_id=$2',[sidA,id])).rows[0].n,0);
    assert.equal((await change(false)).status,200);
    assert.equal((await change(true)).status,200);
    const data=(await events('ACCOUNT')).json.data;
    assert.equal(data.filter(e=>e.eventType==='account_blocked').length,1);
    assert.equal(data.filter(e=>e.eventType==='account_unblocked').length,1);
    for(const e of data.filter(e=>e.eventType!=='account_created')){
      assert.equal(e.actorType,'subscriber_owner');assert.equal(e.actorId,owner);assert.equal(e.reason,'Owner review');
    }
  });
  await check('profile update emits one changed-field-only event and unchanged retry emits none',async()=>{
    const {email,password:pw,confirmPassword,termsAccepted,...edit}=profile;
    const body={...edit,city:'Safe City'};
    const editReq=()=>req(`/api/clients/${id}`,{method:'PATCH',cookie:ownerCookieA,body});
    assert.equal((await editReq()).status,200);
    assert.equal((await editReq()).status,200);
    const data=(await events('PROFILE')).json.data;
    assert.equal(data.length,1);assert.equal(data[0].eventType,'profile_updated');
    assert.deepEqual(data[0].changedFields,['city']);
    assert.ok(!JSON.stringify(data).includes('Safe City'));
  });
  let debitOrder;
  await check('financial activity uses exact ledger reference and one event per posting, including retries',async()=>{
    const key=randomUUID(),body={operation:'add',direction:'credit',amount:'5.00',currency:'USD',
      reason:'Approved credit',internalNote:'PrivateNotForWholesaleExport',method:'Manual',idempotencyKey:key};
    const add=()=>req(`/api/clients/${id}/wallet`,{method:'POST',cookie:ownerCookieA,body});
    const r=await add();assert.equal(r.status,200,r.text);assert.equal((await add()).status,200);
    const data=(await events('FINANCIAL')).json.data;
    assert.equal(data.length,1);assert.equal(data[0].referenceType,'wallet_ledger_entry');
    assert.equal(data[0].referenceId,r.json.entry.id);assert.equal(data[0].reason,'Approved credit');
    assert.equal(data[0].actorId,owner);assert.ok(data[0].formattedAmount.includes('5.00'));
    assert.ok(!JSON.stringify(data).includes('PrivateNotForWholesaleExport'));
    const raw=(await pool.query('SELECT metadata FROM client_activity_events WHERE reference_id=$1',[r.json.entry.id])).rows[0];
    assert.deepEqual(raw.metadata,{}); // Financial truth is not copied into event JSON.
  });
  await check('order created/processing/completed/rejected events reference canonical orders and retries do not duplicate',async()=>{
    const service=await req('/api/manual-services',{method:'POST',cookie:ownerCookieA,body:{
      name:'Activity Service',serviceType:'server',priceUsd:'1.00',active:true,groupId:null,displayOrder:0,
      requirements:[],description:'',estimatedTime:'1 hour'}});
    assert.equal(service.status,201,service.text);
    const login=await req(base+'/login',{method:'POST',body:{email,password}});cookie=login.cookie;
    const purchase=async()=>{
      const body={serviceId:service.json.id,expectedPriceUsdUnits:'1000000000000',currency:'USD',inputs:{},idempotencyKey:randomUUID()};
      const r=await req(base+'/panel/orders',{method:'POST',cookie,body});
      assert.equal(r.status,201,r.text);
      const retry=await req(base+'/panel/orders',{method:'POST',cookie,body});assert.equal(retry.status,201,retry.text);
      return r.json.id;
    };
    const transition=async(order,status)=>{
      const r=await req(`/api/service-orders/${order}`,{method:'PUT',cookie:ownerCookieA,body:{
        status,result:status==='completed'?'Completed safely':'',reason:status==='rejected'?'Cannot fulfill':'',
      }});assert.equal(r.status,200,r.text);
    };
    const completed=await purchase();await transition(completed,'processing');await transition(completed,'processing');
    await transition(completed,'completed');await transition(completed,'completed');
    debitOrder=await purchase();await transition(debitOrder,'rejected');await transition(debitOrder,'rejected');
    const data=(await events('ORDER')).json.data;
    for(const [order,expected] of [[completed,['service_order_created','service_order_processing','service_order_completed']],
      [debitOrder,['service_order_created','service_order_rejected']]]){
      const actual=data.filter(e=>e.referenceId===order);
      assert.deepEqual(actual.map(e=>e.eventType).sort(),expected.sort());
      for(const e of actual){assert.equal(e.referenceType,'service_order');
        assert.equal(e.actorType,e.eventType==='service_order_created'?'customer':'subscriber_owner');}
    }
    const financial=(await events('FINANCIAL')).json.data;
    assert.equal(financial.filter(e=>e.eventType==='service_order_charged').length,2);
    assert.equal(financial.filter(e=>e.eventType==='service_order_refunded').length,1);
  });
  await check('audit failure rolls financial posting and wallet back, with no partial activity',async()=>{
    const before=(await pool.query('SELECT * FROM customer_wallets WHERE subscriber_id=$1 AND customer_id=$2',[sidA,id])).rows[0];
    const count=async()=>(await pool.query('SELECT count(*)::int n FROM client_activity_events WHERE subscriber_id=$1 AND customer_id=$2',[sidA,id])).rows[0].n;
    const n=await count();
    await pool.query(`CREATE FUNCTION fail_test_activity() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.customer_id='${id}'::uuid AND NEW.event_category='FINANCIAL' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER zz_fail_test_activity BEFORE INSERT ON client_activity_events FOR EACH ROW EXECUTE FUNCTION fail_test_activity();`);
    try{
      const failed=await req(`/api/clients/${id}/wallet`,{method:'POST',cookie:ownerCookieA,body:{
        operation:'add',direction:'credit',amount:'0.01',reason:'Test rollback',method:'Manual',idempotencyKey:randomUUID()}});
      assert.equal(failed.status,500);
      assert.deepEqual((await pool.query('SELECT * FROM customer_wallets WHERE subscriber_id=$1 AND customer_id=$2',[sidA,id])).rows[0],before);
      assert.equal(await count(),n);
    }finally{await pool.query('DROP TRIGGER zz_fail_test_activity ON client_activity_events; DROP FUNCTION fail_test_activity()');}
  });
  await check('cross-tenant read/reference and customer access denied; immutable audit and metadata allowlist enforced',async()=>{
    assert.equal((await req(`/api/clients/${id}/activity`,{cookie:ownerCookieB})).status,404);
    assert.equal((await req(`/api/clients/${id}/activity`,{cookie})).status,401);
    const insert=(reference,metadata={})=>pool.query(`INSERT INTO client_activity_events
      (subscriber_id,customer_id,event_category,event_type,actor_type,actor_id,actor_display_snapshot,reference_type,reference_id,event_key,summary,metadata)
      VALUES($1,$2,'ORDER','service_order_completed','subscriber_owner',$3,'','service_order',$4,$5,'',$6::jsonb)`,
      [sidA,id,owner,reference,randomUUID(),JSON.stringify(metadata)]);
    const foreign=(await pool.query('SELECT id FROM service_orders WHERE subscriber_id=$1 LIMIT 1',[sidB])).rows[0]?.id??randomUUID();
    await assert.rejects(insert(foreign),/Invalid order activity reference/);
    const foreignLedger=(await pool.query('SELECT id FROM customer_wallet_ledger WHERE subscriber_id=$1 LIMIT 1',[sidB])).rows[0].id;
    await assert.rejects(pool.query(`INSERT INTO client_activity_events
      (subscriber_id,customer_id,event_category,event_type,actor_type,actor_id,actor_display_snapshot,reference_type,reference_id,event_key,summary)
      VALUES($1,$2,'FINANCIAL','wallet_funds_added','subscriber_owner',$3,'','wallet_ledger_entry',$4,$5,'')`,
      [sidA,id,owner,foreignLedger,randomUUID()]),/Invalid ledger activity reference/);
    await assert.rejects(insert(debitOrder,{password:'NeverStoreThis'}),/Unsupported activity metadata/);
    await assert.rejects(pool.query('UPDATE client_activity_events SET summary=$1 WHERE subscriber_id=$2 AND customer_id=$3',['tamper',sidA,id]));
    await assert.rejects(pool.query('DELETE FROM client_activity_events WHERE subscriber_id=$1 AND customer_id=$2',[sidA,id]));
    assert.ok(!(await events()).text.includes('NeverStoreThis'));
  });
  await check('keyset pagination is stable/newest-first and category filtering is server-scoped',async()=>{
    for(let n=0;n<35;n++){
      const r=await req(`/api/clients/${id}/notes`,{method:'POST',cookie:ownerCookieA,body:{body:`Private note ${n}`}});
      assert.equal(r.status,201,r.text);
    }
    const first=await events();assert.equal(first.json.data.length,30);assert.ok(first.json.nextCursor);
    const second=await req(`/api/clients/${id}/activity?cursor=${encodeURIComponent(first.json.nextCursor)}`,{cookie:ownerCookieA});
    assert.equal(second.status,200,second.text);
    const ids=first.json.data.map(e=>e.id);
    assert.ok(second.json.data.every(e=>!ids.includes(e.id)));
    const repeated=await events();assert.deepEqual(repeated.json,first.json);
    const timestamps=[...first.json.data,...second.json.data].map(e=>Date.parse(e.createdAt));
    assert.deepEqual(timestamps,[...timestamps].sort((a,b)=>b-a));
    assert.ok((await events('FINANCIAL')).json.data.every(e=>e.eventCategory==='FINANCIAL'));
    assert.equal((await req(`/api/clients/${id}/activity?category=API`,{cookie:ownerCookieA})).status,400);
    assert.equal((await req(`/api/clients/${id}/activity?cursor=bad`,{cookie:ownerCookieA})).status,400);
    assert.ok(!(await events()).text.includes('Private note 34'));
  });
  await check('centralized logout records customer event once without storing cookie/session identifiers',async()=>{
    const body={},out=()=>req(base+'/logout',{method:'POST',cookie,body});
    assert.equal((await out()).status,200);assert.equal((await out()).status,200);
    const data=(await events('SECURITY')).json.data.filter(e=>e.eventType==='customer_logged_out');
    assert.equal(data.length,1);assert.equal(data[0].eventType,'customer_logged_out');
    assert.equal(data[0].actorId,id);assert.equal(data[0].actorType,'customer');
    assert.ok(!JSON.stringify(data).includes(cookie));
  });
}
