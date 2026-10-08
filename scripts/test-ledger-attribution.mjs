import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Invoked only by the disposable PostgreSQL finance harness.
export async function testLedgerAttribution({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,newClient,password}) {
  const id=randomUUID(),username='audit'+id.replaceAll('-','').slice(0,12);
  await pool.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,client_code,username,preferred_currency)
    SELECT $1,subscriber_id,'Audit','Client',$2,password_hash,$3,$4,preferred_currency FROM public_customer_accounts WHERE id=$5`,
    [id,username+'@example.invalid',id.replaceAll('-','').slice(0,8).toUpperCase(),username,newClient.id]);
  const base='/api/clients/'+id;
  const reconcile=async()=>req(base+'/reconciliation',{cookie:ownerCookieA});
  const mutation=(operation,direction,amount,key=randomUUID())=>req(base+'/wallet',{method:'POST',cookie:ownerCookieA,body:{
    operation,direction,amount,reason:'Private audit reason',method:'Cash',internalNote:'Private audit note',
    transactionReference:'Audit reference',idempotencyKey:key,
  }});
  let credit,debit,adjustment;
  await check('new wallets receive an explicit immutable zero-origin baseline without a financial posting',async()=>{
    const b=(await pool.query('SELECT * FROM customer_wallet_baselines WHERE customer_id=$1',[id])).rows[0];
    assert.equal(b.opening_account_units,'0');assert.equal(b.basis,'guarded_zero_origin');
    assert.equal((await pool.query('SELECT count(*) n FROM customer_wallet_ledger WHERE customer_id=$1',[id])).rows[0].n,'0');
    const res=await reconcile();assert.equal(res.status,200,res.text);assert.equal(res.json.status,'MATCH');
    await assert.rejects(pool.query("UPDATE customer_wallet_baselines SET basis='guarded_zero_origin' WHERE customer_id=$1",[id]),/immutable/);
  });
  await check('Add Funds, Deduct and Adjustment post exact before/after, verified actor, reason, source and retry identity',async()=>{
    credit=await mutation('add','credit','5.00');debit=await mutation('deduct','debit','1.00');adjustment=await mutation('adjustment','credit','0.50');
    for(const r of [credit,debit,adjustment]){
      assert.equal(r.status,200,r.text);const e=r.json.entry;
      assert.equal(e.createdByType,'subscriber_owner');assert.ok(e.createdById);assert.equal(e.actorDisplay,'Finance Owner');
      assert.equal(e.reason,'Private audit reason');assert.equal(e.internalNote,'Private audit note');
      assert.equal(e.operationSource,'manual_wallet');assert.equal(e.referenceType,'manual_adjustment');
      assert.equal(e.referenceId,e.id);assert.equal(e.correlationId,e.id);
      assert.equal(BigInt(e.balanceBefore)+(e.direction==='credit'?1n:-1n)*BigInt(e.amountAccountUnits),BigInt(e.balanceAfter));
    }
    assert.equal(credit.json.entry.postingSequence,'1');assert.equal(debit.json.entry.postingSequence,'2');assert.equal(adjustment.json.entry.postingSequence,'3');
    const key=randomUUID(),a=await mutation('add','credit','0.01',key),b=await mutation('add','credit','0.01',key);
    assert.equal(a.status,200,a.text);assert.equal(b.status,200,b.text);assert.deepEqual(a.json.entry,b.json.entry);
    const concurrent=await Promise.all([mutation('add','credit','0.01'),mutation('add','credit','0.01')]);
    for(const r of concurrent)assert.equal(r.status,200,r.text);
    assert.deepEqual(concurrent.map(r=>r.json.entry.postingSequence).sort(),['5','6']);
    assert.equal((await reconcile()).json.status,'MATCH');
  });
  await check('manual mutation rejects missing reason/anonymous or foreign actor and rolls back wallet when posting fails',async()=>{
    const before=(await pool.query('SELECT * FROM customer_wallets WHERE customer_id=$1',[id])).rows[0];
    const count=(await pool.query('SELECT count(*) n FROM customer_wallet_ledger WHERE customer_id=$1',[id])).rows[0].n;
    const body={operation:'deduct',direction:'debit',amount:'0.01',reason:'',method:'Cash',idempotencyKey:randomUUID()};
    assert.equal((await req(base+'/wallet',{method:'POST',cookie:ownerCookieA,body})).status,400);
    assert.equal((await req(base+'/wallet',{method:'POST',body:{...body,reason:'Required'}})).status,401);
    assert.equal((await req(base+'/wallet',{method:'POST',cookie:ownerCookieB,body:{...body,reason:'Required'}})).status,404);
    await pool.query(`CREATE FUNCTION test_fail_manual() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.customer_id='${id}'::uuid THEN RAISE EXCEPTION 'test-only failed manual posting'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER zz_test_fail_manual AFTER INSERT ON customer_wallet_ledger FOR EACH ROW EXECUTE FUNCTION test_fail_manual()`);
    try{assert.equal((await mutation('deduct','debit','0.01')).status,500);}
    finally{await pool.query('DROP TRIGGER zz_test_fail_manual ON customer_wallet_ledger; DROP FUNCTION test_fail_manual()');}
    assert.deepEqual((await pool.query('SELECT * FROM customer_wallets WHERE customer_id=$1',[id])).rows[0],before);
    assert.equal((await pool.query('SELECT count(*) n FROM customer_wallet_ledger WHERE customer_id=$1',[id])).rows[0].n,count);
  });
  await check('customer statement excludes staff reasons/notes, IDs, sequence, source and reconciliation data',async()=>{
    const login=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:username+'@example.invalid',password}});
    assert.equal(login.status,200,login.text);
    const res=await req('/api/public/customer/site-a/panel/statement',{cookie:login.cookie});
    assert.equal(res.status,200,res.text);
    for(const r of res.json.data){
      for(const field of ['internalNote','reason','createdById','createdByType','actorDisplay','postingSequence','correlationId','operationSource','balanceBefore','correctionOfId'])
        assert.ok(!(field in r),field);
    }
    assert.ok(!res.text.includes('Private audit'));
    assert.equal((await req('/api/public/customer/site-a/panel/reconciliation',{cookie:login.cookie})).status,404);
    assert.equal((await req(base+'/reconciliation',{cookie:login.cookie})).status,401);
  });
  await check('service charges/refunds retain authoritative order and original-debit links with exact snapshots',async()=>{
    const entries=(await pool.query("SELECT * FROM customer_wallet_ledger WHERE subscriber_id=$1 AND type IN ('order_debit','order_refund')",[sidA])).rows;
    assert.ok(entries.some(e=>e.type==='order_refund'));
    for(const e of entries){
      const o=(await pool.query('SELECT * FROM service_orders WHERE subscriber_id=$1 AND id=$2',[sidA,e.reference_id])).rows[0];
      assert.ok(o);assert.equal(e.amount_account_units,o.price_account_units);
      assert.equal(e.reference_type,'service_order');assert.equal(e.correlation_id,o.id);
      if(e.type==='order_debit'){assert.equal(e.created_by_type,'customer');assert.equal(e.created_by_id,o.customer_id);}
      else{
        assert.equal(e.created_by_type,'subscriber_owner');assert.equal(e.operation_source,'service_order_refund');
        assert.equal(e.original_debit_id,o.wallet_debit_reference);
        const d=entries.find(d=>d.id===e.original_debit_id);assert.ok(d);
        assert.equal(e.amount_account_units,d.amount_account_units);assert.deepEqual(e.account_currency_snapshot,d.account_currency_snapshot);
        assert.equal(entries.filter(r=>r.original_debit_id===d.id).length,1);
      }
    }
    assert.equal((await req('/api/clients/'+newClient.id+'/reconciliation',{cookie:ownerCookieA})).json.status,'MATCH');
  });
  await check('historical zero-origin reconciliation includes old amounts without inventing sequence or actor snapshots',async()=>{
    const old=(await pool.query('SELECT customer_id FROM customer_wallet_ledger WHERE subscriber_id=$1 AND posting_sequence IS NULL LIMIT 1',[sidB])).rows[0];
    const result=await req('/api/clients/'+old.customer_id+'/reconciliation',{cookie:ownerCookieB});
    assert.equal(result.status,200,result.text);assert.equal(result.json.status,'MATCH');
    assert.equal(result.json.legacyEntryCount,2);assert.equal(result.json.openingBalance,'0');
  });
  await check('older writer compatibility normalizes only new postings with verified actor and private-note separation',async()=>{
    const original=(await pool.query('SELECT * FROM customer_wallet_ledger WHERE subscriber_id=$1 AND posting_sequence IS NULL LIMIT 1',[sidB])).rows[0];
    const entry=randomUUID();
    await pool.query(`INSERT INTO customer_wallet_ledger
      (id,subscriber_id,customer_id,type,direction,amount_usd_units,amount_account_units,balance_after,currency_snapshot,account_currency_snapshot,
       description,internal_note,created_by_type,created_by_id,reference_type,idempotency_key,request_hash)
      VALUES($1,$2,$3,'admin_credit','credit',20000000000,20000000000,20000000000,$4::jsonb,$4::jsonb,
       'Older private reason','Older private reason','reseller',$5,'manual',$6,'old-writer')`,
      [entry,sidB,original.customer_id,JSON.stringify(original.account_currency_snapshot),original.created_by_id,randomUUID()]);
    const posted=(await pool.query('SELECT * FROM customer_wallet_ledger WHERE id=$1',[entry])).rows[0];
    assert.equal(posted.created_by_type,'subscriber_owner');assert.equal(posted.reason,'Older private reason');
    assert.equal(posted.description,'Funds added');assert.equal(posted.customer_note,'');
    assert.equal(posted.operation_source,'manual_wallet');assert.equal(posted.posting_sequence,'1');
    assert.deepEqual((await pool.query('SELECT * FROM customer_wallet_ledger WHERE id=$1',[original.id])).rows[0],original);
    assert.equal((await req('/api/clients/'+original.customer_id+'/reconciliation',{cookie:ownerCookieB})).json.status,'MATCH');
  });
  await check('MATCH/MISMATCH/UNVERIFIED reconciliation is read-only and tenant/customer restricted',async()=>{
    const snapshot=async()=>({
      wallet:(await pool.query('SELECT * FROM customer_wallets WHERE customer_id=$1',[id])).rows,
      ledger:(await pool.query('SELECT * FROM customer_wallet_ledger WHERE customer_id=$1 ORDER BY id',[id])).rows,
    });
    let original=await snapshot();
    for(let n=0;n<3;n++)assert.equal((await reconcile()).json.status,'MATCH');
    assert.deepEqual(await snapshot(),original);
    assert.equal((await req(base+'/reconciliation',{cookie:ownerCookieB})).status,404);
    assert.equal((await req('/api/clients/'+randomUUID()+'/reconciliation',{cookie:ownerCookieA})).status,404);
    // Corrupt only the DISPOSABLE fixture using superuser trigger bypass.
    // Diagnostic code never bypasses guards or offers repair.
    const db=await pool.connect();
    try{
      await db.query('BEGIN');await db.query("SET LOCAL session_replication_role='replica'");
      await db.query('UPDATE customer_wallets SET available_balance=available_balance+5000000000000 WHERE customer_id=$1',[id]);await db.query('COMMIT');
    }finally{db.release();}
    original=await snapshot();
    const mismatch=await reconcile();assert.equal(mismatch.json.status,'MISMATCH');
    assert.equal(mismatch.json.difference,'5000000000000');assert.equal(mismatch.json.formattedDifference,'$5.00 USD');
    assert.deepEqual(await snapshot(),original);
    const db2=await pool.connect();
    try{await db2.query('BEGIN');await db2.query("SET LOCAL session_replication_role='replica'");
      await db2.query('DELETE FROM customer_wallet_baselines WHERE customer_id=$1',[id]);await db2.query('COMMIT');
    }finally{db2.release();}
    original=await snapshot();
    const unknown=await reconcile();assert.equal(unknown.json.status,'UNVERIFIED');
    assert.equal(unknown.json.ledgerDerivedBalance,null);assert.equal(unknown.json.difference,null);
    assert.deepEqual(await snapshot(),original);
  });
}
