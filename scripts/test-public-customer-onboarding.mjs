// Focused HTTP + real SQL checks. This script creates an isolated PostgreSQL
// cluster under /tmp with a Unix socket only, never uses DATABASE_URL supplied
// by an operator, and never connects to development/production databases.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import { testWalletServices } from './test-wallet-services.mjs';
import { testStrictAccountCurrency } from './test-strict-account-currency.mjs';
import { testCustomerPanel } from './test-customer-panel.mjs';

const root=resolve(import.meta.dirname,'..'), temp=await mkdtemp(join(tmpdir(),'bhru-onboarding-'));
const data=join(temp,'data'), log=join(temp,'postgres.log');
let started=false, pool, server, connection, checks=0;
function command(name,args,env=process.env) {
  const result=spawnSync(name,args,{encoding:'utf8',env,timeout:120000});
  if(result.error||result.status!==0) throw new Error(`${name} failed: ${result.stderr || result.error}`);
  return result.stdout;
}
async function check(name, work) { await work(); checks++; console.log(`PASS ${name}`); }
try {
  command('initdb',['-D',data,'-A','trust','--no-locale','--encoding=UTF8']);
  command('pg_ctl',['-D',data,'-l',log,'-o',`-h '' -k ${temp} -p 55483`,'-w','start']);
  started=true;
  const osUser=command('id',['-un']).trim();
  process.env.DATABASE_URL=`postgresql://${osUser}@localhost/postgres?host=${encodeURIComponent(temp)}&port=55483`;
  process.env.SESSION_SECRET='isolated-onboarding-test-signing-secret-not-production';
  process.env.PLATFORM_ADMIN_PATH='private-test-entry';
  process.env.NODE_ENV='production';
  process.env.LOG_LEVEL='silent';
  process.env.BHRU_PLATFORM_HOSTS='bhru.net,www.bhru.net';
  // Test-only instrumentation captures solutions in the temporary bundle,
  // without changing real image rendering, verification, rate limits or SQL.
  // No solution/debug hooks are present in production source or build.
  globalThis.__onboardingAnswers=new Map();
  const bundle=join(temp,'app.mjs');
  await build({
    stdin:{contents:`export {default as app} from '${root}/artifacts/api-server/src/app.ts';
      export {pool} from '${root}/lib/db/src/index.ts';
      export {hashPassword} from '${root}/lib/db/src/security.ts';
      export {createSession} from '${root}/artifacts/api-server/src/lib/auth.ts';
      export {createCustomerSession} from '${root}/artifacts/api-server/src/lib/customer-auth/session.ts';
      export {ONBOARDING_SCRIPT,ONBOARDING_HASH} from '${root}/artifacts/api-server/src/lib/customer-auth/onboarding-ui.ts';`,
      resolveDir:root,sourcefile:'onboarding-test-entry.ts',loader:'ts'},
    outfile:bundle,bundle:true,platform:'node',format:'esm',logLevel:'silent',
    banner:{js:"import {createRequire as testCreateRequire} from 'node:module';const require=testCreateRequire(import.meta.url);"},
    plugins:[{name:'test-only-captcha-capture',setup(b){
      b.onLoad({filter:/\/customer-auth\/challenge\.ts$/},async({path})=>{
        const content=await readFile(path,'utf8');
        const needle='return { id, image:challengeImage(answer), expiresAt:expiresAt.toISOString() };';
        assert.ok(content.includes(needle),'Test challenge capture must stay restricted to this exact return.');
        return {loader:'ts',contents:content.replace(needle,'globalThis.__onboardingAnswers.set(id,answer); '+needle)};
      });
    }}],
  });
  const api=await import(pathToFileURL(bundle).href);
  pool=api.pool;
  connection=await pool.connect();
  const files=(await readdir(join(root,'lib/db/src/migrations'))).filter(f=>/^\d+_.+\.sql$/.test(f)).sort();
  await connection.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const file of files.filter(f=>Number.parseInt(f,10)<20)) {
    const sql=await readFile(join(root,'lib/db/src/migrations',file),'utf8');
    await connection.query('BEGIN');
    if(file.startsWith('004_')) await connection.query("SELECT set_config('bhru.private_admin_segment',$1,true)",['private-test-entry']);
    await connection.query(sql);
    await connection.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[file,createHash('sha256').update(sql).digest('hex')]);
    await connection.query('COMMIT');
  }
  const sidA=randomUUID(), sidB=randomUUID(), ownerA=randomUUID(), ownerB=randomUUID(), plan=randomUUID(), legacyId=randomUUID();
  const password='Customer-Test!42', hash=await api.hashPassword(password);
  await connection.query('INSERT INTO plans(id,name,price) VALUES($1,$2,0)',[plan,'Isolated test plan']);
  for(const [id,owner,slug] of [[sidA,ownerA,'site-a'],[sidB,ownerB,'site-b']]) {
    await connection.query('INSERT INTO subscribers(id,business,public_slug) VALUES($1,$2,$3)',[id,slug,slug]);
    await connection.query(`INSERT INTO account_users(id,subscriber_id,full_name,username,email,phone,country,password_hash)
      VALUES($1,$2,'Fixture Owner',$3,$4,'+213555123456','DZ',$5)`,[owner,id,slug,`${slug}@example.invalid`,hash]);
    await connection.query(`INSERT INTO subscriptions(id,subscriber_id,plan_id,status,expires_at,licence_key)
      VALUES($1,$2,$3,'ACTIVE',now()+interval '30 days',$4)`,[randomUUID(),id,plan,randomUUID()]);
    await connection.query(`INSERT INTO subscriber_modules(subscriber_id,module_key,enabled) VALUES($1,'ecommerce',true)`,[id]);
    await connection.query(`INSERT INTO store_settings(subscriber_id,enabled,title,currency,money_model_version)
      VALUES($1,true,'Fixture Store','USD',2) ON CONFLICT(subscriber_id) DO UPDATE
      SET enabled=true,title='Fixture Store',currency='USD',money_model_version=2`,[id]);
    await connection.query(`INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,rate,decimals,enabled,client_default,is_base,rate_configured)
      VALUES($1,'USD','US Dollar','$','',1,2,true,true,true,true)
      ON CONFLICT(subscriber_id,code) DO UPDATE SET prefix='$',enabled=true,client_default=true,rate_configured=true`,[id]);
  }
  await connection.query(`INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,rate,decimals,enabled,client_default,rate_configured)
    VALUES($1,'EUR','Euro','','EUR',1,2,true,false,true)`,[sidB]);
  await connection.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash)
    VALUES($1,$2,'Legacy','Customer','legacy@example.invalid',$3)`,[legacyId,sidA,hash]);
  const legacySession=await api.createCustomerSession(connection,{id:sidA,slug:'site-a'},{id:legacyId,subscriber_id:sidA});
  const legacyBefore=(await connection.query('SELECT * FROM public_customer_accounts WHERE id=$1',[legacyId])).rows[0];
  connection.release();
  connection=undefined;
  await check('020 migration applies additively; old migration checksums are skipped',async()=>{
    // Run the real previous-release runner in an isolated directory, so legacy
    // USD money exists before 022 and its preservation is actually checked.
    const oldRelease=join(temp,'previous-release');
    await mkdir(join(oldRelease,'migrations'),{recursive:true});
    await copyFile(join(root,'artifacts/api-server/dist/migrate.mjs'),join(oldRelease,'migrate.mjs'));
    for(const file of files.filter(f=>Number.parseInt(f,10)<=21))
      await copyFile(join(root,'lib/db/src/migrations',file),join(oldRelease,'migrations',file));
    const out=command('node',[join(oldRelease,'migrate.mjs')]);
    assert.match(out,/Applied: 020_public_customer_onboarding.sql/);
    assert.match(out,/Applied: 021_customer_wallet_manual_services.sql/);
    assert.equal((out.match(/Already applied:/g)||[]).length,files.filter(f=>Number.parseInt(f,10)<20).length);
    const after=(await pool.query('SELECT * FROM public_customer_accounts WHERE id=$1',[legacyId])).rows[0];
    assert.match(after.client_code,/^[A-Z0-9]{8}$/);assert.equal(after.username,after.client_code);
    assert.equal(after.password_hash,legacyBefore.password_hash);assert.equal(+after.created_at,+legacyBefore.created_at);
    assert.equal(after.whatsapp_phone,null);assert.equal(after.terms_accepted_at,null);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM public_customer_sessions')).rows[0].n,1);
  });
  await check('022 preserves an existing USD wallet and its original audit snapshots',async()=>{
    const legacyCurrency={code:'DZD',name:'Dinar',prefix:'',suffix:'DZD',number_format:'1,000.99',rate:'260.000000',decimals:2,enabled:true};
    await pool.query(`INSERT INTO customer_wallet_ledger(id,subscriber_id,customer_id,type,direction,amount_usd_units,balance_after,
      currency_snapshot,description,method,created_by_type,created_by_id,reference_type,idempotency_key,request_hash)
      VALUES($1,$2,$3,'admin_credit','credit',7000000000000,7000000000000,$4,'Legacy verified payment','Cash','reseller',$5,'manual',$6,'legacy-fixture')`,
      [randomUUID(),sidA,legacyId,legacyCurrency,ownerA,randomUUID()]);
    const before=(await pool.query('SELECT * FROM customer_wallet_ledger WHERE customer_id=$1',[legacyId])).rows[0];
    // Older installations could have a DZD display preference on a USD wallet.
    await pool.query("UPDATE public_customer_accounts SET preferred_currency='DZD' WHERE id=$1",[legacyId]);
    const service=randomUUID(),order=randomUUID(),debit=randomUUID();
    await pool.query('BEGIN');
    try {
      await pool.query(`INSERT INTO manual_services(id,subscriber_id,service_type,name,selling_price_usd_units,active)
        VALUES($1,$2,'remote','Legacy USD service',2000000000000,false)`,[service,sidA]);
      await pool.query(`INSERT INTO service_orders(id,reference,subscriber_id,customer_id,service_id,service_type,
        customer_input_snapshot,service_name_snapshot,price_usd_units,currency_snapshot,wallet_debit_reference,idempotency_key,request_hash)
        VALUES($1,'SO-LEGACY-CURRENCY-TEST',$2,$3,$4,'remote','{}','Legacy USD service',2000000000000,$5,$6,$7,'legacy-order')`,
        [order,sidA,legacyId,service,legacyCurrency,debit,randomUUID()]);
      await pool.query(`INSERT INTO customer_wallet_ledger(id,subscriber_id,customer_id,type,direction,amount_usd_units,balance_after,
        currency_snapshot,description,created_by_type,created_by_id,reference_type,reference_id,idempotency_key,request_hash)
        VALUES($1,$2,$3,'order_debit','debit',2000000000000,5000000000000,$4,'Legacy order','customer',$3,'service_order',$5,$6,'legacy-order')`,
        [debit,sidA,legacyId,legacyCurrency,order,randomUUID()]);
      await pool.query('COMMIT');
    } catch(e) {await pool.query('ROLLBACK');throw e;}
    const out=command('node',[join(root,'artifacts/api-server/dist/migrate.mjs')]);
    assert.match(out,/Applied: 022_strict_client_account_currency.sql/);
    const wallet=(await pool.query('SELECT * FROM customer_wallets WHERE customer_id=$1',[legacyId])).rows[0];
    assert.equal(wallet.accounting_currency,'USD');assert.equal(wallet.available_balance,'5000000000000');
    const after=(await pool.query('SELECT * FROM customer_wallet_ledger WHERE id=$1',[before.id])).rows[0];
    assert.deepEqual(after.currency_snapshot,before.currency_snapshot);
    assert.equal(after.amount_usd_units,before.amount_usd_units);
    assert.equal(after.amount_account_units,before.amount_usd_units);
    assert.equal(after.account_currency_snapshot.code,'USD');
    const migratedOrder=(await pool.query('SELECT * FROM service_orders WHERE id=$1',[order])).rows[0];
    assert.equal(migratedOrder.price_account_units,'2000000000000');
    assert.equal(migratedOrder.currency_snapshot.code,'DZD');assert.equal(migratedOrder.account_currency_snapshot.code,'USD');
    assert.equal((await pool.query('SELECT preferred_currency FROM public_customer_accounts WHERE id=$1',[legacyId])).rows[0].preferred_currency,'USD');
  });
  await check('existing db:migrate rerun is safe and skips every applied file',async()=>{
    const out=command('node',[join(root,'artifacts/api-server/dist/migrate.mjs')]);
    assert.equal((out.match(/Already applied:/g)||[]).length,files.length);
    assert.doesNotMatch(out,/\nApplied:/);
  });
  const c=await pool.connect();
  const ownerTokenA=await api.createSession(c,{id:ownerA,subscriber_id:sidA,full_name:'Fixture Owner',admin:false});
  const ownerTokenB=await api.createSession(c,{id:ownerB,subscriber_id:sidB,full_name:'Fixture Owner',admin:false});
  c.release();
  server=api.app.listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const port=server.address().port;let requestId=0;
  const ownerCookieA=`bhru_session=${ownerTokenA}`,ownerCookieB=`bhru_session=${ownerTokenB}`;
  const legacyCookie=`bhru_customer_site-a=${legacySession}`;
  async function req(path,{method='GET',body,host='bhru.net',cookie='',headers={}}={}) {
    const payload=body===undefined?null:JSON.stringify(body);
    return new Promise((ok,fail)=>{
      const id=++requestId;
      const r=httpRequest({hostname:'127.0.0.1',port,path,method,headers:{
        Host:host,'X-Forwarded-For':`192.0.2.${id%250+1}`,Cookie:cookie,
        ...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),'X-BHRU-Customer-Request':'1','X-BHRU-Request':'1'}:{}),...headers,
      }},res=>{
        let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);res.on('end',()=>{
          let json;try{json=JSON.parse(text);}catch{}
          ok({status:res.statusCode,text,json,headers:res.headers,cookie:(res.headers['set-cookie']||[]).map(s=>s.split(';')[0]).join('; ')});
        });
      });r.on('error',fail);if(payload)r.write(payload);r.end();
    });
  }
  const profile={firstName:'New',lastName:'Client',email:'new@example.invalid',username:'NewClient',
    whatsappPhone:'00 213 555 123 456',password,confirmPassword:password,preferredLanguage:'en',preferredCurrency:'USD',
    newsletterOptIn:false,addressLine1:'Test Street',addressLine2:'',countryCode:'DZ',state:'Algiers',city:'Algiers',postalCode:'16000',termsAccepted:true};
  async function challenge(slug='site-a',host='bhru.net') {
    const res=await req(`/api/public/customer/${slug}/challenge`,{method:'POST',body:{},host});
    assert.equal(res.status,200,res.text);
    assert.match(res.json.image,/^data:image\/png;base64,/);
    assert.ok((res.headers['set-cookie']||[]).some(s=>/HttpOnly/.test(s)&&/SameSite=Lax/.test(s)&&/Secure/.test(s)));
    assert.ok(!res.text.includes(globalThis.__onboardingAnswers.get(res.json.id)));
    return {id:res.json.id,answer:globalThis.__onboardingAnswers.get(res.json.id),cookie:res.cookie,host,slug};
  }
  async function register(extra={},ch,slug='site-a',host='bhru.net') {
    const challengeData=ch||await challenge(slug,host);
    return req(`/api/public/customer/${slug}/register`,{method:'POST',host,cookie:challengeData.cookie,
      body:{...profile,...extra,challengeId:challengeData.id,challengeAnswer:challengeData.answer}});
  }
  async function setDefault(code) {
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('UPDATE subscriber_currencies SET client_default=false WHERE subscriber_id=$1 AND client_default',[sidA]);
      await db.query('UPDATE subscriber_currencies SET client_default=true WHERE subscriber_id=$1 AND code=$2',[sidA,code]);
      await db.query('COMMIT');
    } catch(e) {await db.query('ROLLBACK');throw e;} finally {db.release();}
  }
  await check('registration options contain only owning tenant enabled currencies, supported language and ISO countries',async()=>{
    await pool.query(`INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,rate,decimals,enabled,client_default,rate_configured)
      VALUES($1,'DZD','Dinar','','DZD',260,2,false,false,true)`,[sidA]);
    const res=await req('/api/public/customer/site-a/options');
    assert.equal(res.status,200);assert.deepEqual(res.json.currencies.map(c=>c.code),['USD']);
    assert.ok(res.json.languages.some(l=>l.code==='ar'));assert.ok(res.json.countries.some(c=>c.code==='DZ'));
  });
  await check('legacy account remains visible with its existing order, same password and valid old session',async()=>{
    const list=await req('/api/clients',{cookie:ownerCookieA});
    assert.equal(list.status,200);assert.equal(list.json.data[0].id,legacyId);assert.equal(list.json.data[0].orderCount,1);
    const res=await req('/api/public/customer/site-a/session',{cookie:legacyCookie});
    assert.equal(res.status,200);assert.equal(res.json.customer.email,'legacy@example.invalid');
    assert.match(res.json.customer.clientCode,/^[A-Z0-9]{8}$/);
    assert.equal(res.json.customer.effectiveCurrency,'USD');
    assert.ok(!res.text.includes(hash)&&!res.text.includes(sidA)&&!res.text.includes(legacyId));
    const oldLogin=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:'legacy@example.invalid',password}});
    assert.equal(oldLogin.status,200);assert.equal(oldLogin.json.customer.termsAcceptedAt,null);
  });
  await check('new registration persists complete profile, normalized phone and consent and immediately creates one client',async()=>{
    const response=await register();assert.equal(response.status,201,response.text);
    const row=(await pool.query('SELECT * FROM public_customer_accounts WHERE email=$1 AND subscriber_id=$2',[profile.email,sidA])).rows[0];
    assert.equal(row.whatsapp_phone,'+213555123456');assert.equal(row.country_code,'DZ');
    assert.equal(row.preferred_language,'en');assert.equal(row.preferred_currency,'USD');assert.equal(row.newsletter_opt_in,false);
    assert.equal(row.address_line_1,'Test Street');assert.ok(row.terms_accepted_at);assert.match(row.client_code,/^[A-Z0-9]{8}$/);
    assert.notEqual(row.password_hash,password);
    const responseList=await req('/api/clients?search=NewClient',{cookie:ownerCookieA});
    assert.equal(responseList.json.data.length,1);assert.equal(responseList.json.data[0].id,row.id);
    assert.equal(responseList.json.data[0].orderCount,0);
  });
  const newClient=(await pool.query('SELECT * FROM public_customer_accounts WHERE subscriber_id=$1 AND email=$2',[sidA,profile.email])).rows[0];
  await check('required fields, phone, confirmation, Terms, language, country and enabled currency are enforced on server',async()=>{
    for(const invalid of [
      {whatsappPhone:''},{whatsappPhone:'555123456'},{whatsappPhone:'+999555123456'},
      {confirmPassword:'does-not-match'},{termsAccepted:false},{preferredCurrency:'DZD'},{preferredCurrency:'EUR'},
      {preferredLanguage:'unsupported'},{preferredLanguage:''},{countryCode:'ZZ'},{email:'not-an-email'},{firstName:''},
    ]) assert.equal((await register({...invalid,email:invalid.email??randomUUID()+'@example.invalid',username:''})).status,400,JSON.stringify(invalid));
  });
  await check('CAPTCHA is server validated, browser/tenant bound, expires and cannot be replayed',async()=>{
    const ch=await challenge();
    assert.equal((await register({email:'wrong-captcha@example.invalid'}, {...ch,answer:'WRONG'})).status,400);
    assert.equal((await register({email:'replay@example.invalid'},ch)).status,400);
    const expired=await challenge();
    await pool.query("UPDATE public_customer_registration_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
    assert.equal((await register({email:'expired@example.invalid'},expired)).status,400);
    const bound=await challenge();
    assert.equal((await register({email:'no-binding@example.invalid'},{...bound,cookie:''})).status,400);
    assert.equal((await register({email:'wrong-tenant@example.invalid'},bound,'site-b')).status,400);
    const once=await challenge();assert.equal((await register({email:'once@example.invalid',username:''},once)).status,201);
    assert.equal((await register({email:'twice@example.invalid',username:''},once)).status,400);
    assert.equal((await pool.query("SELECT count(*)::int n FROM public_customer_accounts WHERE email IN ('wrong-captcha@example.invalid','expired@example.invalid','twice@example.invalid')")).rows[0].n,0);
  });
  await check('CSRF checks and real registration rate limiting apply',async()=>{
    const cross=await req('/api/public/customer/site-a/challenge',{method:'POST',body:{},headers:{Origin:'https://evil.example'}});
    assert.equal(cross.status,403);
    let last;
    for(let i=0;i<11;i++) last=await req('/api/public/customer/site-a/register',{method:'POST',body:{},headers:{'X-Forwarded-For':'198.51.100.1'}});
    assert.equal(last.status,429);
  });
  await check('username uniqueness is case-insensitive per tenant and concurrent allocation is safe',async()=>{
    assert.equal((await register({email:'conflict@example.invalid',username:'newclient'})).status,400);
    assert.equal((await register({email:profile.email,username:'NEWCLIENT'},undefined,'site-b')).status,201);
    assert.equal((await pool.query('SELECT count(*)::int n FROM public_customer_accounts WHERE email=$1',[profile.email])).rows[0].n,2);
    const requests=[];
    for(let i=0;i<2;i++) requests.push({ch:await challenge(),i});
    const replies=await Promise.all(requests.map(({ch,i})=>register({email:`concurrent-${i}@example.invalid`,username:'SameName'},ch)));
    assert.equal(replies.filter(r=>r.status===201).length,1);assert.equal(replies.filter(r=>r.status===400).length,1);
    const allocated=[];
    for(let i=2;i<4;i++) allocated.push({ch:await challenge(),i});
    const generated=await Promise.all(allocated.map(({ch,i})=>register({email:`concurrent-${i}@example.invalid`,username:''},ch)));
    assert.ok(generated.every(r=>r.status===201));
    const codes=(await pool.query('SELECT client_code,username FROM public_customer_accounts WHERE subscriber_id=$1',[sidA])).rows;
    assert.equal(new Set(codes.map(c=>c.client_code)).size,codes.length);
    assert.equal(new Set(codes.map(c=>c.username.toLowerCase())).size,codes.length);
  });
  await check('email login, username login and immutable code login use the same canonical account and update actual activity',async()=>{
    for(const identifier of [profile.email,'nEwClIeNt',newClient.client_code.toLowerCase()]) {
      const res=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:identifier,password}});
      assert.equal(res.status,200,res.text);assert.equal(res.json.customer.email,profile.email);
      assert.equal(res.json.customer.username,'NewClient');assert.ok(res.json.customer.lastLoginAt);
    }
    assert.ok((await pool.query("SELECT count(*)::int n FROM public_customer_activity WHERE customer_id=$1 AND action='login'",[newClient.id])).rows[0].n>=3);
    const bad=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:'NewClient',password:'wrong-password'}});
    assert.equal(bad.status,401);
  });
  const login=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:profile.email,password}});
  let customerCookie=login.cookie;
  const editor={firstName:'Updated',lastName:'Customer',username:'UpdatedClient',whatsappPhone:'+213555123456',
    preferredLanguage:'fr',preferredCurrency:'USD',newsletterOptIn:true,addressLine1:'Updated Street',addressLine2:null,
    countryCode:'DZ',state:'Algiers',city:'Algiers',postalCode:'16000'};
  await check('search finds registered clients by username, code, name, email and phone; paging/status filters work',async()=>{
    for(const term of ['NewClient',newClient.client_code,'New Client',profile.email,'+213 555 123 456']) {
      const r=await req('/api/clients?search='+encodeURIComponent(term),{cookie:ownerCookieA});
      assert.equal(r.status,200);assert.ok(r.json.data.some(c=>c.id===newClient.id),term);
    }
    const next=await req('/api/clients?page=2',{cookie:ownerCookieA});assert.equal(next.json.page,2);
    const active=await req('/api/clients?status=active',{cookie:ownerCookieA});assert.ok(active.json.data.every(c=>c.enabled));
    assert.equal((await req('/api/clients?status=not-real',{cookie:ownerCookieA})).status,400);
  });
  await check('reseller profile editing updates canonical/public profile without changing password, email, code or order data',async()=>{
    const r=await req(`/api/clients/${newClient.id}`,{method:'PATCH',body:editor,cookie:ownerCookieA});
    assert.equal(r.status,200,r.text);
    const row=(await pool.query('SELECT * FROM public_customer_accounts WHERE id=$1',[newClient.id])).rows[0];
    assert.equal(row.first_name,'Updated');assert.equal(row.username,'UpdatedClient');assert.equal(row.email,newClient.email);
    assert.equal(row.password_hash,newClient.password_hash);assert.equal(row.client_code,newClient.client_code);
    const session=await req('/api/public/customer/site-a/session',{cookie:customerCookie});
    assert.equal(session.json.customer.firstName,'Updated');assert.equal(session.json.customer.preferredLanguage,'fr');
    assert.equal((await req(`/api/clients/${newClient.id}`,{method:'PATCH',body:{...editor,clientCode:'CHANGE00'},cookie:ownerCookieA})).status,400);
    await assert.rejects(pool.query('UPDATE public_customer_accounts SET client_code=$2 WHERE id=$1',[newClient.id,'CHANGE00']),/immutable/);
  });
  await check('all client detail/edit/block/note operations reject other tenants; public customer cannot access reseller APIs',async()=>{
    for(const [path,method,body] of [
      [`/api/clients/${newClient.id}`,'GET',undefined],[`/api/clients/${newClient.id}`,'PATCH',editor],
      [`/api/clients/${newClient.id}/status`,'PUT',{enabled:false}],[`/api/clients/${newClient.id}/notes`,'POST',{body:'Not allowed'}],
    ]) assert.equal((await req(path,{method,body,cookie:ownerCookieB})).status,404);
    assert.equal((await req('/api/clients',{cookie:customerCookie})).status,401);
    const b=await req('/api/clients',{cookie:ownerCookieB});assert.ok(b.json.data.every(c=>c.id!==newClient.id));
  });
  await check('internal notes remain reseller-only; financial summaries are zero and not fabricated ledger totals',async()=>{
    const note=await req(`/api/clients/${newClient.id}/notes`,{method:'POST',body:{body:'Internal fixture note'},cookie:ownerCookieA});
    assert.equal(note.status,201);
    const d=await req(`/api/clients/${newClient.id}`,{cookie:ownerCookieA});
    assert.equal(d.status,200);assert.equal(d.json.notes[0].body,'Internal fixture note');
    assert.equal(d.json.financial.availableBalance,'0');assert.equal(d.json.financial.lockedAmount,'0');assert.equal(d.json.financial.due,'0');
    assert.equal(d.json.financial.ledgerAvailable,true);assert.match(d.json.financial.formattedZero,/0\.00/);
    const publicAccount=await req('/site-a/customer/account',{cookie:customerCookie});
    assert.equal(publicAccount.status,200);assert.ok(publicAccount.text.includes('Updated Street'));
    assert.ok(!publicAccount.text.includes('Internal fixture note')&&!publicAccount.text.includes(newClient.id));
  });
  await check('blocked account cannot log in; old customer sessions are revoked; reactivate preserves client history',async()=>{
    assert.equal((await req(`/api/clients/${newClient.id}/status`,{method:'PUT',body:{enabled:false},cookie:ownerCookieA})).status,200);
    assert.equal((await req('/api/public/customer/site-a/session',{cookie:customerCookie})).json.customer,null);
    assert.equal((await req('/api/public/customer/site-a/login',{method:'POST',body:{email:profile.email,password}})).status,401);
    assert.equal((await pool.query('SELECT count(*)::int n FROM public_customer_sessions WHERE customer_id=$1',[newClient.id])).rows[0].n,0);
    const blocked=await req('/api/clients?status=blocked',{cookie:ownerCookieA});
    assert.ok(blocked.json.data.some(c=>c.id===newClient.id));
    assert.equal((await req(`/api/clients/${newClient.id}/status`,{method:'PUT',body:{enabled:true},cookie:ownerCookieA})).status,200);
    const again=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:'UpdatedClient',password}});
    assert.equal(again.status,200);customerCookie=again.cookie;
    assert.equal((await req(`/api/clients/${newClient.id}`,{cookie:ownerCookieA})).json.notes.length,1);
  });
  await check('account currency is immutable; default changes do not switch existing clients',async()=>{
    await pool.query("UPDATE subscriber_currencies SET enabled=true WHERE subscriber_id=$1 AND code='DZD'",[sidA]);
    assert.equal((await req(`/api/clients/${newClient.id}`,{method:'PATCH',body:{...editor,preferredCurrency:'DZD'},cookie:ownerCookieA})).status,409);
    await assert.rejects(pool.query("UPDATE public_customer_accounts SET preferred_currency='DZD' WHERE id=$1",[newClient.id]),/immutable/);
    await setDefault('DZD');
    const state=await req('/api/public/customer/site-a/session',{cookie:customerCookie});
    assert.equal(state.json.customer.preferredCurrency,'USD');assert.equal(state.json.customer.effectiveCurrency,'USD');
    assert.equal((await req(`/api/clients/${newClient.id}`,{method:'PATCH',body:{...editor,firstName:'Still Updated'},cookie:ownerCookieA})).status,200);
    await setDefault('USD');
  });
  let productId;
  await check('authenticated orders bind server-side identity; guest orders and matching contacts are not merged',async()=>{
    productId=randomUUID();
    await pool.query(`INSERT INTO store_products(id,subscriber_id,name,slug,price_minor,price_usd_units,active,in_stock,stock_quantity)
      VALUES($1,$2,'Fixture Product','fixture-product',500,5000000000000,true,true,10)`,[productId,sidA]);
    const input={checkout_key:randomUUID(),customer_name:'Order Snapshot Name',phone:'+213555123456',email:profile.email,
      state:'Algiers',city:'Algiers',address:'Order Snapshot Street',note:'',currency:'USD',items:[{product_id:productId,quantity:1}]};
    const guest=await req('/api/public/commerce/site-a/orders',{method:'POST',body:input});
    assert.equal(guest.status,201,guest.text);
    const registered=await req('/api/public/commerce/site-a/orders',{method:'POST',body:{...input,checkout_key:randomUUID()},cookie:customerCookie});
    assert.equal(registered.status,201,registered.text);
    const rows=(await pool.query('SELECT customer_id,customer_name,address,currency_snapshot FROM store_orders WHERE subscriber_id=$1 ORDER BY created_at',[sidA])).rows;
    assert.equal(rows.length,2);assert.equal(rows[0].customer_id,null);assert.equal(rows[1].customer_id,newClient.id);
    assert.equal(rows[1].customer_name,'Order Snapshot Name');assert.equal(rows[1].address,'Order Snapshot Street');
    assert.equal((await req(`/api/clients/${newClient.id}`,{cookie:ownerCookieA})).json.orderSummary.totalOrders,1);
    const guests=await req('/api/commerce/customers',{cookie:ownerCookieA});
    assert.equal(guests.status,200);assert.equal(guests.json.data[0].order_count,1);
    assert.equal((await req('/api/public/commerce/site-a/orders',{method:'POST',body:{...input,checkout_key:randomUUID(),customer_id:newClient.id}})).status,400);
    // An existing guest retry cannot silently adopt the currently logged-in client.
    assert.equal((await req('/api/public/commerce/site-a/orders',{method:'POST',body:input,cookie:customerCookie})).status,409);
    assert.equal((await pool.query('SELECT customer_id FROM store_orders WHERE checkout_key=$1',[input.checkout_key])).rows[0].customer_id,null);
  });
  await check('order identity and receipt snapshots survive profile edits and use immutable historical formatting',async()=>{
    const before=(await pool.query('SELECT * FROM store_orders WHERE customer_id=$1',[newClient.id])).rows[0];
    assert.equal((await req(`/api/clients/${newClient.id}`,{method:'PATCH',body:{...editor,firstName:'Final Name'},cookie:ownerCookieA})).status,200);
    const after=(await pool.query('SELECT * FROM store_orders WHERE id=$1',[before.id])).rows[0];
    assert.deepEqual(after,before);
    const d=await req(`/api/clients/${newClient.id}`,{cookie:ownerCookieA});assert.equal(d.json.orders[0].formattedTotal,'$5.00 USD');
    const foreignAccount=(await pool.query('SELECT id FROM public_customer_accounts WHERE subscriber_id=$1 LIMIT 1',[sidB])).rows[0].id;
    await assert.rejects(pool.query('UPDATE store_orders SET customer_id=$2 WHERE id=$1',[before.id,foreignAccount]),/foreign key/);
  });
  await check('slug and active verified custom-domain registration/login/account share tenant-bound customer identity',async()=>{
    await pool.query(`INSERT INTO subscriber_custom_domains(id,subscriber_id,hostname,verification_token,verification_status,dns_status,tls_status,dns_checked_at)
      VALUES($1,$2,'shop-a.example.com',$3,'verified','ready','ready',now())`,[randomUUID(),sidA,'a'.repeat(64)]);
    const page=await req('/customer/register',{host:'shop-a.example.com'});
    assert.equal(page.status,200);assert.match(page.text,/data-onboarding/);assert.ok(page.text.includes('Account Information')&&page.text.includes('Billing Details')&&page.text.includes('Verification'));
    new Script(api.ONBOARDING_SCRIPT);
    assert.ok(page.headers['content-security-policy'].includes(`sha256-${api.ONBOARDING_HASH}`));
    assert.equal((await register({email:'custom-host@example.invalid',username:'CustomHost'},undefined,'site-a','shop-a.example.com')).status,201);
    const hostLogin=await req('/api/public/customer/site-a/login',{host:'shop-a.example.com',method:'POST',body:{email:'CustomHost',password}});
    assert.equal(hostLogin.status,200);
    const account=await req('/customer/account',{host:'shop-a.example.com',cookie:hostLogin.cookie});
    assert.equal(account.status,200);assert.match(account.text,/custom-host@example.invalid/);
    assert.equal((await req('/api/public/customer/site-b/options',{host:'shop-a.example.com'})).status,404);
    assert.equal((await req('/api/clients',{host:'shop-a.example.com',cookie:ownerCookieA})).status,404);
    assert.equal((await req('/api/public/customer/site-b/session',{cookie:customerCookie.replace('site-a','site-b')})).json.customer,null);
    assert.equal((await req('/api/public/customer/site-a/session',{cookie:ownerCookieA})).json.customer,null);
    assert.equal((await req('/api/state',{cookie:customerCookie})).status,401);
  });
  await check('logout stays in the customer realm and does not revoke reseller authentication',async()=>{
    assert.equal((await req('/api/public/customer/site-a/logout',{method:'POST',body:{},cookie:customerCookie})).status,200);
    assert.equal((await req('/api/public/customer/site-a/session',{cookie:customerCookie})).json.customer,null);
    assert.equal((await req('/api/clients',{cookie:ownerCookieA})).status,200);
    assert.ok((await pool.query('SELECT count(*)::int n FROM sessions')).rows[0].n>=2);
    assert.equal((await req('/private-test-entry',{cookie:ownerCookieA})).status,403);
  });
  await testWalletServices({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,newClient});
  await testStrictAccountCurrency({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,register,password});
  await testCustomerPanel({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,api});
  console.log(`\n${checks} focused onboarding/client-management SQL and HTTP groups passed. No production database, DNS, browser or deployment used.`);
} finally {
  if(server) await new Promise(r=>server.close(r));
  if(connection) connection.release();
  if(pool) await pool.end();
  if(started) command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
  await rm(temp,{recursive:true,force:true});
  delete globalThis.__onboardingAnswers;
}
