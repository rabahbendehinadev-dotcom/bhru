// Focused foundation slices: SQL/HTTP checks in a disposable Unix-socket PostgreSQL
// cluster. Never reads or connects to an operator's DATABASE_URL.
import assert from 'node:assert/strict';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {pathToFileURL} from 'node:url';
import {Script} from 'node:vm';
import {build} from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import {testWalletServices} from './test-wallet-services.mjs';
import {testLedgerAttribution} from './test-ledger-attribution.mjs';
import {testClientActivity} from './test-client-activity.mjs';
import {testCustomerSecurity} from './test-customer-security.mjs';

const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'bhru-finance-'));
let started=false,pool,server,checks=0,requestId=0;
function command(name,args){
  const result=spawnSync(name,args,{encoding:'utf8',timeout:120000});
  if(result.error||result.status!==0)throw new Error(`${name}: ${result.stderr||result.error}`);
  return result.stdout;
}
async function check(name,fn){await fn();checks++;console.log(`PASS ${name}`);}
try{
  command('initdb',['-D',join(temp,'data'),'-A','trust','--no-locale','--encoding=UTF8']);
  command('pg_ctl',['-D',join(temp,'data'),'-l',join(temp,'postgres.log'),'-o',`-h '' -k ${temp} -p 55484`,'-w','start']);
  started=true;
  const osUser=command('id',['-un']).trim();
  process.env.DATABASE_URL=`postgresql://${osUser}@localhost/postgres?host=${encodeURIComponent(temp)}&port=55484`;
  process.env.SESSION_SECRET=randomUUID();
  process.env.NODE_ENV='production';process.env.LOG_LEVEL='silent';
  process.env.BHRU_PLATFORM_HOSTS='bhru.net,www.bhru.net';
  const bundle=join(temp,'app.mjs');
  await build({
    stdin:{contents:`export {default as app} from '${root}/artifacts/api-server/src/app.ts';
      export {pool} from '${root}/lib/db/src/index.ts';
      export {hashPassword} from '${root}/lib/db/src/security.ts';
      export {createSession} from '${root}/artifacts/api-server/src/lib/auth.ts';
      export {ledgerView} from '${root}/artifacts/api-server/src/lib/client-finance/wallet.ts';
      export {PANEL_SCRIPT,PANEL_SCRIPT_HASH} from '${root}/artifacts/api-server/src/lib/customer-auth/panel-ui.ts';
      export {issueResetToken,securityAccount} from '${root}/artifacts/api-server/src/lib/customer-auth/security.ts';`,
      resolveDir:root,sourcefile:'financial-test-entry.ts',loader:'ts'},
    outfile:bundle,bundle:true,platform:'node',format:'esm',logLevel:'silent',
    plugins:[{name:'test-only-registration-challenge',setup(builder){
      builder.onLoad({filter:/\/customer-auth\/challenge\.ts$/},async({path})=>{
        const content=await readFile(path,'utf8'),needle='return { id, image:challengeImage(answer), expiresAt:expiresAt.toISOString() };';
        assert.ok(content.includes(needle));
        return {contents:content.replace(needle,'return { id, image:challengeImage(answer), expiresAt:expiresAt.toISOString(), testAnswer:answer };'),loader:'ts'};
      });
    }}],
    banner:{js:"import {createRequire as testCreateRequire} from 'node:module';const require=testCreateRequire(import.meta.url);"},
  });
  const api=await import(pathToFileURL(bundle).href);pool=api.pool;
  const db=await pool.connect();
  try{
    for(const name of (await readdir(join(root,'lib/db/src/migrations'))).filter(n=>/^\d+_.+\.sql$/.test(n)).sort()){
    if(name.startsWith('025_')||name.startsWith('026_')||name.startsWith('027_'))continue; // Explicit additive cutovers below.
      await db.query('BEGIN');
      if(name.startsWith('004_'))await db.query("SELECT set_config('bhru.private_admin_segment',$1,true)",['private-test-entry']);
      await db.query(await readFile(join(root,'lib/db/src/migrations',name),'utf8'));
      await db.query('COMMIT');
    }
  }finally{db.release();}
  const sidA=randomUUID(),sidB=randomUUID(),ownerA=randomUUID(),ownerB=randomUUID(),plan=randomUUID();
  const password='Customer-Test!42',hash=await api.hashPassword(password);
  await pool.query('INSERT INTO plans(id,name,price) VALUES($1,$2,0)',[plan,'Finance test plan']);
  for(const [id,owner,slug] of [[sidA,ownerA,'site-a'],[sidB,ownerB,'site-b']]){
    await pool.query('INSERT INTO subscribers(id,business,public_slug) VALUES($1,$2,$3)',[id,slug,slug]);
    await pool.query(`INSERT INTO account_users(id,subscriber_id,full_name,username,email,phone,country,password_hash)
      VALUES($1,$2,'Finance Owner',$3,$4,'+213555123456','DZ',$5)`,[owner,id,slug,`${slug}@example.invalid`,hash]);
    await pool.query(`INSERT INTO subscriptions(id,subscriber_id,plan_id,status,expires_at,licence_key)
      VALUES($1,$2,$3,'ACTIVE',now()+interval '30 days',$4)`,[randomUUID(),id,plan,randomUUID()]);
    await pool.query("INSERT INTO subscriber_modules(subscriber_id,module_key,enabled) VALUES($1,'ecommerce',true)",[id]);
    await pool.query(`INSERT INTO store_settings(subscriber_id,enabled,title,currency,money_model_version)
      VALUES($1,true,'Fixture Store','USD',2) ON CONFLICT(subscriber_id) DO UPDATE SET enabled=true,money_model_version=2`,[id]);
    await pool.query(`INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,rate,decimals,enabled,client_default,is_base,rate_configured)
      VALUES($1,'USD','US Dollar','$','',1,2,true,true,true,true)
      ON CONFLICT(subscriber_id,code) DO UPDATE SET prefix='$',enabled=true,client_default=true,rate_configured=true`,[id]);
  }
  let newClient;
  for(const [subscriber,email,username] of [[sidA,'new@example.invalid','NewClient'],[sidA,'second@example.invalid','SecondClient'],[sidB,'foreign@example.invalid','ForeignClient']]){
    const row=(await pool.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,client_code,username,preferred_currency)
      VALUES($1,$2,'Finance','Client',$3,$4,$5,$6,'USD') RETURNING *`,
      [randomUUID(),subscriber,email,hash,randomUUID().replaceAll('-','').slice(0,8).toUpperCase(),username])).rows[0];
    if(email==='new@example.invalid')newClient=row;
  }
  // Two historical postings with a net-zero balance. No actor/sequence backfill.
  const legacyClient=(await pool.query('SELECT id FROM public_customer_accounts WHERE subscriber_id=$1',[sidB])).rows[0].id;
  const snapshot=JSON.stringify({code:'USD',name:'US Dollar',prefix:'$',suffix:'',number_format:'1,000.99',decimals:2,rate:'1.000000'});
  for(const [type,direction,after] of [['admin_credit','credit','20000000000'],['admin_debit','debit','0']]){
    await pool.query(`INSERT INTO customer_wallet_ledger
      (id,subscriber_id,customer_id,type,direction,amount_usd_units,amount_account_units,balance_after,currency_snapshot,account_currency_snapshot,
       description,internal_note,created_by_type,created_by_id,reference_type,idempotency_key,request_hash)
      VALUES($1,$2,$3,$4,$5,20000000000,20000000000,$6,$7::jsonb,$7::jsonb,'Historical private reason','Historical private reason','reseller',$8,'manual',$9,'historical')`,
      [randomUUID(),sidB,legacyClient,type,direction,after,snapshot,ownerB,randomUUID()]);
  }
  const historical=(await pool.query('SELECT * FROM customer_wallet_ledger ORDER BY id')).rows;
  const beforeWallets=(await pool.query('SELECT * FROM customer_wallets ORDER BY customer_id')).rows;
  await pool.query('BEGIN');
  await pool.query(await readFile(join(root,'lib/db/src/migrations/025_wallet_attribution_reconciliation.sql'),'utf8'));
  await pool.query('COMMIT');
  await check('migration 025 preserves existing balances, currencies and complete immutable financial rows',async()=>{
    assert.deepEqual((await pool.query('SELECT * FROM customer_wallets ORDER BY customer_id')).rows,beforeWallets);
    const current=(await pool.query('SELECT * FROM customer_wallet_ledger ORDER BY id')).rows;
    for(let i=0;i<historical.length;i++){
      for(const [k,v] of Object.entries(historical[i]))assert.deepEqual(current[i][k],v);
      for(const k of ['actor_display_snapshot','operation_source','posting_sequence','correlation_id','reason','customer_note','correction_of_id'])assert.equal(current[i][k],null);
    }
  });
  const c=await pool.connect();let ownerCookieA,ownerCookieB;
  try{
    ownerCookieA='bhru_session='+await api.createSession(c,{id:ownerA,subscriber_id:sidA,full_name:'Owner A',admin:false});
    ownerCookieB='bhru_session='+await api.createSession(c,{id:ownerB,subscriber_id:sidB,full_name:'Owner B',admin:false});
  }finally{c.release();}
  server=api.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const port=server.address().port;
  // This is an isolated ephemeral HTTP test server, not a managed app workflow.
  const req=(path,{method='GET',body,cookie='',host='bhru.net',headers={}}={})=>new Promise((ok,fail)=>{
    const payload=body===undefined?null:JSON.stringify(body);
    const r=httpRequest({hostname:'127.0.0.1',port,path,method,headers:{
      Host:host,Cookie:cookie,'X-Forwarded-For':`192.0.2.${++requestId%250+1}`,
      'User-Agent':'BHRU focused HTTP test Chrome/120.0',
      ...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),'X-BHRU-Customer-Request':'1','X-BHRU-Request':'1'}:{}),
      ...headers,
    }},res=>{
      let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);res.on('end',()=>{
        let json;try{json=JSON.parse(text);}catch{}
        ok({status:res.statusCode,text,json,headers:res.headers,cookie:(res.headers['set-cookie']||[]).map(s=>s.split(';')[0]).join('; ')});
      });
    });r.on('error',fail);if(payload)r.write(payload);r.end();
  });
  await check('migration 026 creates no historical activity and preserves ledger/wallet history',async()=>{
    const ledger=(await pool.query('SELECT * FROM customer_wallet_ledger ORDER BY id')).rows;
    const wallets=(await pool.query('SELECT * FROM customer_wallets ORDER BY customer_id')).rows;
    await pool.query(await readFile(join(root,'lib/db/src/migrations/026_client_activity_audit.sql'),'utf8'));
    assert.equal((await pool.query('SELECT count(*)::int n FROM client_activity_events')).rows[0].n,0);
    assert.deepEqual((await pool.query('SELECT * FROM customer_wallet_ledger ORDER BY id')).rows,ledger);
    assert.deepEqual((await pool.query('SELECT * FROM customer_wallets ORDER BY customer_id')).rows,wallets);
  });
  await check('migration 027 preserves existing credentials and valid sessions without inventing login history',async()=>{
    const token='a'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
    await pool.query(`INSERT INTO public_customer_sessions(token_hash,subscriber_id,customer_id,expires_at)
      VALUES($1,$2,$3,now()+interval '7 days')`,[hash,sidA,newClient.id]);
    const before=(await pool.query('SELECT token_hash,subscriber_id,customer_id,created_at,expires_at FROM public_customer_sessions ORDER BY token_hash')).rows;
    const accounts=(await pool.query('SELECT * FROM public_customer_accounts ORDER BY id')).rows;
    await pool.query(await readFile(join(root,'lib/db/src/migrations/027_customer_security_sessions.sql'),'utf8'));
    assert.deepEqual((await pool.query('SELECT token_hash,subscriber_id,customer_id,created_at,expires_at FROM public_customer_sessions ORDER BY token_hash')).rows,before);
    assert.deepEqual((await pool.query('SELECT * FROM public_customer_accounts ORDER BY id')).rows,accounts);
    assert.equal((await pool.query('SELECT count(*)::int n FROM customer_login_history')).rows[0].n,0);
    const mac=createHmac('sha256',process.env.SESSION_SECRET).update(`public-customer:${sidA}:${token}`).digest('hex');
    const legacy=await req('/api/public/customer/site-a/panel/security',{cookie:`bhru_customer_site-a=${token}.${mac}`});
    assert.equal(legacy.status,200,legacy.text);assert.equal(legacy.json.sessions.length,1);assert.equal(legacy.json.sessions[0].current,true);
    assert.equal(legacy.json.sessions[0].device,'Unknown device (legacy session)');
  });
  await testWalletServices({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,newClient});
  await testLedgerAttribution({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,newClient});
  await testClientActivity({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,newClient});
  await testCustomerSecurity({req,pool,check,sidA,sidB,ownerCookieA,ownerCookieB,password,newClient,issueResetToken:api.issueResetToken,securityAccount:api.securityAccount});
  await check('customer projections redact legacy internal reasons without changing immutable entries',async()=>{
    const original=(await pool.query("SELECT * FROM customer_wallet_ledger WHERE customer_id=$1 AND type='admin_credit' LIMIT 1",[newClient.id])).rows[0];
    const legacy={...original,reason:null,description:'Private staff reason',internal_note:'Private staff reason\nPrivate staff details'};
    assert.equal(api.ledgerView(legacy).description,'Reseller credit');
    assert.equal(api.ledgerView(legacy,true).description,'Private staff reason');
    assert.ok(!('internalNote' in api.ledgerView(legacy)));
    assert.equal(api.ledgerView({...legacy,description:'Customer-facing note'}).description,'Customer-facing note');
    assert.equal(legacy.description,'Private staff reason');
    assert.deepEqual((await pool.query('SELECT * FROM customer_wallet_ledger WHERE id=$1',[original.id])).rows[0],original);
  });
  await check('customer statement/search never exposes an internal reason used as a legacy description fallback',async()=>{
    const reason='PrivateSentinelForStaffOnly';
    const added=await req(`/api/clients/${newClient.id}/wallet`,{method:'POST',cookie:ownerCookieA,body:{
      operation:'adjustment',direction:'credit',amount:'0.01',reason,method:'Manual adjustment',idempotencyKey:randomUUID(),
    }});
    assert.equal(added.status,200,added.text);
    const login=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:newClient.email,password}});
    assert.equal(login.status,200,login.text);
    const path='/api/public/customer/site-a/panel/statement';
    const visible=await req(path,{cookie:login.cookie});
    const row=visible.json.data.find(e=>e.id===added.json.entry.id);
    assert.equal(row.description,'Wallet adjustment');
    assert.ok(!visible.text.includes(reason));
    assert.equal((await req(path+'?search='+reason,{cookie:login.cookie})).json.data.length,0);
    assert.ok((await req(path+'?search=Wallet%20adjustment',{cookie:login.cookie})).json.data.some(e=>e.id===row.id));
    const stored=(await pool.query('SELECT description,internal_note,reason FROM customer_wallet_ledger WHERE id=$1',[row.id])).rows[0];
    assert.equal(stored.description,'Wallet adjustment');assert.equal(stored.internal_note,'');assert.equal(stored.reason,reason);
  });
  await check('summary reads preserve exact balances, ledger history and immutable account currency',async()=>{
    const before=(await pool.query('SELECT * FROM customer_wallets WHERE subscriber_id=$1 AND customer_id=$2',[sidA,newClient.id])).rows[0];
    const history=(await pool.query('SELECT * FROM customer_wallet_ledger WHERE subscriber_id=$1 AND customer_id=$2 ORDER BY id',[sidA,newClient.id])).rows;
    for(let i=0;i<3;i++)assert.equal((await req(`/api/clients/${newClient.id}/wallet`,{cookie:ownerCookieA})).status,200);
    assert.deepEqual((await pool.query('SELECT * FROM customer_wallets WHERE subscriber_id=$1 AND customer_id=$2',[sidA,newClient.id])).rows[0],before);
    assert.deepEqual((await pool.query('SELECT * FROM customer_wallet_ledger WHERE subscriber_id=$1 AND customer_id=$2 ORDER BY id',[sidA,newClient.id])).rows,history);
    assert.equal(before.accounting_currency,'USD');
    assert.equal((await pool.query('SELECT preferred_currency FROM public_customer_accounts WHERE id=$1',[newClient.id])).rows[0].preferred_currency,'USD');
  });
  await check('Dashboard/Wallet/Statement inline JavaScript and CSP hashes match without browser tests',async()=>{
    new Script(api.PANEL_SCRIPT);
    assert.equal(createHash('sha256').update(api.PANEL_SCRIPT).digest('base64'),api.PANEL_SCRIPT_HASH);
    const login=await req('/api/public/customer/site-a/login',{method:'POST',body:{email:newClient.email,password}});
    assert.equal(login.status,200,login.text);
    for(const page of ['dashboard','wallet','transactions']){
      const res=await req('/site-a/customer/'+page,{cookie:login.cookie});
      assert.equal(res.status,200,res.text);
      assert.ok(res.headers['content-security-policy'].includes('sha256-'+api.PANEL_SCRIPT_HASH));
      assert.ok(!res.text.includes('Due / Credit')&&!res.text.includes('formattedDue'));
      if(page==='transactions')assert.ok(res.text.includes('Account Statement'));
    }
  });
  console.log(`\n${checks} focused finance SQL/HTTP groups passed. No existing database, browser, VPS or deployment used.`);
}finally{
  if(server)await new Promise(r=>server.close(r));
  if(pool)await pool.end();
  if(started)command('pg_ctl',['-D',join(temp,'data'),'-m','immediate','-w','stop']);
  await rm(temp,{recursive:true,force:true});
}
