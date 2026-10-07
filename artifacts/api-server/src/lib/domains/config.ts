import {domainToASCII} from 'node:url';
import {isIP} from 'node:net';
import {parse} from 'tldts';
import {HttpError} from '../auth';

export function normalizeDomain(input: string): string {
  if(!input || input.length>2048 || /[\s\\\u0000-\u001f\u007f]/u.test(input.trim())) throw new HttpError(400,'Enter a valid public domain name.');
  let url: URL;
  if(input.trim().replace(/^https?:\/\//i,'').split(/[/?#]/)[0]!.includes(':'))throw new HttpError(400,'Use a hostname without a port.');
  try { url=new URL(input.includes('://')?input.trim():`https://${input.trim()}`); }
  catch {throw new HttpError(400,'Enter a valid public domain name.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port) throw new HttpError(400,'Use a hostname without credentials or a port.');
  const host=domainToASCII(url.hostname.replace(/\.$/,'')).toLowerCase();
  const p=parse(host,{allowPrivateDomains:true});
  if(isIP(host)||host.length>253||!p.domain||(!p.isIcann&&!p.isPrivate)||
    host.split('.').some(l=>!l||l.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(l)))
    throw new HttpError(400,'Use a registrable public domain or subdomain, not an IP address or public suffix.');
  return host;
}
export function domainConfig(){
  const env=process.env;
  const hosts=(env.BHRU_PLATFORM_HOSTS||'bhru.net,www.bhru.net').split(',').map(h=>normalizeDomain(h.trim()));
  const target=env.BHRU_DOMAIN_CNAME_TARGET?normalizeDomain(env.BHRU_DOMAIN_CNAME_TARGET):'';
  const ips=(env.BHRU_DOMAIN_EDGE_IPS||'').split(',').map(v=>v.trim()).filter(Boolean).map(ip=>isIP(ip)===6?new URL(`http://[${ip}]`).hostname.slice(1,-1):ip);
  if(ips.some(ip=>!isIP(ip)))throw new Error('Invalid BHRU_DOMAIN_EDGE_IPS');
  const limit=Number(env.BHRU_DOMAIN_LIMIT||2);
  if(!Number.isInteger(limit)||limit<0||limit>100)throw new Error('Invalid BHRU_DOMAIN_LIMIT');
  return {enabled:env.BHRU_CUSTOM_DOMAINS_ENABLED!=='false',limit,hosts,target,ips,
    directory:env.BHRU_DOMAIN_TRAEFIK_DIR||'',upstream:env.BHRU_DOMAIN_UPSTREAM||'',
    resolver:env.BHRU_DOMAIN_CERT_RESOLVER||'',web:env.BHRU_DOMAIN_HTTP_ENTRYPOINT||'web',
    secure:env.BHRU_DOMAIN_HTTPS_ENTRYPOINT||'websecure',ready:!!target&&ips.length>0};
}
/** Future plan/add-on adapter. Never use client-submitted allowance or limits. */
export async function domainAllowance(_subscriberId:string){const c=domainConfig();return {enabled:c.enabled,limit:c.limit};}
export function validateCustomerDomain(input:string){
  const host=normalizeDomain(input),c=domainConfig();
  if([...c.hosts,c.target].filter(Boolean).some(h=>host===h||host.endsWith(`.${h}`)))throw new HttpError(400,'This hostname is reserved by BHRU.');
  return host;
}
export function dnsInstructions(host:string,token:string){
  const p=parse(host,{allowPrivateDomains:true}),relative=p.subdomain||'@',c=domainConfig();
  const records=[{type:'TXT',name:relative==='@'?'_bhru-verify':`_bhru-verify.${relative}`,value:`bhru-verification=${token}`,ttl:'300 (5 minutes)'}];
  if(relative!=='@'){
    if(c.target)records.push({type:'CNAME',name:relative,value:c.target,ttl:'300 (5 minutes)'});
  }else for(const ip of c.ips)records.push({type:isIP(ip)===6?'AAAA':'A',name:'@',value:ip,ttl:'300 (5 minutes)'});
  return records;
}
