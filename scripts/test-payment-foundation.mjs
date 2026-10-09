// Test-only adapter is compiled into a disposable server. It is NEVER registered
// in the application registry, shipped bundle, Preview or production.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
export const PAYMENT_FIXTURE_CODE='fixture_payments';
export function paymentTestPlugin(){
  return {name:'ephemeral-payment-adapter',setup(builder){
    builder.onLoad({filter:/\/payments\/registry\.ts$/},async({path})=>{
      let source=await readFile(path,'utf8');
      const anchor="  planned('paypal','PayPal'),";
      assert.ok(source.includes(anchor));
      source=`import {createHmac,timingSafeEqual} from 'node:crypto';\n`+source.replace(anchor,`  {
        code:'fixture_payments',displayName:'Ephemeral Test Adapter',description:'Isolated focused-test fixture only.',
        integrationStatus:'AVAILABLE',version:'test-only',supportedCurrencies:['USD','DZD','EUR'],supportedMethods:['card'],
        feesSupported:true,automaticConfirmationSupported:true,webhookSupported:true,configurationFields:[],configurationSchema:GATEWAY_CONFIGURATION_SCHEMA,
        requiredCredentials:[{key:'secret',label:'Test secret',secret:true,required:true},{key:'merchant',label:'Test merchant',secret:false,required:true}],
        adapter:{
          async merchantScope(c){return c.merchant;},
          async validateCredentials(c){return !!c.secret&&c.secret.length>20&&!!c.merchant;},
          async verifyCallback(raw,headers,c){
            const expected=createHmac('sha256',c.secret).update(raw).digest(),supplied=Buffer.from(headers['x-test-signature']||'','hex');
            if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))throw Error('Test signature rejected');
            const receipt=JSON.parse(raw.toString('utf8'));if(receipt.merchantScope!==c.merchant)throw Error('Test merchant rejected');return receipt;
          }
        }
      },\n`+anchor);
      return {contents:source,loader:'ts'};
    });
  }};
}
export async function testPaymentFoundation({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,api}){
  const code=PAYMENT_FIXTURE_CODE,headers={'X-BHRU-Auth':'admin'},secret='disposable-test-secret-not-a-real-provider-key';
  const adminId=randomUUID(),adminHash=await api.hashPassword(password);
  await pool.query("INSERT INTO platform_admin_users(id,email,password_hash,full_name,enabled) VALUES($1,'payments-admin@example.invalid',$2,'Payments Admin',true)",[adminId,adminHash]);
  const conn=await pool.connect();let adminCookie;
  try{adminCookie='bhru_admin_session='+await api.createSession(conn,{id:adminId,admin:true,subscriber_id:'',full_name:'Payments Admin'});}finally{conn.release();}
  const client=async(sid,suffix,currency='USD')=>{
    const id=randomUUID(),email=`payments-${suffix.toLowerCase()}@example.invalid`;
    await pool.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,client_code,username,preferred_currency)
      VALUES($1,$2,'Payment','Client',$3,$4,$5,$6,$7)`,[id,sid,email,adminHash,randomBytes(4).toString('hex').toUpperCase(),`Payments${suffix}`,currency]);
    const login=await req(`/api/public/customer/${sid===sidA?'site-a':'site-b'}/login`,{method:'POST',body:{email,password}});
    assert.equal(login.status,200,login.text);return {id,cookie:login.cookie};
  };
  const a=await client(sidA,'A'),b=await client(sidB,'B'),sameTenant=await client(sidA,'Other');
  const path='/api/public/customer/site-a/panel/funding';
  const rules=[{currency:'USD',minimum:'0.01',maximum:'100000',feeBps:125,fixedFee:'0.10'}];
  const intent={gatewayCode:code,paymentMethod:'card',amount:'10.00',paymentCurrency:'USD'};
  const mutate=(url,cookie,body,method='POST',extra={})=>req(url,{method,cookie,body,...extra});
  const body=()=>({...intent,idempotencyKey:randomUUID()});
  const receipt=(f,changes={})=>({fundingId:f.id,providerReference:'test-payment-'+randomUUID(),eventId:'test-event-'+randomUUID(),
    merchantScope:'test-merchant-a',amountMinor:f.expectedPaymentMinor,currency:f.paymentCurrency,status:'PAID',occurredAt:new Date().toISOString(),...changes});
  const proof=async(data,sid=sidA,key=secret)=>{
    const raw=Buffer.from(JSON.stringify(data));return api.verifyGatewayCallback(sid,code,raw,{'x-test-signature':createHmac('sha256',key).update(raw).digest('hex')});
  };
  let funding,verified,settlement;
  await check('payments: only Platform Admin controls gateway policies; no definition creation',async()=>{
    assert.ok([401,403].includes((await req('/api/admin/payment-gateways',{cookie:ownerCookieA,headers})).status));
    assert.ok([401,403].includes((await mutate('/api/admin/payment-gateways/paypal',ownerCookieA,{globalEnabled:true,resellerAvailable:true},'PATCH',{headers})).status));
    assert.equal((await mutate('/api/payment-gateways',ownerCookieA,{code:'invented'})).status,404);
    assert.equal((await mutate('/api/admin/payment-gateways/invented',adminCookie,{globalEnabled:true,resellerAvailable:true},'PATCH',{headers})).status,404);
    const list=await req('/api/admin/payment-gateways',{cookie:adminCookie,headers});assert.equal(list.status,200,list.text);
    assert.ok(list.json.data.filter(g=>g.code!==code).every(g=>g.integrationStatus==='NOT_IMPLEMENTED'&&!g.operational));
    const changed=await mutate('/api/admin/payment-gateways/paypal',adminCookie,{globalEnabled:true,resellerAvailable:true},'PATCH',{headers});
    assert.equal(changed.status,200,changed.text);assert.equal(changed.json.operational,false);
    assert.equal((await mutate('/api/admin/payment-gateways/paypal',adminCookie,{globalEnabled:true,resellerAvailable:true,integrationStatus:'AVAILABLE'},'PATCH',{headers})).status,400);
  });
  await check('payments: unimplemented gateways cannot activate, quote, fund or simulate success',async()=>{
    assert.equal((await mutate('/api/payment-gateways/paypal',ownerCookieA,{enabled:true,instructions:'',currencyRules:[]},'PUT')).status,409);
    assert.equal((await mutate(path+'/quote',a.cookie,{...intent,gatewayCode:'paypal'})).status,409);
    assert.equal((await mutate(path,a.cookie,{...body(),gatewayCode:'paypal'})).status,409);
    assert.equal((await req(path+'/gateways',{cookie:a.cookie})).json.data.length,0);
    assert.equal((await mutate('/api/payments/webhook',a.cookie,{payment_success:true})).status,404);
    assert.equal((await mutate(path+'/confirm',a.cookie,{payment_success:true})).status,404);
    assert.equal((await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance,'0');
  });
  await pool.query('INSERT INTO payment_gateway_policies(gateway_code,global_enabled,reseller_available) VALUES($1,true,true)',[code]);
  process.env.BHRU_GATEWAY_ENCRYPTION_KEY=randomBytes(32).toString('base64');
  await check('payments: per-tenant credentials encrypted, authenticated, redacted and replaceable',async()=>{
    for(const [sid,cookie,merchant] of [[sidA,ownerCookieA,'test-merchant-a'],[sidB,ownerCookieB,'test-merchant-b']]){
      const r=await mutate(`/api/payment-gateways/${code}`,cookie,{enabled:true,instructions:'Test only',currencyRules:rules,credentials:{secret,merchant}},'PUT');
      assert.equal(r.status,200,r.text);assert.ok(!r.text.includes(secret));assert.ok(!r.text.includes('ciphertext'));
      const stored=(await pool.query('SELECT credentials_encrypted FROM reseller_payment_gateways WHERE subscriber_id=$1 AND gateway_code=$2',[sid,code])).rows[0].credentials_encrypted;
      assert.ok(!JSON.stringify(stored).includes(secret));assert.equal(api.decryptCredentials(sid,code,stored).secret,secret);
      assert.throws(()=>api.decryptCredentials(sid===sidA?sidB:sidA,code,stored));
      const tampered={...stored,tag:Buffer.alloc(16).toString('base64')};assert.throws(()=>api.decryptCredentials(sid,code,tampered));
      assert.ok(!(await req('/api/payment-gateways',{cookie})).text.includes(secret));
    }
    const replaced=await mutate(`/api/payment-gateways/${code}`,ownerCookieA,{enabled:true,instructions:'Test only',currencyRules:rules,credentials:{secret}},'PUT');
    assert.equal(replaced.status,200,replaced.text);
    const stored=(await pool.query('SELECT credentials_encrypted FROM reseller_payment_gateways WHERE subscriber_id=$1 AND gateway_code=$2',[sidA,code])).rows[0].credentials_encrypted;
    assert.equal(api.decryptCredentials(sidA,code,stored).merchant,'test-merchant-a');
    for(const cookie of [ownerCookieA,ownerCookieB])assert.equal((await mutate(`/api/payment-gateways/${code}/validate`,cookie,{})).status,200);
  });
  await check('payments: eligibility requires integration, global policy, tenant activation, validation and currency',async()=>{
    const r=await req(path+'/gateways',{cookie:a.cookie});assert.equal(r.status,200,r.text);
    assert.equal(r.json.data.length,1);assert.equal(r.json.data[0].code,code);assert.equal(r.json.data[0].operational,true);assert.equal(r.json.data[0].validationStatus,'VALID');
    assert.deepEqual(r.json.data[0].configuredCredentialFields,[]);assert.ok(!r.text.includes(secret));
    const testKey=process.env.BHRU_GATEWAY_ENCRYPTION_KEY;delete process.env.BHRU_GATEWAY_ENCRYPTION_KEY;
    try{
      assert.equal((await req(path+'/gateways',{cookie:a.cookie})).json.data.length,0);
      assert.equal((await mutate(path+'/quote',a.cookie,intent)).status,503);
    }finally{process.env.BHRU_GATEWAY_ENCRYPTION_KEY=testKey;}
    await pool.query('UPDATE payment_gateway_policies SET global_enabled=false WHERE gateway_code=$1',[code]);
    assert.equal((await req(path+'/gateways',{cookie:a.cookie})).json.data.length,0);
    assert.equal((await mutate(path,a.cookie,body())).status,409);
    await pool.query('UPDATE payment_gateway_policies SET global_enabled=true WHERE gateway_code=$1',[code]);
    assert.equal((await mutate(path+'/quote',a.cookie,{...intent,paymentCurrency:'EUR'})).status,400);
    assert.equal((await mutate(path+'/quote',a.cookie,{...intent,amount:'0.001'})).status,400);
  });
  await check('payments: exact fee quotation and creation never credit wallet; request snapshots immutable',async()=>{
    const q=await mutate(path+'/quote',a.cookie,intent);assert.equal(q.status,200,q.text);
    assert.equal(q.json.paymentBaseMinor,'1000');assert.equal(q.json.feeMinor,'23');assert.equal(q.json.expectedPaymentMinor,'1023');
    assert.equal(q.json.requestedCreditUnits,'10000000000000');
    const r=await mutate(path,a.cookie,body());assert.equal(r.status,201,r.text);funding=r.json;
    assert.equal(funding.status,'CREATED');assert.equal(funding.expectedPaymentMinor,'1023');
    assert.equal((await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance,'0');
    await assert.rejects(pool.query('UPDATE payment_funding_requests SET requested_credit_units=requested_credit_units+1 WHERE id=$1',[funding.id]));
    await assert.rejects(pool.query("UPDATE payment_funding_requests SET status='PAID',paid_at=now() WHERE id=$1",[funding.id]));
  });
  await check('payments: funding creation retries/concurrency are idempotent; mismatched intent is rejected',async()=>{
    const input=body(),results=await Promise.all(Array.from({length:6},()=>mutate(path,a.cookie,input)));
    assert.ok(results.every(r=>r.status===201),JSON.stringify(results));assert.equal(new Set(results.map(r=>r.json.id)).size,1);
    assert.equal((await mutate(path,a.cookie,{...input,amount:'11.00'})).status,409);
    assert.equal((await mutate(path,a.cookie,{...body(),price:'0.01'})).status,400);
  });
  await check('payments: customer and reseller funding/payment history is strictly isolated',async()=>{
    assert.equal((await req(path+'/'+funding.id,{cookie:sameTenant.cookie})).status,404);
    assert.equal((await req('/api/public/customer/site-b/panel/funding/'+funding.id,{cookie:b.cookie})).status,404);
    assert.equal((await req('/api/funding-requests/'+funding.id,{cookie:ownerCookieB})).status,404);
    assert.equal((await req('/api/funding-requests/'+funding.id,{cookie:ownerCookieA})).status,200);
    assert.ok(!(await req('/api/funding-requests',{cookie:ownerCookieB})).json.data.some(f=>f.id===funding.id));
    assert.equal((await req(path,{cookie:sameTenant.cookie})).json.data.length,0);
  });
  await check('payments: no unsigned, invented or cross-tenant/merchant/amount/currency proof can fund wallet',async()=>{
    await assert.rejects(api.processGatewayCallback({tenant:sidA,code,data:receipt(funding),verified:true}),/trusted adapter/);
    const d=receipt(funding),raw=Buffer.from(JSON.stringify(d));
    await assert.rejects(api.verifyGatewayCallback(sidA,code,raw,{'x-test-signature':'00'}),/verification failed/);
    await assert.rejects(proof(d,sidB),/verification failed/);
    await assert.rejects(api.processGatewayCallback(await proof(receipt(funding,{amountMinor:'1'}))),/frozen funding/);
    await assert.rejects(api.processGatewayCallback(await proof(receipt(funding,{currency:'EUR'}))),/frozen funding/);
    assert.equal((await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance,'0');
    assert.equal((await pool.query('SELECT count(*)::int n FROM payment_transactions WHERE funding_request_id=$1',[funding.id])).rows[0].n,0);
  });
  await check('payments: pending callback produces no credit; trusted settlement atomically credits original account amount',async()=>{
    const pending=await proof(receipt(funding,{status:'PENDING'}));await api.processGatewayCallback(pending);
    assert.equal((await req(path+'/'+funding.id,{cookie:a.cookie})).json.status,'PENDING_PAYMENT');
    verified=await proof(receipt(funding));const id=await api.recordVerifiedPayment(verified);
    assert.equal((await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance,'0');
    settlement=await api.settleVerifiedPayment(verified,id);
    const f=await req(path+'/'+funding.id,{cookie:a.cookie});assert.equal(f.json.status,'PAID');assert.equal(f.json.payments[0].status,'SETTLED');
    assert.equal((await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance,'10000000000000');
    const l=(await pool.query('SELECT * FROM customer_wallet_ledger WHERE id=$1',[settlement.ledgerId])).rows[0];
    assert.equal(l.type,'payment_credit');assert.equal(l.created_by_type,'system');assert.equal(l.created_by_id,null);
    assert.equal(l.amount_account_units,funding.requestedCreditUnits);assert.equal(l.operation_source,'payment_gateway');
    assert.equal(l.payment_transaction_id,f.json.payments[0].id);
    assert.equal(f.json.payments[0].providerReference,null);
    const owner=await req('/api/funding-requests/'+funding.id,{cookie:ownerCookieA});assert.ok(owner.json.payments[0].providerReference);
    const activity=(await pool.query("SELECT event_type FROM client_activity_events WHERE customer_id=$1 AND event_type IN ('payment_confirmed','wallet_funded_from_payment')",[a.id])).rows;
    assert.equal(activity.length,2);
  });
  await check('payments: repeated/concurrent callback and allocation never double-credit; event conflicts rejected',async()=>{
    const results=await Promise.all(Array.from({length:8},()=>api.processGatewayCallback(verified)));
    assert.ok(results.every(r=>r.alreadySettled));
    const secondEvent=await proof({...verified.data,eventId:'different-event-'+randomUUID()});assert.equal((await api.processGatewayCallback(secondEvent)).alreadySettled,true);
    await assert.rejects(api.processGatewayCallback(await proof({...verified.data,status:'FAILED'})),/event ID/);
    assert.equal((await pool.query("SELECT count(*)::int n FROM customer_wallet_ledger WHERE customer_id=$1 AND type='payment_credit'",[a.id])).rows[0].n,1);
    const other=(await mutate(path,a.cookie,body())).json;
    await assert.rejects(api.processGatewayCallback(await proof({...verified.data,fundingId:other.id,eventId:randomUUID()})),/different evidence/);
    await assert.rejects(pool.query("UPDATE payment_transactions SET amount_minor=1 WHERE id=$1",[settlement.paymentId]),/immutable/);
  });
  await check('payments: cancelled/failed intents cannot credit; failed callback remains financially separate',async()=>{
    const c=(await mutate(path,a.cookie,body())).json;
    assert.equal((await mutate(path+'/'+c.id+'/cancel',a.cookie,{})).status,200);
    const p=await proof(receipt(c));await assert.rejects(api.processGatewayCallback(p),/review/);
    assert.equal((await pool.query("SELECT count(*)::int n FROM payment_transactions WHERE funding_request_id=$1 AND status='VERIFIED'",[c.id])).rows[0].n,1);
    const f=(await mutate(path,a.cookie,body())).json;await api.processGatewayCallback(await proof(receipt(f,{status:'FAILED'})));
    assert.equal((await req(path+'/'+f.id,{cookie:a.cookie})).json.status,'FAILED');
    assert.equal((await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance,'10000000000000');
  });
  await check('payments: account currency stays fixed, approved cross-currency fees/rates freeze exactly',async()=>{
    await pool.query(`INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,number_format,rate,decimals,enabled,client_default,is_base,rate_configured)
      VALUES($1,'DZD','Dinar','',' DZD','1,000.99',250,2,true,false,false,true),
      ($1,'EUR','Euro','',' EUR','1,000.99',0.9,2,true,false,false,true)
      ON CONFLICT(subscriber_id,code) DO UPDATE SET rate=EXCLUDED.rate,decimals=2,enabled=true,rate_configured=true`,[sidA]);
    const dzd=await client(sidA,'Dinar','DZD');
    const config={enabled:true,instructions:'',currencyRules:[...rules,{currency:'EUR',minimum:'0.01',maximum:'100000',feeBps:100,fixedFee:'1.00'}]};
    assert.equal((await mutate('/api/payment-gateways/'+code,ownerCookieA,config,'PUT')).status,200);
    const i={...intent,amount:'2500.00',paymentCurrency:'EUR'};
    const created=await mutate(path,dzd.cookie,{...i,idempotencyKey:randomUUID()});assert.equal(created.status,201,created.text);
    assert.equal(created.json.accountCurrency,'DZD');assert.equal(created.json.paymentBaseMinor,'900');
    assert.equal(created.json.feeMinor,'109');assert.equal(created.json.expectedPaymentMinor,'1009');
    await pool.query("UPDATE subscriber_currencies SET rate=280 WHERE subscriber_id=$1 AND code='DZD'",[sidA]);
    await pool.query("UPDATE subscriber_currencies SET rate=0.95 WHERE subscriber_id=$1 AND code='EUR'",[sidA]);
    const paid=await api.processGatewayCallback(await proof(receipt(created.json)));
    const ledger=(await pool.query('SELECT * FROM customer_wallet_ledger WHERE id=$1',[paid.ledgerId])).rows[0];
    assert.equal(ledger.amount_account_units,'2500000000000000');assert.equal(ledger.account_currency_snapshot.code,'DZD');
    assert.equal(ledger.amount_usd_units,null);assert.equal(ledger.account_currency_snapshot.rate,'250.000000');
    assert.equal((await pool.query('SELECT preferred_currency FROM public_customer_accounts WHERE id=$1',[dzd.id])).rows[0].preferred_currency,'DZD');
    const stored=(await pool.query('SELECT snapshot FROM payment_funding_requests WHERE id=$1',[created.json.id])).rows[0].snapshot;
    assert.equal(stored.accountRate,'250000000');assert.equal(stored.paymentRate,'900000');
  });
  await check('payments: credential replacement blocked while funding outstanding; customer request CSRF enforced',async()=>{
    assert.equal((await mutate('/api/payment-gateways/'+code,ownerCookieA,{enabled:true,instructions:'',currencyRules:rules,credentials:{secret:'another-disposable-test-secret'}},'PUT')).status,409);
    const r=await mutate(path,a.cookie,body(),'POST',{headers:{'X-BHRU-Customer-Request':''}});assert.equal(r.status,403);
    assert.equal((await mutate(`/api/clients/${sameTenant.id}/status`,ownerCookieA,{enabled:false,reason:'Focused payment test'},'PUT')).status,200);
    assert.ok([401,403].includes((await mutate(path,sameTenant.cookie,body())).status));
  });
  await check('payments: wallet/activity failure rolls allocation back but preserves receipt for exact safe retry',async()=>{
    const f=(await mutate(path,a.cookie,body())).json,p=await proof(receipt(f));
    const before=(await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance;
    await pool.query(`CREATE FUNCTION test_fail_payment_activity() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='wallet_funded_from_payment' THEN RAISE EXCEPTION 'Injected allocation audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_payment_failure BEFORE INSERT ON client_activity_events FOR EACH ROW EXECUTE FUNCTION test_fail_payment_activity();`);
    await assert.rejects(api.processGatewayCallback(p),/Injected allocation audit/);
    assert.equal((await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance,before);
    const received=(await req(path+'/'+f.id,{cookie:a.cookie})).json;assert.equal(received.status,'CREATED');assert.equal(received.payments[0].status,'VERIFIED');
    assert.equal((await pool.query("SELECT count(*)::int n FROM customer_wallet_ledger WHERE payment_transaction_id=$1",[received.payments[0].id])).rows[0].n,0);
    await pool.query('DROP TRIGGER test_payment_failure ON client_activity_events; DROP FUNCTION test_fail_payment_activity()');
    const paid=await api.processGatewayCallback(p);assert.equal(paid.alreadySettled,false);
    assert.equal((await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance,(BigInt(before)+BigInt(f.requestedCreditUnits)).toString());
    assert.equal((await api.processGatewayCallback(p)).alreadySettled,true);
  });
  await check('payments: cross-tenant receipt references and expired requests cannot allocate credit',async()=>{
    const foreign=await mutate('/api/public/customer/site-b/panel/funding',b.cookie,body());assert.equal(foreign.status,201,foreign.text);
    await assert.rejects(api.processGatewayCallback(await proof(receipt(foreign.json))),/not found/);
    const id=randomUUID();
    await pool.query(`INSERT INTO payment_funding_requests
      (id,subscriber_id,customer_id,gateway_code,gateway_name_snapshot,payment_method,status,account_currency,payment_currency,
       requested_credit_units,payment_base_minor,fee_minor,expected_payment_minor,snapshot,idempotency_key,request_hash,created_at,expires_at)
      SELECT $2,subscriber_id,customer_id,gateway_code,gateway_name_snapshot,payment_method,'EXPIRED',account_currency,payment_currency,
       requested_credit_units,payment_base_minor,fee_minor,expected_payment_minor,snapshot,$3,request_hash,now()-interval '2 hours',now()-interval '1 hour'
      FROM payment_funding_requests WHERE id=$1`,[funding.id,id,randomUUID()]);
    const expired=(await req(path+'/'+id,{cookie:a.cookie})).json;
    const before=(await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance;
    await assert.rejects(api.processGatewayCallback(await proof(receipt(expired))),/review/);
    assert.equal((await pool.query('SELECT available_balance FROM customer_wallets WHERE customer_id=$1',[a.id])).rows[0].available_balance,before);
  });
  await check('payments: new inline funding script compiles and wallet document includes exact CSP hash',async()=>{
    new Script(api.PAYMENT_SCRIPT);assert.equal(createHash('sha256').update(api.PAYMENT_SCRIPT).digest('base64'),api.paymentScriptHash);
    const page=await req('/site-a/customer/wallet',{cookie:a.cookie});assert.equal(page.status,200,page.text);
    assert.ok(page.text.includes('data-funding data-api='));assert.ok(page.headers['content-security-policy'].includes('sha256-'+api.paymentScriptHash));
  });
}
