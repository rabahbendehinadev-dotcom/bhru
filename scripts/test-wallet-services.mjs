// Runs inside the onboarding harness's isolated temporary PostgreSQL cluster.
// No database URL from the operator is ever used.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testWalletServices({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,newClient}) {
  const url='/api/public/customer/site-a/panel',owner='/api',client=`${owner}/clients/${newClient.id}`;
  const send=(path,body,cookie=ownerCookieA,method='POST')=>req(path,{method,body,cookie});
  const scalar=async(sql,args=[])=>String((await pool.query(sql,args)).rows[0].value);
  const logged=await send('/api/public/customer/site-a/login',{email:newClient.email,password},'', 'POST');
  assert.equal(logged.status,200,logged.text);
  const customer=logged.cookie;
  const savedRetail=await scalar('SELECT count(*)::int value FROM store_orders WHERE subscriber_id=$1',[sidA]);
  const fund=(amount,key=randomUUID(),clientId=newClient.id,kind='add',direction='credit')=>send(`/api/clients/${clientId}/wallet`,{
    operation:kind,direction,amount,currency:'USD',reason:'Manual payment verified',method:'Bank transfer',
    transactionReference:'TEST-REF',customerNote:'Payment received',internalNote:'Temporary fixture',idempotencyKey:key,
  });
  const purchase=(serviceId,priceUsdUnits,key=randomUUID(),inputs={},currency='USD',cookie=customer)=>
    send(url+'/orders',{serviceId,expectedPriceUsdUnits:priceUsdUnits,idempotencyKey:key,inputs,currency},cookie);
  const service=(name,serviceType,priceUsd='10.00',active=true,groupId=null,requirements=[])=>
    send('/api/manual-services',{name,serviceType,priceUsd,active,groupId,displayOrder:0,requirements,description:'Manual fulfillment',estimatedTime:'1 business day'});
  const reporting=async()=>{
    const ownerSummary=(await req(client+'/wallet',{cookie:ownerCookieA})).json;
    const dashboard=(await req(url,{cookie:customer})).json.financial;
    const stmt=(await req(url+'/statement',{cookie:customer})).json;
    const detail=(await req(client,{cookie:ownerCookieA})).json;
    const list=(await req('/api/clients?search='+encodeURIComponent(newClient.email),{cookie:ownerCookieA})).json.data.find(r=>r.id===newClient.id);
    for(const summary of [dashboard,stmt.financial,detail.financial,detail.client.financial,list.financial])
      assert.deepEqual(summary,ownerSummary);
    assert.equal(list.availableBalance,ownerSummary.formattedAvailable);
    assert.equal(ownerSummary.reportingVersion,2);
    for(const field of ['due','formattedDue','creditLimit','usedCredit','availableCredit'])
      assert.ok(!(field in ownerSummary),field+' must not fabricate unsupported credit accounting');
    assert.equal(ownerSummary.accountCurrency,'USD');
    let credits=0n,debits=0n,page=1;
    while(true){
      const statement=(await req(url+'/statement?page='+page,{cookie:customer})).json;
      for(const entry of statement.data){
        assert.ok(!('internalNote' in entry)&&!('createdById' in entry));
        if(entry.direction==='credit')credits+=BigInt(entry.amountAccountUnits);
        else debits+=BigInt(entry.amountAccountUnits);
      }
      if(!statement.hasMore)break;
      page++;
    }
    assert.equal(ownerSummary.ledgerCredits,credits.toString());
    assert.equal(ownerSummary.ledgerDebits,debits.toString());
    assert.equal(ownerSummary.totalCredits,ownerSummary.ledgerCredits);
    assert.equal(ownerSummary.totalDebits,ownerSummary.ledgerDebits);
    return ownerSummary;
  };
  let group,svc;
  await check('migration 021 backfills existing accounts; new registrations initialize zero with no artificial ledger entry',async()=>{
    const accounts=(await pool.query(`SELECT a.id,w.available_balance::text b,w.locked_balance::text l
      FROM public_customer_accounts a LEFT JOIN customer_wallets w ON w.subscriber_id=a.subscriber_id AND w.customer_id=a.id
      WHERE a.subscriber_id=$1`,[sidA])).rows;
    assert.ok(accounts.length>=2);
    assert.ok(accounts.every(r=>(r.b==='0'||r.b==='5000000000000')&&r.l==='0'));
    assert.equal(await scalar('SELECT count(*)::int value FROM customer_wallet_ledger WHERE customer_id=$1',[newClient.id]),'0');
    const wallet=await req(client+'/wallet',{cookie:ownerCookieA});
    assert.equal(wallet.status,200,wallet.text);
    assert.equal(wallet.json.availableBalance,'0');assert.equal(wallet.json.lockedAmount,'0');
    assert.equal(wallet.json.ledgerAvailable,true);
    assert.equal((await req(url,{cookie:customer})).json.financial.availableBalance,'0');
  });
  await check('tenant-scoped groups and controlled IMEI/Server/File/Remote manual catalog',async()=>{
    group=await send('/api/service-groups',{name:'Activation'});assert.equal(group.status,201,group.text);
    const cg=await send('/api/client-groups',{name:'Wholesale'});assert.equal(cg.status,201,cg.text);
    assert.equal((await req('/api/service-groups',{cookie:ownerCookieB})).json.data.length,0);
    assert.equal((await send(client+'/group',{groupId:cg.json.id},ownerCookieA,'PUT')).status,200);
    assert.equal((await req(client,{cookie:ownerCookieA})).json.client.groupId,cg.json.id);
    assert.equal((await send(client+'/group',{groupId:null},ownerCookieA,'PUT')).status,200);
    const fields=[{key:'imei',label:'IMEI',type:'imei',required:true}];
    svc=await service('Activation IMEI','imei','12.34',true,group.json.id,fields);
    assert.equal(svc.status,201,svc.text);
    for(const type of ['server','file','remote']) {
      const inputs=type==='server'?[{key:'account',label:'Account',type:'text',required:true}]:
        [{key:'reference',label:'Reference',type:'reference',required:true}];
      assert.equal((await service(`Manual ${type}`,type,'10.00',true,null,inputs)).status,201);
    }
    const inactive=await service('Hidden Service','imei','1.00',false);assert.equal(inactive.status,201);
    const q=await req(url+'/services?serviceType=imei',{cookie:customer});
    assert.equal(q.status,200,q.text);
    assert.ok(q.json.data.some(r=>r.id===svc.json.id));
    assert.ok(q.json.data.every(r=>r.active&&r.serviceType==='imei'));
    assert.equal((await req(url+'/services/'+inactive.json.id,{cookie:customer})).status,404);
    assert.equal((await req('/api/manual-services?serviceType=file',{cookie:ownerCookieA})).json.data[0].serviceType,'file');
    assert.equal((await req('/api/manual-services/'+svc.json.id,{cookie:ownerCookieB})).status,404);
    assert.equal((await service('Invalid input','remote','1.00',true,null,[{key:'ref',type:'file',label:'Upload',required:true}])).status,400);
    assert.equal((await send('/api/manual-services',{name:'Bad',serviceType:'imei',priceUsd:'1.00',active:true,displayOrder:0,
      requirements:[],providerId:randomUUID()})).status,400);
  });
  await check('customer sees server-calculated price and is refused when balance is insufficient',async()=>{
    const quote=await send(url+'/quote',{serviceId:svc.json.id,currency:'USD'},customer);
    assert.equal(quote.status,200,quote.text);
    assert.equal(quote.json.priceUsdUnits,'12340000000000');
    assert.equal(quote.json.sufficient,false);
    const order=await purchase(svc.json.id,quote.json.priceUsdUnits,randomUUID(),{imei:'490154203237518'});
    assert.equal(order.status,409,order.text);
    assert.equal(order.json.code,'INSUFFICIENT_BALANCE');
    assert.equal(await scalar('SELECT count(*)::int value FROM service_orders WHERE service_id=$1',[svc.json.id]),'0');
    const broken=await purchase(svc.json.id,quote.json.priceUsdUnits,randomUUID(),{imei:'123'});
    assert.equal(broken.status,400);
  });
  let fundedKey=randomUUID(),firstKey=randomUUID(),firstOrder;
  await check('owner credits client exactly and retry cannot double-credit or silently change the action',async()=>{
    const a=await fund('50.00',fundedKey);assert.equal(a.status,200,a.text);
    assert.equal(a.json.financial.availableBalance,'50000000000000');
    assert.equal((await fund('50.00',fundedKey)).json.entry.id,a.json.entry.id);
    assert.equal((await fund('100.00',fundedKey)).status,409);
    assert.equal((await fund('60.00',randomUUID(),newClient.id,'deduct','debit')).status,409);
    const balance=await req(client+'/wallet',{cookie:ownerCookieA});
    assert.equal(balance.json.availableBalance,'50000000000000');
    const stmt=await req(client+'/statement?type=admin_credit',{cookie:ownerCookieA});
    assert.equal(stmt.json.data.length,1);
    assert.equal(stmt.json.data[0].method,'Bank transfer');assert.equal(stmt.json.data[0].createdByType,'subscriber_owner');
    const publicStmt=await req(url+'/statement',{cookie:customer});
    assert.ok(!('internalNote' in publicStmt.json.data[0])&&!('createdById' in publicStmt.json.data[0]));
  });
  await check('order placement atomically debits ledger, snapshots service price and is idempotent across retries',async()=>{
    const body={imei:'490154203237518'};
    const placed=await purchase(svc.json.id,svc.json.priceUsdUnits,firstKey,body);assert.equal(placed.status,201,placed.text);
    firstOrder=placed.json;
    assert.equal(firstOrder.status,'pending');
    assert.equal(firstOrder.priceUsdUnits,'12340000000000');
    assert.equal(firstOrder.customerInput.imei,body.imei);
    const again=await purchase(svc.json.id,svc.json.priceUsdUnits,firstKey,body);
    assert.equal(again.status,201,again.text);assert.equal(again.json.id,firstOrder.id);
    assert.equal((await purchase(svc.json.id,svc.json.priceUsdUnits,firstKey,{imei:'490154203237519'})).status,409);
    assert.equal(await scalar('SELECT count(*)::int value FROM customer_wallet_ledger WHERE reference_id=$1 AND type=$2',[firstOrder.id,'order_debit']),'1');
    assert.equal((await req(client+'/wallet',{cookie:ownerCookieA})).json.availableBalance,'37660000000000');
    assert.equal((await req('/api/service-orders/'+firstOrder.id,{cookie:ownerCookieB})).status,404);
    assert.ok((await req('/api/service-orders?customerId='+newClient.id,{cookie:ownerCookieA})).json.data.some(r=>r.id===firstOrder.id));
    assert.ok((await req(url+'/orders',{cookie:customer})).json.data.some(r=>r.id===firstOrder.id));
    assert.equal((await req(url+'/orders/'+firstOrder.id,{cookie:customer})).json.id,firstOrder.id);
    const summary=await reporting();
    assert.equal(summary.totalSpent,'0','pending charges are not completed spending');
    assert.equal(summary.netServiceCharges,'12340000000000');
  });
  await check('concurrent orders cannot double-spend the same 37.66 balance',async()=>{
    const server=(await req('/api/manual-services?serviceType=server',{cookie:ownerCookieA})).json.data[0];
    const expensive=await send('/api/manual-services/'+server.id,{name:server.name,serviceType:'server',priceUsd:'30.00',
      active:true,groupId:null,displayOrder:0,description:server.description,estimatedTime:server.estimatedTime,requirements:server.requirements},ownerCookieA,'PATCH');
    assert.equal(expensive.status,200,expensive.text);
    const [a,b]=await Promise.all([purchase(server.id,expensive.json.priceUsdUnits,randomUUID(),{account:'alpha'}),
      purchase(server.id,expensive.json.priceUsdUnits,randomUUID(),{account:'beta'})]);
    assert.deepEqual([a.status,b.status].sort(),[201,409],`${a.text}\n${b.text}`);
    const won=a.status===201?a.json:b.json;
    assert.equal((await req(client+'/wallet',{cookie:ownerCookieA})).json.availableBalance,'7660000000000');
    assert.equal(await scalar('SELECT count(*)::int value FROM customer_wallet_ledger WHERE reference_id=$1 AND type=$2',[won.id,'order_debit']),'1');
    await pool.query("UPDATE manual_services SET selling_price_usd_units=25000000000000 WHERE subscriber_id=$1 AND id=$2",[sidA,server.id]);
    assert.equal((await req(url+'/orders/'+won.id,{cookie:customer})).json.priceUsdUnits,'30000000000000');
    assert.equal((await purchase(server.id,expensive.json.priceUsdUnits,randomUUID(),{account:'gamma'})).status,409);
    const completed=await send('/api/service-orders/'+firstOrder.id,{status:'completed',result:'Successfully processed'},ownerCookieA,'PUT');
    assert.equal(completed.status,200,completed.text);
    assert.equal(completed.json.result,'Successfully processed');
    assert.equal((await req(client+'/wallet',{cookie:ownerCookieA})).json.availableBalance,'7660000000000');
    assert.equal((await send('/api/service-orders/'+firstOrder.id,{status:'rejected',reason:'Too late'},ownerCookieA,'PUT')).status,409);
    const proc=await send('/api/service-orders/'+won.id,{status:'processing'},ownerCookieA,'PUT');
    assert.equal(proc.status,200,proc.text);
    const processingSummary=await reporting();
    assert.equal(processingSummary.totalSpent,'12340000000000','only completed original order contributes');
    assert.equal(processingSummary.netServiceCharges,'42340000000000','processing charges remain net service charges');
    const denied=await send('/api/service-orders/'+won.id,{status:'processing'},ownerCookieB,'PUT');
    assert.equal(denied.status,404);
    const rejected=await send('/api/service-orders/'+won.id,{status:'rejected',reason:'Cannot fulfill'},ownerCookieA,'PUT');
    assert.equal(rejected.status,200,rejected.text);
    assert.equal((await req(client+'/wallet',{cookie:ownerCookieA})).json.availableBalance,'37660000000000');
    assert.equal((await send('/api/service-orders/'+won.id,{status:'rejected',reason:'Cannot fulfill'},ownerCookieA,'PUT')).status,200);
    assert.equal(await scalar('SELECT count(*)::int value FROM customer_wallet_ledger WHERE reference_id=$1 AND type=$2',[won.id,'order_refund']),'1');
    assert.equal((await req(client+'/wallet',{cookie:ownerCookieA})).json.totalSpent,'12340000000000');
    const summary=await reporting();
    assert.equal(summary.totalSpent,'12340000000000','rejected/refunded order contributes no completed spending');
    assert.equal(summary.netServiceCharges,'12340000000000');
    assert.equal(summary.ledgerCredits,'80000000000000','credits include the exact 30 refund, not deposits only');
  });
  await check('DB rejects direct wallet mutation and ledger edits even when owner API is bypassed',async()=>{
    await assert.rejects(pool.query('UPDATE customer_wallets SET available_balance=0 WHERE subscriber_id=$1 AND customer_id=$2',[sidA,newClient.id]),/Wallet balances change only/);
    const id=(await pool.query("SELECT id FROM customer_wallet_ledger WHERE subscriber_id=$1 AND customer_id=$2 LIMIT 1",[sidA,newClient.id])).rows[0].id;
    await assert.rejects(pool.query("DELETE FROM customer_wallet_ledger WHERE id=$1",[id]),/immutable/);
    await assert.rejects(pool.query("UPDATE customer_wallet_ledger SET description='changed' WHERE id=$1",[id]),/immutable/);
  });
  await check('USD clients cannot fund or quote in another currency; refunds keep original account charge',async()=>{
    await pool.query(`INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,rate,decimals,enabled,client_default,is_base,rate_configured)
      VALUES($1,'EUR','Euro','','EUR',2,2,true,false,false,true)`,[sidA]);
    const credit=await send(client+'/wallet',{operation:'add',direction:'credit',amount:'4.00',currency:'EUR',
      reason:'Manual EUR transfer',method:'Cash',idempotencyKey:randomUUID()});
    assert.equal(credit.status,400,credit.text);
    assert.equal((await send(client+'/wallet',{operation:'add',direction:'credit',amount:'1000',currency:'DZD',
      reason:'Wrong currency',method:'Cash',idempotencyKey:randomUUID()})).status,400);
    assert.equal((await send(url+'/quote',{serviceId:svc.json.id,currency:'EUR'},customer)).status,400);
    const valid=await fund('2.00');assert.equal(valid.status,200,valid.text);
    const quotation=await send(url+'/quote',{serviceId:svc.json.id,currency:'USD'},customer);
    assert.equal(quotation.status,200,quotation.text);
    assert.equal(quotation.json.priceUsdUnits,svc.json.priceUsdUnits);
    const o=await purchase(svc.json.id,quotation.json.priceUsdUnits,randomUUID(),{imei:'490154203237518'},'USD');
    assert.equal(o.status,201,o.text);
    const initial=(await pool.query("SELECT currency_snapshot FROM customer_wallet_ledger WHERE reference_id=$1 AND type='order_debit'",[o.json.id])).rows[0].currency_snapshot;
    await pool.query("UPDATE subscriber_currencies SET rate=3 WHERE subscriber_id=$1 AND code='EUR'",[sidA]);
    const rejection=await send('/api/service-orders/'+o.json.id,{status:'rejected',reason:'Manual rejection'},ownerCookieA,'PUT');
    assert.equal(rejection.status,200,rejection.text);
    const movement=(await pool.query("SELECT amount_usd_units::text amount,currency_snapshot FROM customer_wallet_ledger WHERE reference_id=$1 AND type='order_refund'",[o.json.id])).rows[0];
    assert.equal(movement.amount,o.json.priceUsdUnits);
    assert.deepEqual(movement.currency_snapshot,initial);
    const historical=await req(client+'/statement?type=order_refund',{cookie:ownerCookieA});
    assert.ok(historical.json.data.some(r=>r.referenceId===o.json.id&&r.formattedAmount===o.json.amountFormatted));
    assert.equal((await send('/api/service-orders/'+o.json.id,{status:'processing'},ownerCookieA,'PUT')).status,409);
    const debit=await fund('1.25',randomUUID(),newClient.id,'deduct','debit');
    assert.equal(debit.status,200,debit.text);
    const adjustment=await fund('0.75',randomUUID(),newClient.id,'adjustment','credit');
    assert.equal(adjustment.status,200,adjustment.text);
    assert.equal(adjustment.json.financial.availableBalance,'39160000000000');
  });
  await check('a failed ledger insert rolls the order and wallet debit back together',async()=>{
    const transient=await service('Rollback fixture','remote','1.00');
    assert.equal(transient.status,201,transient.text);
    const before=(await req(client+'/wallet',{cookie:ownerCookieA})).json.availableBalance;
    const count=await scalar('SELECT count(*)::int value FROM service_orders WHERE subscriber_id=$1',[sidA]);
    await pool.query(`CREATE FUNCTION test_fail_foundation_debit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.type='order_debit' AND NEW.description LIKE 'Service order: Rollback%' THEN RAISE EXCEPTION 'test-only ledger failure'; END IF; RETURN NEW; END; $$`);
    await pool.query('CREATE TRIGGER test_fail_foundation_debit BEFORE INSERT ON customer_wallet_ledger FOR EACH ROW EXECUTE FUNCTION test_fail_foundation_debit()');
    try {
      const failed=await purchase(transient.json.id,transient.json.priceUsdUnits);
      assert.equal(failed.status,500,failed.text);
      assert.equal((await req(client+'/wallet',{cookie:ownerCookieA})).json.availableBalance,before);
      assert.equal(await scalar('SELECT count(*)::int value FROM service_orders WHERE subscriber_id=$1',[sidA]),count);
    } finally {
      await pool.query('DROP TRIGGER test_fail_foundation_debit ON customer_wallet_ledger');
      await pool.query('DROP FUNCTION test_fail_foundation_debit()');
    }
  });
  await check('multi-tenant customer account cannot see or order another tenant service or order',async()=>{
    const serviceB=await service('Remote tenant B','remote','5.00');
    // Service helper above is scoped to A. Create B explicitly.
    const other=await send('/api/manual-services',{name:'Tenant B only',serviceType:'remote',priceUsd:'5.00',active:true,
      displayOrder:0,requirements:[]},ownerCookieB);
    assert.equal(serviceB.status,201);assert.equal(other.status,201,other.text);
    assert.equal((await send(url+'/quote',{serviceId:other.json.id},customer)).status,404);
    assert.equal((await purchase(other.json.id,other.json.priceUsdUnits)).status,404);
    const hash=(await pool.query('SELECT password_hash FROM public_customer_accounts WHERE id=$1',[newClient.id])).rows[0].password_hash;
    const idB=randomUUID();
    await pool.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,username,client_code,enabled)
      VALUES($1,$2,'B','Customer','wallet-b@example.invalid',$3,'WalletBuyerB','WALLETTB',true)`,[idB,sidB,hash]);
    const loggedB=await send('/api/public/customer/site-b/login',{email:'wallet-b@example.invalid',password},'', 'POST');
    assert.equal(loggedB.status,200,loggedB.text);
    const cookieB=loggedB.cookie;
    assert.equal((await req('/api/public/customer/site-b/panel/orders/'+firstOrder.id,{cookie:cookieB})).status,404);
    assert.equal((await req('/api/public/customer/site-b/panel/services',{cookie:cookieB})).json.data.some(s=>s.id===svc.json.id),false);
    assert.equal((await req('/api/public/customer/site-b/panel/statement',{cookie:cookieB})).json.data.length,0);
  });
  await check('blocked client cannot buy; reseller can correct wallet without granting login',async()=>{
    const pending=await purchase(svc.json.id,svc.json.priceUsdUnits,randomUUID(),{imei:'490154203237518'});
    assert.equal(pending.status,201,pending.text);
    assert.equal((await send(client+'/status',{enabled:false},ownerCookieA,'PUT')).status,200);
    const refused=await purchase(svc.json.id,svc.json.priceUsdUnits,randomUUID(),{imei:'490154203237518'});
    assert.ok([401,403].includes(refused.status),refused.text);
    const edit=await fund('1.00');assert.equal(edit.status,200,edit.text);
    assert.equal((await send('/api/service-orders/'+pending.json.id,{status:'rejected',reason:'Client blocked, refunded'},ownerCookieA,'PUT')).status,200);
    assert.equal(await scalar("SELECT count(*)::int value FROM customer_wallet_ledger WHERE reference_id=$1 AND type='order_refund'",[pending.json.id]),'1');
    assert.equal((await send(client+'/status',{enabled:true},ownerCookieA,'PUT')).status,200);
  });
  await check('retail order data and guest checkout remain untouched by service flows',async()=>{
    assert.equal(await scalar('SELECT count(*)::int value FROM store_orders WHERE subscriber_id=$1',[sidA]),savedRetail);
    const status=(await req('/api/state',{cookie:ownerCookieA}));assert.equal(status.status,200);
  });
}
