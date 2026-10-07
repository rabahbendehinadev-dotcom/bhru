import {mkdir,writeFile,rename} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {pool,type PoolClient} from '@workspace/db';
import {domainConfig} from './config';
import {verifyDomain} from './service';
import {logger} from '../logger';
import type {DomainRow} from './evidence';

export function traefikDocument(rows:Pick<DomainRow,'id'|'hostname'>[],c=domainConfig()){
  const upstream=new URL(c.upstream);
  if(!['http:','https:'].includes(upstream.protocol)||upstream.username||upstream.password)throw new Error('Invalid domain upstream');
  if(!c.resolver||![c.resolver,c.web,c.secure].every(s=>/^[a-zA-Z0-9_-]+$/.test(s)))throw new Error('Configure valid Traefik entrypoints/certificate resolver');
  const routers:Record<string,unknown>={};
  for(const row of rows){
    // Hostnames originate from validated canonical registry records, not templates.
    if(!/^[a-z0-9.-]+$/.test(row.hostname))throw new Error('Invalid registry hostname');
    const key=`bhru-cd-${row.id}`;
    routers[key]={rule:`Host(\`${row.hostname}\`)`,entryPoints:[c.secure],service:'bhru-custom-domain-app',tls:{certResolver:c.resolver}};
    routers[`${key}-http`]={rule:`Host(\`${row.hostname}\`)`,entryPoints:[c.web],service:'bhru-custom-domain-app',middlewares:['bhru-custom-domain-https']};
  }
  return {http:{routers,services:{'bhru-custom-domain-app':{loadBalancer:{passHostHeader:true,servers:[{url:upstream.href}]}}},
    middlewares:{'bhru-custom-domain-https':{redirectScheme:{scheme:'https',permanent:true}}}}};
}
let running=false;
export async function domainControllerTick(){
  if(running)return;running=true;
  let client:PoolClient|undefined;let locked=false;
  try{
    client=await pool.connect();
    locked=(await client.query('SELECT pg_try_advisory_lock(72641,18) AS locked')).rows[0].locked;if(!locked)return;
    const c=domainConfig();
    if(c.directory){
      if(!isAbsolute(c.directory))throw new Error('BHRU_DOMAIN_TRAEFIK_DIR must be absolute');
      const rows=c.enabled?(await client.query(`SELECT d.id,d.hostname FROM subscriber_custom_domains d JOIN subscriptions s ON s.subscriber_id=d.subscriber_id
        WHERE d.verification_status='verified' AND d.dns_status='ready' AND d.dns_checked_at>now()-interval '24 hours'
        AND s.status IN ('ACTIVE','TRIAL') AND s.expires_at>now() AND s.licence_key IS NOT NULL AND s.plan_id IS NOT NULL ORDER BY d.id`)).rows:[];
      const text=JSON.stringify(traefikDocument(rows,c),null,2);
      {
        await mkdir(c.directory,{recursive:true,mode:0o750});
        // JSON is valid YAML. Only this dedicated file is owned by this writer.
        const dest=join(c.directory,'bhru-custom-domains.yml'),temp=join(c.directory,`.bhru-custom-domains-${process.pid}.tmp`);
        await writeFile(temp,text,{mode:0o640});await rename(temp,dest);
      }
    }
    if(c.enabled&&c.ready){
      const rows=(await client.query(`SELECT * FROM subscriber_custom_domains WHERE verification_status='verified'
        ORDER BY last_checked_at NULLS FIRST LIMIT 20`)).rows as DomainRow[];
      for(let i=0;i<rows.length;i+=4)await Promise.all(rows.slice(i,i+4).map(async row=>{
        try{await verifyDomain(row.subscriber_id,row.id,!row.dns_checked_at||Date.now()-row.dns_checked_at.getTime()>3600000);}
        catch(e){logger.warn({domainId:row.id,code:(e as {code?:string}).code??'CHECK_FAILED'},'Custom domain check failed');}
      }));
    }
  }finally{try{if(locked&&client)await client.query('SELECT pg_advisory_unlock(72641,18)');}finally{client?.release();running=false;}}
}
export function startDomainController(){
  // No network work in unconfigured Development; no fabricated TLS state.
  if(!domainConfig().ready&&!domainConfig().directory)return;
  const tick=()=>void domainControllerTick().catch(()=>logger.error({code:'DOMAIN_CONTROLLER'},'Custom domain controller failed; check its configuration'));
  tick();setInterval(tick,30000).unref();
}
