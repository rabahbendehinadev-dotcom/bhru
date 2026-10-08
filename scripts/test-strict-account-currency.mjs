// Included in the isolated SQL/HTTP harness. Never uses a live database.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';

export async function testStrictAccountCurrency({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,register,password}) {
  const send=(path,body,cookie=ownerCookieA,method='POST')=>req(path,{method,body,cookie});
  let dinar,cookie,svc,quote,order;
  const panel='/api/public/customer/site-a/panel';
  const setDefault=async(code)=>{
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('UPDATE subscriber_currencies SET client_default=false WHERE subscriber_id=$1 AND client_default',[sidA]);
      await db.query('UPDATE subscriber_currencies SET client_default=true WHERE subscriber_id=$1 AND code=$2',[sidA,code]);
      await db.query('COMMIT');
    } catch(e) {await db.query('ROLLBACK');throw e;} finally {db.release();}
  };
  const walletPath=()=>`/api/clients/${dinar.id}/wallet`;
  const mutate=(amount,operation='add',direction='credit',currency)=>send(walletPath(),{
    amount,operation,direction,...(currency?{currency}:{}),reason:'Verified isolated test payment',method:'Cash',idempotencyKey:randomUUID()});
  await check('fresh reseller defaults to USD alone, without geographic currency inference',async()=>{
    const id=randomUUID();
    await pool.query("INSERT INTO subscribers(id,business,public_slug) VALUES($1,'Saudi fixture','fresh-reseller')",[id]);
    const rows=(await pool.query('SELECT code,enabled,client_default,registration_available FROM subscriber_currencies WHERE subscriber_id=$1',[id])).rows;
    assert.deepEqual(rows,[{code:'USD',enabled:true,client_default:true,registration_available:true}]);
  });
  await check('reseller currency choices, defaults, live flags and tenant-specific registration eligibility stay separate',async()=>{
    const body=(code,name,rate,registration_available,client_default=false)=>({code,name,rate,
      prefix:'',suffix:code,number_format:'1,000.99',enabled:true,registration_available,client_default});
    // Tenant A's DZD exists but was disabled before the new availability flag.
    let r=await send('/api/commerce/currencies',body('DZD','Dinar','260.000000',true));
    assert.equal(r.status,200,r.text);
    r=await req('/api/commerce/currencies',{cookie:ownerCookieA});
    assert.equal(r.status,200,r.text);
    assert.equal(r.json.data.currencies.find(c=>c.code==='DZD').registration_available,true);
    r=await send('/api/commerce/currencies',body('SAR','Saudi Riyal','3.750000',true),ownerCookieB);
    assert.equal(r.status,200,r.text);
    r=await send('/api/commerce/currencies',body('EUR','Euro','1.000000',false),ownerCookieB);
    assert.equal(r.status,200,r.text);
    const optionsA=await req('/api/public/customer/site-a/options');
    const optionsB=await req('/api/public/customer/site-b/options');
    assert.deepEqual(optionsA.json.currencies.map(c=>c.code),['USD','DZD','EUR']);
    assert.deepEqual(optionsB.json.currencies.map(c=>c.code),['USD','SAR']);
    assert.equal(optionsA.json.defaultCurrency,'USD');
    assert.equal(optionsB.json.defaultCurrency,'USD');
    assert.equal((await register({email:'foreign-dzd@example.invalid',preferredCurrency:'DZD'},undefined,'site-b')).status,400);
    assert.equal((await register({email:'blocked-eur@example.invalid',preferredCurrency:'EUR'},undefined,'site-b')).status,400);
    r=await send('/api/commerce/currencies',body('SAR','Saudi Riyal','3.750000',true,true),ownerCookieB);
    assert.equal(r.status,200,r.text);
    assert.equal((await req('/api/public/customer/site-b/options')).json.defaultCurrency,'SAR');
    r=await register({email:'sar-customer@example.invalid',username:'SaudiClient',preferredCurrency:'SAR'},undefined,'site-b');
    assert.equal(r.status,201,r.text);
    const sar=(await pool.query("SELECT id,preferred_currency FROM public_customer_accounts WHERE subscriber_id=$1 AND email='sar-customer@example.invalid'",[sidB])).rows[0];
    assert.equal(sar.preferred_currency,'SAR');
    // Removing SAR only from future registration is allowed for existing SAR wallets.
    r=await send('/api/commerce/currencies',body('USD','US Dollar','1.000000',true,true),ownerCookieB);
    assert.equal(r.status,200,r.text);
    r=await send('/api/commerce/currencies',body('SAR','Saudi Riyal','3.750000',false),ownerCookieB);
    assert.equal(r.status,200,r.text);
    assert.deepEqual((await req('/api/public/customer/site-b/options')).json.currencies.map(c=>c.code),['USD']);
    assert.equal((await register({email:'later-sar@example.invalid',preferredCurrency:'SAR'},undefined,'site-b')).status,400);
    assert.equal((await pool.query('SELECT accounting_currency FROM customer_wallets WHERE customer_id=$1',[sar.id])).rows[0].accounting_currency,'SAR');
    await assert.rejects(pool.query("UPDATE public_customer_accounts SET preferred_currency='USD' WHERE id=$1",[sar.id]),/immutable/);
    await assert.rejects(pool.query("INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,preferred_currency) VALUES($1,$2,'Bypass','Attempt','bypass@example.invalid','not-a-hash','SAR')",[randomUUID(),sidB]),/offered for registration/);
    const source=await readFile(new URL('../artifacts/api-server/src/lib/customer-auth/onboarding-ui.ts',import.meta.url),'utf8');
    assert.match(source,/currencySelect\.hidden = singleCurrency/);
    assert.match(source,/fixed\.hidden = !singleCurrency/);
    assert.match(source,/cannot be changed after registration/);
  });
  await check('DZD registration fixes account and wallet currency; USD registration remains USD',async()=>{
    const r=await register({email:'strict-dzd@example.invalid',username:'StrictDinar',preferredCurrency:'DZD'});
    assert.equal(r.status,201,r.text);
    const login=await send('/api/public/customer/site-a/login',{email:'strict-dzd@example.invalid',password},'');
    assert.equal(login.status,200,login.text);cookie=login.cookie;
    dinar=(await pool.query("SELECT * FROM public_customer_accounts WHERE subscriber_id=$1 AND email='strict-dzd@example.invalid'",[sidA])).rows[0];
    assert.equal(dinar.preferred_currency,'DZD');
    const wallet=(await pool.query('SELECT * FROM customer_wallets WHERE customer_id=$1',[dinar.id])).rows[0];
    assert.equal(wallet.accounting_currency,'DZD');assert.equal(wallet.available_balance,'0');
    const dashboard=await req(panel,{cookie});assert.equal(dashboard.status,200,dashboard.text);
    assert.equal(dashboard.json.financial.currency,'DZD');
    assert.equal((await req(walletPath(),{cookie:ownerCookieB})).status,404);
    const usd=await register({email:'strict-usd@example.invalid',username:'StrictDollar',preferredCurrency:'USD'});
    assert.equal(usd.status,201,usd.text);
    const saved=(await pool.query(`SELECT a.preferred_currency,w.accounting_currency FROM public_customer_accounts a
      JOIN customer_wallets w ON w.customer_id=a.id WHERE a.subscriber_id=$1 AND a.email='strict-usd@example.invalid'`,[sidA])).rows[0];
    assert.equal(saved.preferred_currency,'USD');assert.equal(saved.accounting_currency,'USD');
  });
  await check('account-currency funding, deduct and adjustments have no internal FX or selectable alternative',async()=>{
    assert.equal((await mutate('1000','add','credit','USD')).status,400);
    assert.equal((await mutate('1000','add','credit','EUR')).status,400);
    let r=await mutate('10000');assert.equal(r.status,200,r.text);
    assert.equal(r.json.financial.availableBalance,'10000000000000000');
    assert.equal(r.json.financial.accountingCurrency,'DZD');
    assert.equal(r.json.entry.amountAccountUnits,'10000000000000000');
    assert.equal(r.json.entry.amountUsdUnits,null);
    assert.match(r.json.entry.formattedAmount,/DZD/);
    r=await mutate('25','deduct','debit');assert.equal(r.status,200,r.text);
    assert.equal(r.json.financial.availableBalance,'9975000000000000');
    r=await mutate('25','adjustment','credit');assert.equal(r.status,200,r.text);
    assert.equal(r.json.financial.availableBalance,'10000000000000000');
    assert.equal((await mutate('1','adjustment','debit','USD')).status,400);
    await assert.rejects(pool.query("UPDATE customer_wallets SET accounting_currency='USD' WHERE customer_id=$1",[dinar.id]),/immutable/);
  });
  await check('service display, quote and debit use only account currency with immutable rounded account snapshot',async()=>{
    const created=await send('/api/manual-services',{name:'Strict-currency remote service',serviceType:'remote',priceUsd:'10.50',
      displayOrder:0,active:true,requirements:[]});
    assert.equal(created.status,201,created.text);svc=created.json;
    let r=await req(panel+'/services/'+svc.id,{cookie});assert.equal(r.status,200,r.text);
    assert.equal(r.json.currency,'DZD');assert.match(r.json.formattedPrice,/2,730\.00/);
    r=await send(panel+'/quote',{serviceId:svc.id},cookie);assert.equal(r.status,200,r.text);quote=r.json;
    assert.equal(quote.priceAccountUnits,'2730000000000000');assert.equal(quote.currency,'DZD');
    assert.equal((await send(panel+'/quote',{serviceId:svc.id,currency:'USD'},cookie)).status,400);
    const payload={serviceId:svc.id,inputs:{},idempotencyKey:randomUUID(),expectedPriceUsdUnits:quote.priceUsdUnits,expectedPriceAccountUnits:quote.priceAccountUnits};
    assert.equal((await send(panel+'/orders',{...payload,currency:'USD'},cookie)).status,400);
    r=await send(panel+'/orders',payload,cookie);assert.equal(r.status,201,r.text);order=r.json;
    assert.equal(order.priceAccountUnits,quote.priceAccountUnits);assert.equal(order.currency,'DZD');
    assert.equal((await send(panel+'/orders',payload,cookie)).json.id,order.id);
    assert.equal((await req(walletPath(),{cookie:ownerCookieA})).json.availableBalance,'7270000000000000');
    const debit=(await pool.query("SELECT * FROM customer_wallet_ledger WHERE reference_id=$1 AND type='order_debit'",[order.id])).rows[0];
    assert.equal(debit.amount_account_units,quote.priceAccountUnits);assert.equal(debit.account_currency_snapshot.code,'DZD');
    const saved=(await pool.query('SELECT * FROM service_orders WHERE id=$1',[order.id])).rows[0];
    assert.equal(saved.price_account_units,debit.amount_account_units);
    assert.equal(saved.account_currency_snapshot.rate,'260.000000');
    assert.equal((await req('/api/service-orders/'+order.id,{cookie:ownerCookieB})).status,404);
  });
  await check('DZD rejection refunds exact original account amount after a manual rate change',async()=>{
    await pool.query("UPDATE subscriber_currencies SET rate=300 WHERE subscriber_id=$1 AND code='DZD'",[sidA]);
    const r=await send('/api/service-orders/'+order.id,{status:'rejected',reason:'Rejected isolated test'},ownerCookieA,'PUT');
    assert.equal(r.status,200,r.text);assert.equal(r.json.amountFormatted,order.amountFormatted);
    assert.equal((await req(walletPath(),{cookie:ownerCookieA})).json.availableBalance,'10000000000000000');
    const ledger=(await pool.query("SELECT * FROM customer_wallet_ledger WHERE reference_id=$1 ORDER BY direction",[order.id])).rows;
    assert.equal(ledger.length,2);assert.equal(ledger[0].amount_account_units,ledger[1].amount_account_units);
    assert.deepEqual(ledger[0].account_currency_snapshot,ledger[1].account_currency_snapshot);
    assert.equal((await send('/api/service-orders/'+order.id,{status:'rejected',reason:'Repeat'},ownerCookieA,'PUT')).status,200);
    assert.equal((await pool.query("SELECT count(*)::int n FROM customer_wallet_ledger WHERE reference_id=$1 AND type='order_refund'",[order.id])).rows[0].n,1);
    const statement=await req(panel+'/statement',{cookie});assert.equal(statement.status,200,statement.text);
    assert.ok(statement.json.data.every(e=>e.currency==='DZD'));
    const dashboard=await req(panel,{cookie});
    assert.equal(dashboard.json.financial.totalSpent,'0');
    assert.equal(dashboard.json.financial.currency,'DZD');
    const list=await req('/api/clients?search=StrictDinar',{cookie:ownerCookieA});
    assert.equal(list.json.data[0].effectiveCurrency,'DZD');assert.match(list.json.data[0].availableBalance,/DZD/);
  });
  await check('rate changes reject stale account-currency quotes and prices round once to account minor units',async()=>{
    const stale=await send(panel+'/orders',{serviceId:svc.id,inputs:{},idempotencyKey:randomUUID(),
      expectedPriceUsdUnits:quote.priceUsdUnits,expectedPriceAccountUnits:quote.priceAccountUnits},cookie);
    assert.equal(stale.status,409,stale.text);
    await pool.query("UPDATE subscriber_currencies SET rate=260 WHERE subscriber_id=$1 AND code='DZD'",[sidA]);
    const tiny=await send('/api/manual-services',{name:'Rounded DZD price',serviceType:'remote',priceUsd:'0.333333',
      displayOrder:0,active:true,requirements:[]});
    assert.equal(tiny.status,201,tiny.text);
    const r=await send(panel+'/quote',{serviceId:tiny.json.id},cookie);
    assert.equal(r.status,200,r.text);assert.equal(r.json.priceAccountUnits,'86670000000000');
    assert.match(r.json.formattedTotal,/86\.67/);
  });
  await check('used account currencies cannot be disabled or deleted; changed defaults never migrate a wallet',async()=>{
    const body={code:'DZD',name:'Dinar',prefix:'',suffix:'DZD',number_format:'1,000.99',rate:'260.000000',enabled:false,client_default:false};
    let r=await send('/api/commerce/currencies',body);assert.equal(r.status,409,r.text);assert.match(r.json.error,/used by 1 client accounts/);
    r=await send('/api/commerce/currencies/DZD',{},ownerCookieA,'DELETE');assert.equal(r.status,409,r.text);
    await assert.rejects(pool.query("UPDATE subscriber_currencies SET enabled=false WHERE subscriber_id=$1 AND code='DZD'",[sidA]),/used by/);
    await assert.rejects(pool.query("DELETE FROM subscriber_currencies WHERE subscriber_id=$1 AND code='DZD'",[sidA]),/used by/);
    await assert.rejects(pool.query("UPDATE public_customer_accounts SET preferred_currency='USD' WHERE id=$1",[dinar.id]),/immutable/);
    await setDefault('DZD');await setDefault('USD');
    assert.equal((await req(panel,{cookie})).json.financial.currency,'DZD');
    assert.equal((await req(walletPath(),{cookie:ownerCookieA})).json.availableBalance,'10000000000000000');
    assert.equal((await send('/api/clients/'+dinar.id+'/wallet',{amount:'1',operation:'add',direction:'credit',reason:'Cross tenant',
      method:'Cash',idempotencyKey:randomUUID()},ownerCookieB)).status,404);
  });
  await check('Financial and Profile controls show read-only account currency; public service has no currency selector',async()=>{
    const financial=await readFile(new URL('../artifacts/bhru/src/pages/client-finance.tsx',import.meta.url),'utf8');
    const profile=await readFile(new URL('../artifacts/bhru/src/pages/client-detail.tsx',import.meta.url),'utf8');
    const panelSource=await readFile(new URL('../artifacts/api-server/src/lib/customer-auth/panel-ui.ts',import.meta.url),'utf8');
    assert.ok(!financial.includes('select-wallet-currency'));
    assert.ok(financial.includes('text-wallet-account-currency'));
    assert.ok(!profile.includes('select-client-currency'));
    assert.ok(profile.includes('text-client-account-currency'));
    assert.ok(!panelSource.includes('pn-currency'));
  });
  await check('existing USD order with a legacy DZD display snapshot still refunds original USD units',async()=>{
    const old=(await pool.query("SELECT * FROM service_orders WHERE reference='SO-LEGACY-CURRENCY-TEST'")).rows[0];
    assert.equal(old.account_currency_snapshot.code,'USD');
    const r=await send('/api/service-orders/'+old.id,{status:'rejected',reason:'Legacy compatibility test'},ownerCookieA,'PUT');
    assert.equal(r.status,200,r.text);assert.equal(r.json.currency,'USD');
    const wallet=(await pool.query('SELECT * FROM customer_wallets WHERE customer_id=$1',[old.customer_id])).rows[0];
    assert.equal(wallet.accounting_currency,'USD');assert.equal(wallet.available_balance,'7000000000000');
    const statement=await req(`/api/clients/${old.customer_id}/statement`,{cookie:ownerCookieA});
    assert.ok(statement.json.data.every(e=>e.currency==='USD'));
    const legacyAudit=(await pool.query("SELECT * FROM customer_wallet_ledger WHERE reference_id=$1 AND type='order_refund'",[old.id])).rows[0];
    assert.equal(legacyAudit.account_currency_snapshot.code,'USD');assert.equal(legacyAudit.currency_snapshot.code,'DZD');
    assert.equal(legacyAudit.amount_account_units,'2000000000000');
  });
}
