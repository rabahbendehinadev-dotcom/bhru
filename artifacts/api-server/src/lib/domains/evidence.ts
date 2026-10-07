import {Resolver} from 'node:dns/promises';
import https from 'node:https';
import {createHmac,randomBytes} from 'node:crypto';
import {domainConfig} from './config';

export type DomainRow={id:string;subscriber_id:string;hostname:string;verification_token:string;verification_status:string;dns_status:string;tls_status:string;is_primary:boolean;created_at:Date;verified_at:Date|null;last_checked_at:Date|null;dns_checked_at:Date|null;last_error:string|null};
export const domainProof=(row:Pick<DomainRow,'id'|'verification_token'>,nonce:string)=>{
  const key=process.env.SESSION_SECRET;if(!key)throw new Error('SESSION_SECRET required for domain attestation');
  return createHmac('sha256',key).update(`bhru-domain:${row.id}:${row.verification_token}:${nonce}`).digest('hex');
};
export type DnsEvidence={txt:string[][];cname:string[];addresses:string[]};
export function evaluateDns(row:DomainRow,e:DnsEvidence,c=domainConfig()){
  const ownership=e.txt.some(parts=>parts.join('')===`bhru-verification=${row.verification_token}`);
  const routes=c.ready&&e.addresses.length>0&&e.addresses.every(ip=>c.ips.includes(ip.includes(':')?new URL(`http://[${ip}]`).hostname.slice(1,-1):ip));
  return {ownership,routes,error:!ownership?'The ownership TXT record is missing or does not match.':!c.ready?'BHRU DNS infrastructure is not configured yet.':!routes?'DNS must resolve only to the BHRU edge addresses. Check CNAME/A records and remove conflicting AAAA records.':null};
}
export async function collectDns(row:DomainRow){
  const r=new Resolver({timeout:3000,tries:1});
  async function optional<T>(f:()=>Promise<T[]>):Promise<T[]>{
    try{return await f();}catch(e){if(['ENODATA','ENOTFOUND'].includes((e as {code?:string}).code||''))return [];throw e;}
  }
  const [txt,cname,a,aaaa]=await Promise.all([
    optional(()=>r.resolveTxt(`_bhru-verify.${row.hostname}`)),optional(()=>r.resolveCname(row.hostname)),
    optional(()=>r.resolve4(row.hostname)),optional(()=>r.resolve6(row.hostname))]);
  return evaluateDns(row,{txt,cname,addresses:[...a,...aaaa]});
}
/** Connect only to operator-configured edge IPs, never a customer-controlled DNS destination.
 * Node validates the public certificate chain AND the original hostname (SNI).
 * A matching BHRU challenge also proves the router targets THIS application.
 */
export async function probeTLS(row:DomainRow):Promise<boolean>{
  const ips=domainConfig().ips;if(!ips.length)return false;
  for(const ip of ips){
    const nonce=randomBytes(16).toString('hex');
    const ok=await new Promise<boolean>(resolve=>{
      const req=https.request({hostname:ip,port:443,servername:row.hostname,method:'GET',
        path:`/.well-known/bhru-domain/${row.id}?nonce=${nonce}`,headers:{Host:row.hostname},rejectUnauthorized:true,
        checkServerIdentity:(_host,cert)=>requireIdentity(row.hostname,cert)},
      res=>{let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;if(body.length>128){req.destroy();resolve(false);}});
        res.on('error',()=>resolve(false));res.on('end',()=>resolve(res.statusCode===200&&body===domainProof(row,nonce)));});
      const timer=setTimeout(()=>{req.destroy();resolve(false);},6000);
      req.on('close',()=>clearTimeout(timer));req.on('error',()=>resolve(false));req.end();
    });
    if(!ok)return false;
  }
  return true;
}
import {checkServerIdentity as requireIdentity} from 'node:tls';
