// Provider-independent focused tests. Fixture adapter exists only in disposable esbuild output.
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {PAYMENT_FIXTURE_CODE as code} from './test-payment-foundation.mjs';
export async function testPaymentProcessing({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,api}){
  const secret='disposable-test-secret-not-a-real-provider-key',base='/api/public/customer/site-a/panel/funding';
  const hash=await api.hashPassword(password),customer=randomUUID();
  await pool.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,client_code,username,preferred_currency)
    VALUES($1,$2,'Processing','Fixture','processing@example.invalid',$3,'PROCES01','ProcessingFixture','USD')`,[customer,sidA,hash]);
  const login=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:'processing@example.invalid',password}});
  assert.equal(login.status,200,login.text);const cookie=login.cookie;
  const post=(path,body,c=cookie,extra={})=>req(path,{method:'POST',body,cookie:c,...extra});
  const input=()=>({gatewayCode:code,paymentMethod:'card',amount:'10.00',paymentCurrency:'USD',idempotencyKey:randomUUID()});
  const funding=async()=>{
    const r=await post(base,input());assert.equal(r.status,201,r.text);return r.json;
  };
  const start=async(body=input())=>{
    const r=await post(base+'/initiate',body);assert.equal(r.status,202,r.text);return r.json;
  };
  const view=id=>req(base+'/'+id,{cookie});
  const binding=(await pool.query('SELECT callback_binding FROM reseller_payment_gateways WHERE subscriber_id=$1 AND gateway_code=$2',[sidA,code])).rows[0].callback_binding;
  const callbackPath='/api/payments/webhooks/'+code+'/'+binding;
  const event=(f,extra={})=>({fundingId:f.id,providerReference:api.testProviderPayments.get(f.id)?.providerReference??'processing-'+f.id,eventId:randomUUID(),merchantScope:'test-merchant-a',
    amountMinor:f.expectedPaymentMinor,currency:f.paymentCurrency,status:'PAID',occurredAt:new Date().toISOString(),...extra});
  const deliver=(e,path=callbackPath,key=secret)=>{
    const raw=JSON.stringify(e);return post(path,e,'', {headers:{'x-test-signature':createHmac('sha256',key).update(raw).digest('hex')}});
  };
  const balance=async()=>(await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[customer])).rows[0].available_balance;
  const due=()=>pool.query("UPDATE payment_processing_jobs SET next_attempt_at=now() WHERE state='READY'");
  const job=async(id,kind='INITIATION')=>(await pool.query('SELECT * FROM payment_processing_jobs WHERE funding_request_id=$1 AND kind=$2 ORDER BY created_at LIMIT 1',[id,kind])).rows[0];
  const workers=async()=>{await api.runPaymentWorkerOnce(25);};
  let successful;
  await check('processing: globally disabled, reseller disabled, missing/invalid credentials refuse initiation',async()=>{
    await pool.query('UPDATE payment_gateway_policies SET global_enabled=false WHERE gateway_code=$1',[code]);
    assert.equal((await post(base+'/initiate',input())).status,409);
    await pool.query('UPDATE payment_gateway_policies SET global_enabled=true WHERE gateway_code=$1',[code]);
    await pool.query('UPDATE reseller_payment_gateways SET enabled=false WHERE subscriber_id=$1 AND gateway_code=$2',[sidA,code]);
    assert.equal((await post(base+'/initiate',input())).status,409);
    await pool.query("UPDATE reseller_payment_gateways SET enabled=true,validation_status='INVALID' WHERE subscriber_id=$1 AND gateway_code=$2",[sidA,code]);
    assert.equal((await post(base+'/initiate',input())).status,409);
    const stored=(await pool.query('SELECT credentials_encrypted FROM reseller_payment_gateways WHERE subscriber_id=$1 AND gateway_code=$2',[sidA,code])).rows[0].credentials_encrypted;
    await pool.query("UPDATE reseller_payment_gateways SET validation_status='VALID',credentials_encrypted=NULL WHERE subscriber_id=$1 AND gateway_code=$2",[sidA,code]);
    assert.ok([409,503].includes((await post(base+'/initiate',input())).status));
    await pool.query('UPDATE reseller_payment_gateways SET credentials_encrypted=$3 WHERE subscriber_id=$1 AND gateway_code=$2',[sidA,code,stored]);
  });
  await check('processing: exact authoritative quote, concurrent/repeated initiation has one obligation and no wallet credit',async()=>{
    const body=input(),results=await Promise.all(Array.from({length:8},()=>post(base+'/initiate',body)));
    assert.ok(results.every(r=>r.status===202),JSON.stringify(results));
    assert.equal(new Set(results.map(r=>r.json.id)).size,1);successful=results[0].json;
    assert.equal(successful.expectedPaymentMinor,'1023');assert.equal(successful.requestedCreditUnits,'10000000000000');
    assert.equal((await post(base+'/initiate',{...body,amount:'11.00'})).status,409);
    assert.equal((await post(base+'/initiate',{...input(),authoritativePrice:'0'})).status,400);
    await Promise.all([workers(),workers(),workers()]);
    assert.equal(api.testProviderCalls.get(successful.id),1,JSON.stringify(await job(successful.id)));
    const v=await view(successful.id);assert.equal(v.json.status,'PENDING_PAYMENT');assert.equal(v.json.processing.state,'READY');
    assert.match(v.json.processing.paymentUrl,/^https:\/\/payments.example.invalid/);
    assert.equal(await balance(),'0');assert.ok(!v.text.includes(secret));assert.ok(!v.text.includes('isolated fixture'));
  });
  await check('processing: customer CSRF, cross-tenant/other-customer history, owner history and admin permissions remain enforced',async()=>{
    assert.equal((await post(base+'/initiate',input(),cookie,{headers:{'X-BHRU-Customer-Request':''}})).status,403);
    assert.equal((await req('/api/funding-requests/'+successful.id,{cookie:ownerCookieB})).status,404);
    assert.equal((await req('/api/funding-requests/'+successful.id+'/reconciliation',{cookie:ownerCookieB})).status,404);
    assert.ok([401,403].includes((await req('/api/admin/payment-monitoring',{cookie:ownerCookieA,headers:{'X-BHRU-Auth':'admin'}})).status));
    const bLogin=await req('/api/public/customer/site-b/login',{method:'POST',body:{email:'payments-b@example.invalid',password}});
    assert.equal(bLogin.status,200,bLogin.text);
    assert.equal((await req('/api/public/customer/site-b/panel/funding/'+successful.id,{cookie:bLogin.cookie})).status,404);
    const other=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:'payments-a@example.invalid',password}});
    assert.equal(other.status,200,other.text);
    assert.equal((await req(base+'/'+successful.id,{cookie:other.cookie})).status,404);
    assert.equal((await req('/api/funding-requests?filter=INVENTED',{cookie:ownerCookieA})).status,400);
  });
  await check('processing: unknown/unimplemented/unsigned/oversized/future-dated callbacks and forged browser success fail closed',async()=>{
    const before=(await pool.query('SELECT count(*)::int n FROM payment_processing_jobs')).rows[0].n;
    assert.equal((await deliver(event(successful),'/api/payments/webhooks/invented/'+binding)).status,404);
    assert.equal((await deliver(event(successful),'/api/payments/webhooks/paypal/'+binding)).status,409);
    assert.equal((await deliver(event(successful),callbackPath,'invalid-signature-key')).status,400);
    assert.equal((await deliver(event(successful,{occurredAt:new Date(Date.now()+3600000).toISOString()}))).status,400);
    assert.equal((await post(callbackPath,{...event(successful),extra:'x'.repeat(270000)},'',{headers:{'x-test-signature':'00'}})).status,413);
    assert.equal((await post(base+'/confirm',{payment_success:true})).status,404);
    assert.equal((await post(callbackPath,{payment_success:true},'',{headers:{'x-test-signature':'00'}})).status,400);
    assert.equal((await pool.query('SELECT count(*)::int n FROM payment_processing_jobs')).rows[0].n,before);
  });
  await check('processing: durable authentic acknowledgement is not paid; concurrent callbacks settle exactly once',async()=>{
    const e=event(successful),results=await Promise.all(Array.from({length:6},()=>deliver(e)));
    assert.ok(results.every(r=>r.status===202),JSON.stringify(results));assert.ok(results.every(r=>!('paid' in r.json)));
    assert.equal((await view(successful.id)).json.status,'PENDING_PAYMENT');assert.equal(await balance(),'0');
    await Promise.all([workers(),workers(),workers()]);
    const v=await view(successful.id);assert.equal(v.json.status,'PAID');assert.equal(v.json.settlementStatus,'SETTLED');
    assert.equal(v.json.creditedWalletAmount,successful.formattedCredit);assert.ok(v.json.paidAt);
    assert.equal(await balance(),'10000000000000');
    assert.equal((await pool.query("SELECT count(*)::int n FROM customer_wallet_ledger WHERE customer_id=$1 AND type='payment_credit'",[customer])).rows[0].n,1);
    assert.equal((await deliver(e)).status,202);await workers();assert.equal(await balance(),'10000000000000');
  });
  await check('processing: stale pending after paid never regresses funding or expires settled money',async()=>{
    const e=event(successful,{status:'PENDING'});assert.equal((await deliver(e)).status,202);await workers();
    assert.equal((await view(successful.id)).json.status,'PAID');await api.expireFundingRequests();
    assert.equal((await view(successful.id)).json.status,'PAID');
    await assert.rejects(pool.query("UPDATE payment_funding_requests SET status='PENDING_PAYMENT',paid_at=NULL WHERE id=$1",[successful.id]));
    const r=await req('/api/funding-requests/'+successful.id+'/reconciliation',{cookie:ownerCookieA});
    assert.equal(r.json.consistent,true,r.text);
  });
  await check('processing: signed partial/overpayment/currency/merchant discrepancies are durable review, never silent credits',async()=>{
    const before=await balance();
    for(const [extra,expected] of [[{amountMinor:'1'},'AMOUNT_MISMATCH'],[{amountMinor:'9999'},'AMOUNT_MISMATCH'],
      [{currency:'EUR'},'CURRENCY_MISMATCH']]){
      const f=await funding();assert.equal((await deliver(event(f,extra))).status,202);await workers();
      const v=await view(f.id);assert.equal(v.json.reviewRequired,true);assert.deepEqual(v.json.reviewReasons,[]);
      const own=(await req('/api/funding-requests/'+f.id,{cookie:ownerCookieA})).json;assert.ok(own.reviewReasons.includes(expected));
      assert.equal(v.json.payments.length,0);
    }
    const f=await funding();
    assert.equal((await deliver(event(f,{merchantScope:'test-merchant-b'}))).status,202);await workers();
    assert.ok((await req('/api/funding-requests/'+f.id,{cookie:ownerCookieA})).json.reviewReasons.includes('MERCHANT_MISMATCH'));
    assert.equal(await balance(),before);
  });
  await check('processing: conflicting event replay and provider-reference reuse are explicit review',async()=>{
    const f=await funding(),e=event(f,{status:'PENDING'});
    assert.equal((await deliver(e)).status,202);await workers();
    assert.equal((await deliver({...e,status:'PAID'})).status,202);await workers();
    assert.equal((await view(f.id)).json.reviewRequired,true);
    const f2=await funding();
    assert.equal((await deliver(event(f2,{providerReference:api.testProviderPayments.get(successful.id).providerReference}))).status,202);await workers();
    assert.ok((await req('/api/funding-requests/'+f2.id,{cookie:ownerCookieA})).json.reviewReasons.includes('DUPLICATE_PROVIDER_REFERENCE'));
    assert.equal(await balance(),'10000000000000');
  });
  await check('processing: verified receipt survives failed wallet transaction; leased retry restores proof and posts exact credit',async()=>{
    const f=await funding();assert.equal((await deliver(event(f))).status,202);
    await pool.query(`CREATE FUNCTION test_processing_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.event_type='wallet_funded_from_payment' THEN RAISE EXCEPTION 'test allocation failure'; END IF;RETURN NEW;END $$;
      CREATE TRIGGER test_processing_failure BEFORE INSERT ON client_activity_events FOR EACH ROW EXECUTE FUNCTION test_processing_fail();`);
    await workers();
    let v=(await view(f.id)).json;assert.equal(v.status,'CREATED');assert.equal(v.settlementStatus,'VERIFIED');assert.equal(await balance(),'10000000000000');
    assert.equal((await job(f.id,'EVENT')).safe_error,'SETTLEMENT_RETRY');
    await pool.query('DROP TRIGGER test_processing_failure ON client_activity_events;DROP FUNCTION test_processing_fail()');
    await due();await Promise.all([workers(),workers()]);
    v=(await view(f.id)).json;assert.equal(v.status,'PAID');assert.equal(await balance(),'20000000000000');
  });
  await check('processing: provider timeout and lost-persistence recovery reuse stable provider creation key',async()=>{
    const f=await start();api.testProviderModes.set(f.id,'timeout-once');await workers();
    assert.equal((await job(f.id)).safe_error,'PROVIDER_TIMEOUT');assert.equal(api.testProviderPayments.has(f.id),true);
    await due();await workers();assert.equal((await view(f.id)).json.processing.state,'READY');
    assert.equal(api.testProviderCalls.get(f.id),2);
    const other=await start();
    await pool.query(`CREATE FUNCTION test_provider_persist_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.provider_reference IS NOT NULL THEN RAISE EXCEPTION 'test persistence failure'; END IF;RETURN NEW;END $$;
      CREATE TRIGGER test_provider_persist BEFORE UPDATE ON payment_initiations FOR EACH ROW EXECUTE FUNCTION test_provider_persist_fail();`);
    await workers();assert.equal((await job(other.id)).state,'READY');assert.equal(api.testProviderPayments.has(other.id),true);
    await pool.query('DROP TRIGGER test_provider_persist ON payment_initiations;DROP FUNCTION test_provider_persist_fail()');
    await due();await workers();assert.equal(api.testProviderCalls.get(other.id),2);
    assert.equal((await view(other.id)).json.processing.state,'READY');assert.equal(await balance(),'20000000000000');
  });
  await check('processing: non-idempotent ambiguous creation recovers via trusted lookup instead of creating again',async()=>{
    const f=await start();api.testPaymentCapabilities.idempotentCreation=false;api.testProviderModes.set(f.id,'timeout-once');
    try{await workers();await due();await workers();assert.equal(api.testProviderCalls.get(f.id),1);assert.equal((await view(f.id)).json.processing.state,'READY');}
    finally{api.testPaymentCapabilities.idempotentCreation=true;}
  });
  await check('processing: crashed worker leases recover; stale tokens and multiple replicas cannot duplicate creation',async()=>{
    const f=await start(),lease=await api.claimPaymentJob();assert.equal(lease.funding_request_id,f.id);
    await pool.query("UPDATE payment_processing_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[lease.id]);
    await Promise.all([workers(),workers(),workers()]);
    assert.equal(api.testProviderCalls.get(f.id),1);
    assert.equal((await pool.query('SELECT lease_token FROM payment_processing_jobs WHERE id=$1',[lease.id])).rows[0].lease_token,null);
    assert.equal((await pool.query("UPDATE payment_processing_jobs SET state='REVIEW' WHERE id=$1 AND lease_token=$2 RETURNING id",[lease.id,lease.lease_token])).rowCount,0);
  });
  await check('processing: retries are bounded; exhausted and crashed fifth attempts become visible review',async()=>{
    const f=await start();
    await pool.query("UPDATE payment_processing_jobs SET attempts=4,adapter_version=adapter_version WHERE funding_request_id=$1 AND kind='INITIATION'",[f.id]);
    api.testProviderModes.set(f.id,'timeout-once');await workers();
    assert.equal((await job(f.id)).state,'REVIEW');assert.equal((await job(f.id)).safe_error,'RETRY_EXHAUSTED');
    const f2=await start();await pool.query("UPDATE payment_processing_jobs SET attempts=4 WHERE funding_request_id=$1 AND kind='INITIATION'",[f2.id]);
    const lease=await api.claimPaymentJob();assert.equal(lease.funding_request_id,f2.id);
    await pool.query("UPDATE payment_processing_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[lease.id]);await workers();
    assert.equal((await job(f2.id)).state,'REVIEW');assert.equal((await job(f2.id)).safe_error,'RETRY_EXHAUSTED');
  });
  const oldFunding=async(status='CREATED')=>{
    const from=await funding(),id=randomUUID();
    await pool.query(`INSERT INTO payment_funding_requests
      (id,subscriber_id,customer_id,gateway_code,gateway_name_snapshot,payment_method,status,account_currency,payment_currency,
       requested_credit_units,payment_base_minor,fee_minor,expected_payment_minor,snapshot,idempotency_key,request_hash,created_at,expires_at)
      SELECT $2,subscriber_id,customer_id,gateway_code,gateway_name_snapshot,payment_method,$4,account_currency,payment_currency,
       requested_credit_units,payment_base_minor,fee_minor,expected_payment_minor,snapshot,$3,request_hash,now()-interval '2 hours',now()-interval '1 hour'
      FROM payment_funding_requests WHERE id=$1`,[from.id,id,randomUUID(),status]);
    return (await view(id)).json;
  };
  await check('processing: server expiry is idempotent; authentic late or cancelled payments persist receipt for review only',async()=>{
    const f=await oldFunding();await Promise.all([api.expireFundingRequests(),api.expireFundingRequests()]);
    assert.equal((await view(f.id)).json.status,'EXPIRED');assert.equal((await deliver(event(f))).status,202);await workers();
    let v=(await view(f.id)).json;assert.equal(v.status,'EXPIRED');assert.equal(v.reviewRequired,true);assert.equal(v.payments[0].status,'VERIFIED');
    const cancelled=await funding();assert.equal((await post(base+'/'+cancelled.id+'/cancel',{})).status,200);
    assert.equal((await deliver(event(cancelled))).status,202);await workers();v=(await view(cancelled.id)).json;
    assert.equal(v.status,'CANCELLED');assert.equal(v.reviewRequired,true);assert.equal(v.payments[0].status,'VERIFIED');
    assert.equal(await balance(),'20000000000000');
  });
  await check('processing: authenticated unknown/foreign funding is visible only in receiving tenant review queue',async()=>{
    const foreign=(await pool.query('SELECT id FROM payment_funding_requests WHERE subscriber_id=$1 LIMIT 1',[sidB])).rows[0];
    for(const id of [randomUUID(),foreign.id])assert.equal((await deliver(event(successful,{fundingId:id}))).status,202);
    await workers();
    const own=await req('/api/payment-reviews',{cookie:ownerCookieA}),other=await req('/api/payment-reviews',{cookie:ownerCookieB});
    assert.equal(own.status,200,own.text);assert.ok(own.json.data.some(j=>j.category==='UNKNOWN_FUNDING'&&j.fundingId===null));
    assert.ok(!other.json.data.some(j=>j.category==='UNKNOWN_FUNDING'));
    assert.ok([401,403].includes((await req('/api/payment-reviews',{cookie})).status));
    assert.ok(!own.text.includes(secret));assert.equal(await balance(),'20000000000000');
  });
  await check('processing: SQL snapshots, authenticated evidence and tenant scope stay immutable',async()=>{
    await assert.rejects(pool.query("UPDATE payment_processing_jobs SET payload='{}' WHERE kind='EVENT'"));
    await assert.rejects(pool.query("UPDATE payment_initiations SET provider_reference='changed' WHERE funding_request_id=$1",[successful.id]));
    await assert.rejects(pool.query(`INSERT INTO payment_processing_jobs(subscriber_id,gateway_code,funding_request_id,kind,dedup_key,adapter_version)
      VALUES($1,$2,$3,'INITIATION','foreign','test-only')`,[sidB,code,successful.id]));
    assert.equal((await req('/api/funding-requests?filter=PAID',{cookie:ownerCookieA})).json.data.every(f=>f.status==='PAID'),true);
    assert.equal((await req('/api/funding-requests?filter=REVIEW_REQUIRED',{cookie:ownerCookieA})).json.data.every(f=>f.reviewRequired),true);
  });
  await check('processing: a customer blocked after initiation cannot receive an automatic credit',async()=>{
    const f=await start();await workers();const before=await balance();
    await pool.query('UPDATE public_customer_accounts SET enabled=false WHERE id=$1',[customer]);
    try{
      assert.equal((await deliver(event(f))).status,202);await workers();
      const owner=(await req('/api/funding-requests/'+f.id,{cookie:ownerCookieA})).json;
      assert.equal(owner.status,'PENDING_PAYMENT');assert.equal(owner.settlementStatus,'REVIEW_REQUIRED');
      assert.ok(owner.reviewReasons.includes('CUSTOMER_INELIGIBLE'));assert.equal(owner.payments[0].status,'VERIFIED');
      assert.equal(await balance(),before);
    }finally{await pool.query('UPDATE public_customer_accounts SET enabled=true WHERE id=$1',[customer]);}
  });
  await check('processing: authenticated status lookup can settle through the same kernel; failed status never credits',async()=>{
    const f=await start();await workers();const p=api.testProviderPayments.get(f.id);p.paid=true;p.occurredAt=new Date().toISOString();
    await due();await workers();assert.equal((await view(f.id)).json.status,'PAID');assert.equal(await balance(),'30000000000000');
    const failed=await funding();assert.equal((await deliver(event(failed,{status:'FAILED'}))).status,202);await workers();
    assert.equal((await view(failed.id)).json.status,'FAILED');assert.equal(await balance(),'30000000000000');
  });
}
