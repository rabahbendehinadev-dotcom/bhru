import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Script} from 'node:vm';
const digest=s=>createHash('sha256').update(s).digest('hex');
export async function testCustomerSecurity({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,issueResetToken,securityAccount}){
  const base='/api/public/customer/site-a',id=randomUUID(),email=`security-${id}@example.invalid`;
  const template=(await pool.query('SELECT password_hash FROM public_customer_accounts WHERE subscriber_id=$1 LIMIT 1',[sidA])).rows[0];
  await pool.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,client_code,username,preferred_currency)
    VALUES($1,$2,'Security','Client',$3,$4,$5,$6,'USD')`,[id,sidA,email,template.password_hash,randomUUID().slice(0,8).toUpperCase(),`security-${id.slice(0,8)}`]);
  let current,other,changedPassword='A longer replacement passphrase';
  const login=(pw=password,cookie)=>req(base+'/login',{method:'POST',cookie,body:{email,password:pw}});
  const get=cookie=>req(base+'/panel/security',{cookie});
  const post=(path,body={},cookie=current)=>req(base+'/panel/security/'+path,{method:'POST',cookie,body});
  const count=async(type)=>(await pool.query('SELECT count(*)::int n FROM client_activity_events WHERE subscriber_id=$1 AND customer_id=$2 AND event_type=$3',[sidA,id,type])).rows[0].n;
  const history=async()=>(await pool.query('SELECT * FROM customer_login_history WHERE subscriber_id=$1 AND customer_id=$2 ORDER BY created_at DESC,id DESC',[sidA,id])).rows;
  await check('successful customer login records verified history, safe session metadata and one success event',async()=>{
    const r=await login();assert.equal(r.status,200,r.text);current=r.cookie;
    const h=await history();assert.equal(h.length,1);assert.equal(h[0].result,'success');
    assert.ok(h[0].user_agent.includes('Chrome/120'));assert.equal(h[0].device_label,'Chrome · Desktop');
    const d=(await get(current)).json;assert.equal(d.activeSessionCount,1);assert.equal(d.sessions[0].current,true);
    assert.equal(d.lastLoginSource,'history');assert.equal(d.lastLoginIp,h[0].ip_address);
    assert.equal(await count('login_success'),1);
    assert.ok(!JSON.stringify(d).includes('token_hash'));assert.ok(!JSON.stringify(d).includes(template.password_hash));
    assert.ok(!JSON.stringify(d).includes(current));
  });
  await check('known failed login persists safely; five failures temporarily lock canonical account without blocking it',async()=>{
    for(let i=0;i<5;i++){const failed=await login('Not the right password');assert.equal(failed.status,401);}
    const s=(await pool.query('SELECT * FROM customer_security_state WHERE subscriber_id=$1 AND customer_id=$2',[sidA,id])).rows[0];
    assert.equal(s.failed_count,5);assert.ok(s.locked_until);assert.equal(await count('login_locked'),1);
    assert.equal((await login()).status,401);assert.equal((await history())[0].result,'locked');
    assert.equal((await pool.query('SELECT enabled FROM public_customer_accounts WHERE id=$1',[id])).rows[0].enabled,true);
    const unknown=await req(base+'/login',{method:'POST',body:{email:'unknown@example.invalid',password:'Not the right password'}});
    const known=await login('Not the right password');assert.equal(unknown.status,401);assert.deepEqual(unknown.json,known.json);
    assert.equal(await count('login_locked'),1);
    const failures=(await pool.query("SELECT actor_type FROM client_activity_events WHERE customer_id=$1 AND event_type='login_failed'",[id])).rows;
    assert.ok(failures.every(e=>e.actor_type==='system')); // Unverified attempts must not impersonate customer.
  });
  await check('after lockout expiry successful authentication clears failures; reseller blocking stays independent',async()=>{
    await pool.query("UPDATE customer_security_state SET locked_until=now()-interval '1 second' WHERE subscriber_id=$1 AND customer_id=$2",[sidA,id]);
    // Disposable limiter window reset avoids masking the account-level test.
    await pool.query("UPDATE auth_rate_limits SET window_until=now()-interval '1 second'");
    const r=await login();assert.equal(r.status,200,r.text);other=r.cookie;
    const state=(await pool.query('SELECT * FROM customer_security_state WHERE customer_id=$1',[id])).rows[0];
    assert.equal(state.failed_count,0);assert.equal(state.locked_until,null);
    const blocked=await req(`/api/clients/${id}/status`,{method:'PUT',cookie:ownerCookieA,body:{enabled:false}});
    assert.equal(blocked.status,200);assert.equal((await login()).status,401);
    assert.equal((await get(current)).status,401);assert.equal((await history())[0].result,'blocked');
    assert.equal((await req(`/api/clients/${id}/status`,{method:'PUT',cookie:ownerCookieA,body:{enabled:true}})).status,200);
    current=(await login()).cookie;other=(await login()).cookie;
  });
  await check('password change rejects bad current/reused/mismatched/weak password without mutation',async()=>{
    const n=await count('password_changed'),before=(await pool.query('SELECT password_hash FROM public_customer_accounts WHERE id=$1',[id])).rows[0];
    for(const body of [
      {currentPassword:'Wrong password',newPassword:changedPassword,confirmPassword:changedPassword},
      {currentPassword:password,newPassword:password,confirmPassword:password},
      {currentPassword:password,newPassword:changedPassword,confirmPassword:'Different password'},
      {currentPassword:password,newPassword:'short',confirmPassword:'short'},
    ])assert.equal((await post('password',body)).status,400);
    assert.deepEqual((await pool.query('SELECT password_hash FROM public_customer_accounts WHERE id=$1',[id])).rows[0],before);
    assert.equal(await count('password_changed'),n);
  });
  await check('password change atomically updates hash, preserves current session and revokes others once',async()=>{
    const body={currentPassword:password,newPassword:changedPassword,confirmPassword:changedPassword};
    assert.equal((await post('password',body)).status,200);
    assert.equal((await get(current)).status,200);assert.equal((await get(other)).status,401);
    assert.equal((await post('password',body)).status,400);assert.equal(await count('password_changed'),1);
    assert.equal((await get(current)).json.activeSessionCount,1);
    assert.ok((await get(current)).json.passwordChangedAt);
    assert.equal((await login()).status,401);other=(await login(changedPassword)).cookie;
    assert.equal((await get(other)).status,200);
  });
  await check('session revoke uses opaque owned UUID; current and foreign sessions cannot be revoked',async()=>{
    const d=(await get(current)).json,own=d.sessions.find(s=>s.current),target=d.sessions.find(s=>!s.current);
    assert.equal((await post(`sessions/${own.id}/revoke`)).status,409);
    assert.equal((await post(`sessions/${target.id}/revoke`)).status,200);
    assert.equal((await post(`sessions/${target.id}/revoke`)).status,200);
    assert.equal(await count('session_revoked'),1);assert.equal((await get(other)).status,401);
    const foreign=(await pool.query('SELECT id FROM public_customer_accounts WHERE subscriber_id=$1 LIMIT 1',[sidB])).rows[0].id;
    const pub=randomUUID();await pool.query(`INSERT INTO public_customer_sessions(token_hash,subscriber_id,customer_id,session_public_id,expires_at)
      VALUES($1,$2,$3,$4,now()+interval '1 day')`,[digest(randomUUID()),sidB,foreign,pub]);
    assert.equal((await post(`sessions/${pub}/revoke`)).status,404);
    assert.equal((await req('/api/public/customer/site-b/panel/security',{cookie:current})).status,401);
    assert.equal((await req(`/api/clients/${id}/security`,{cookie:ownerCookieB})).status,404);
    const sameTenant=(await pool.query('SELECT id FROM public_customer_accounts WHERE subscriber_id=$1 AND id<>$2 LIMIT 1',[sidA,id])).rows[0].id;
    const samePub=randomUUID();await pool.query(`INSERT INTO public_customer_sessions(token_hash,subscriber_id,customer_id,session_public_id,expires_at)
      VALUES($1,$2,$3,$4,now()+interval '1 day')`,[digest(randomUUID()),sidA,sameTenant,samePub]);
    assert.equal((await post(`sessions/${samePub}/revoke`)).status,404);
    assert.ok(!(await get(current)).json.sessions.some(s=>s.id===pub||s.id===samePub));
  });
  await check('sign out other sessions preserves current and retry adds no duplicate event',async()=>{
    other=(await login(changedPassword)).cookie;
    assert.equal((await post('sessions/revoke-others')).json.affected,1);
    assert.equal((await post('sessions/revoke-others')).json.affected,0);
    assert.equal(await count('all_other_sessions_revoked'),1);
    assert.equal((await get(current)).status,200);assert.equal((await get(other)).status,401);
  });
  const mint=async()=>{
    const db=await pool.connect();
    try{await db.query('BEGIN');await securityAccount(db,sidA,id);const token=await issueResetToken(db,sidA,id);await db.query('COMMIT');return token;}
    catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  };
  const reset=(token,pw='Final secure reset passphrase')=>req(base+'/reset-password',{method:'POST',body:{token,newPassword:pw,confirmPassword:pw}});
  await check('recovery responses are identical for known/unknown accounts, truthful, and contain no reset secret',async()=>{
    const a=await req(base+'/forgot-password',{method:'POST',body:{identifier:email}});
    const b=await req(base+'/forgot-password',{method:'POST',body:{identifier:'missing@example.invalid'}});
    assert.equal(a.status,200,a.text);assert.deepEqual(a.json,b.json);assert.equal(a.json.deliveryAvailable,false);
    assert.ok(!a.text.includes(email));assert.ok(!/\"token\"|token_hash/.test(a.text));
  });
  await check('reset tokens replace older tokens, expire, are tenant-bound and single-use; resetting revokes all sessions',async()=>{
    const first=await mint(),second=await mint();
    assert.equal((await reset(first)).status,400);
    assert.equal((await req('/api/public/customer/site-b/reset-password',{method:'POST',body:{token:second,newPassword:'Another passphrase',confirmPassword:'Another passphrase'}})).status,400);
    await pool.query("UPDATE customer_password_resets SET expires_at=now()-interval '1 second',created_at=now()-interval '1 hour' WHERE token_hash=$1",[digest(second)]);
    assert.equal((await reset(second)).status,400);
    const valid=await mint();
    const result=await reset(valid);assert.equal(result.status,200,result.text);
    assert.equal((await reset(valid)).status,400);assert.equal(await count('password_reset_completed'),1);
    assert.equal((await get(current)).status,401);
    assert.ok(!result.text.includes(valid));assert.equal((await login(changedPassword)).status,401);
    changedPassword='Final secure reset passphrase';current=(await login(changedPassword)).cookie;
    const rows=(await pool.query('SELECT token_hash,used_at FROM customer_password_resets WHERE customer_id=$1',[id])).rows;
    assert.ok(rows.every(r=>r.used_at&&r.token_hash!==valid));assert.equal(rows.find(r=>r.token_hash===digest(valid)).token_hash,digest(valid));
  });
  await check('reseller force logout is own-client scoped and records one verified owner event',async()=>{
    assert.equal((await req(`/api/clients/${id}/security/force-logout`,{method:'POST',cookie:ownerCookieB,body:{}})).status,404);
    const own=()=>req(`/api/clients/${id}/security/force-logout`,{method:'POST',cookie:ownerCookieA,body:{}});
    assert.equal((await own()).json.affected,1);assert.equal((await own()).json.affected,0);
    assert.equal(await count('reseller_force_logout'),1);assert.equal((await get(current)).status,401);
    const e=(await pool.query("SELECT actor_type,actor_id FROM client_activity_events WHERE customer_id=$1 AND event_type='reseller_force_logout'",[id])).rows[0];
    assert.equal(e.actor_type,'subscriber_owner');assert.ok(e.actor_id);
    assert.equal((await req(`/api/clients/${id}/security`,{cookie:ownerCookieA})).json.activeSessionCount,0);
  });
  await check('Security/recovery HTML has valid inline JavaScript and exact CSP hashes without browser tests',async()=>{
    await pool.query("UPDATE auth_rate_limits SET window_until=now()-interval '1 second'");
    current=(await login(changedPassword)).cookie;
    for(const path of ['security','forgot-password','reset-password']){
      const r=await req(`/site-a/customer/${path}`,{cookie:path==='security'?current:undefined});
      assert.equal(r.status,200,r.text);
      const scripts=[...r.text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
      assert.ok(scripts.length>=2);
      for(const script of scripts){new Script(script);assert.ok(r.headers['content-security-policy'].includes(`sha256-${createHash('sha256').update(script).digest('base64')}`));}
      assert.ok(!r.text.includes(template.password_hash));
    }
    const r=await req('/site-a/customer/login');assert.ok(r.text.includes('/site-a/customer/forgot-password'));
  });
  await check('security audit failure rolls login/history, password, reset consumption and session revocations back atomically',async()=>{
    other=(await login(changedPassword)).cookie;
    const token=await mint();
    const snapshot=async()=>({
      account:(await pool.query('SELECT * FROM public_customer_accounts WHERE id=$1',[id])).rows,
      state:(await pool.query('SELECT * FROM customer_security_state WHERE customer_id=$1',[id])).rows,
      sessions:(await pool.query('SELECT * FROM public_customer_sessions WHERE customer_id=$1 ORDER BY token_hash',[id])).rows,
      resets:(await pool.query('SELECT * FROM customer_password_resets WHERE customer_id=$1 ORDER BY id',[id])).rows,
      logins:await history(),
      events:(await pool.query('SELECT * FROM client_activity_events WHERE customer_id=$1 ORDER BY id',[id])).rows,
    });
    const before=await snapshot();
    await pool.query(`CREATE FUNCTION fail_security_activity_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.customer_id='${id}'::uuid AND NEW.event_category='SECURITY' THEN RAISE EXCEPTION 'Test audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER zz_fail_security_activity_test BEFORE INSERT ON client_activity_events FOR EACH ROW EXECUTE FUNCTION fail_security_activity_test();`);
    try{
      for(const action of [
        ()=>post('password',{currentPassword:changedPassword,newPassword:'Rollback-only candidate passphrase',confirmPassword:'Rollback-only candidate passphrase'}),
        ()=>login(changedPassword),
        ()=>reset(token,'Rollback-only reset passphrase'),
        ()=>post('sessions/revoke-others'),
        ()=>req(`/api/clients/${id}/security/force-logout`,{method:'POST',cookie:ownerCookieA,body:{}}),
      ]){
        const r=await action();assert.equal(r.status,500,r.text);
        assert.deepEqual(await snapshot(),before);
      }
    }finally{await pool.query('DROP TRIGGER zz_fail_security_activity_test ON client_activity_events; DROP FUNCTION fail_security_activity_test()');}
  });
  await check('new security/recovery mutations retain existing CSRF and same-origin protection',async()=>{
    const countBefore=await count('login_success');
    for(const [path,body,cookie] of [
      [base+'/login',{email,password:changedPassword},undefined],
      [base+'/forgot-password',{identifier:email},undefined],
      [base+'/reset-password',{token:'f'.repeat(64),newPassword:'Another valid passphrase',confirmPassword:'Another valid passphrase'},undefined],
      [base+'/panel/security/sessions/revoke-others',{},current],
    ]){
      const r=await req(path,{method:'POST',body,cookie,headers:{Origin:'https://untrusted.example.invalid'}});
      assert.equal(r.status,403,r.text);
    }
    assert.equal(await count('login_success'),countBefore);
  });
}
