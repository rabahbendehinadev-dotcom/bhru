import {BlockList,isIP} from 'node:net';
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {HttpError} from '../auth';
export class ProviderError extends Error{
  constructor(public category:'AUTH_FAILED'|'UNREACHABLE'|'INVALID_RESPONSE'|'CONFIGURATION_CHANGED',public retryable=false){super(category);}
}
const blocked=new BlockList();
for(const [ip,prefix] of [
 ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
 ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],
 ['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],
 ['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4],
] as const)blocked.addSubnet(ip,prefix,'ipv4');
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
for(const [ip,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const)blocked.addSubnet(ip,prefix,'ipv6');
export function publicAddress(ip:string){
  const family=isIP(ip);
  return family===4?!blocked.check(ip,'ipv4'):family===6&&global6.check(ip,'ipv6')&&!blocked.check(ip,'ipv6');
}
export function providerUrl(raw:string){
  let url:URL;try{url=new URL(raw);}catch{throw new HttpError(400,'Enter a valid HTTPS Fusion REST API URL.');}
  const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port&&url.port!=='443'||
    !host.includes('.')&&!isIP(host)||/^(localhost|.*\.(localhost|local|internal|lan|home|test|invalid))$/.test(host)||
    isIP(host)&&!publicAddress(host)||url.pathname.replace(/\/+$/,'')!=='/api/reseller/v1')
    throw new HttpError(400,'Use a public HTTPS host on port 443 with API path /api/reseller/v1; no credentials, query or fragment.');
  url.pathname='/api/reseller/v1';return url.toString().replace(/\/$/,'');
}
export async function resolvePublic(host:string){
  if(isIP(host)){if(!publicAddress(host))throw new ProviderError('UNREACHABLE');return {address:host,family:isIP(host)};}
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const records=await Promise.race([lookup(host,{all:true,verbatim:true}),new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>reject(new ProviderError('UNREACHABLE',true)),5000);timer.unref();
    })]);
    if(!records.length||records.some(r=>!publicAddress(r.address)))throw new ProviderError('UNREACHABLE');
    return records[0]!;
  }catch(error){if(error instanceof ProviderError)throw error;throw new ProviderError('UNREACHABLE',true);}
  finally{if(timer)clearTimeout(timer);}
}
/** The only production transport: GET to two fixed read endpoints. No redirects, proxy or socket reuse. */
export async function safeRead(base:string,token:string,path:'account'|'products'){
  if(path!=='account'&&path!=='products')throw new ProviderError('INVALID_RESPONSE');
  const url=new URL(`${providerUrl(base)}/${path}`),host=url.hostname.replace(/^\[|\]$/g,'');
  const destination=await resolvePublic(host);
  return new Promise<string>((resolve,reject)=>{
    let settled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const done=(error?:ProviderError,body?:string)=>{
      if(settled)return;settled=true;if(timer)clearTimeout(timer);
      if(error)reject(error);else resolve(body!);
    };
    const req=request(url,{
      method:'GET',agent:false,rejectUnauthorized:true,
      ...(isIP(host)?{}:{servername:host}),
      // Pin the vetted address in the actual connection; no second DNS lookup.
      lookup:((_hostname:unknown,options:any,callback:any)=>{
        callback(null,options?.all?[destination]:destination.address,destination.family);
      }) as any,
      headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Accept-Encoding':'identity'},
    },res=>{
      const status=res.statusCode??0;
      if(status===401||status===402||status===403){res.destroy();done(new ProviderError('AUTH_FAILED'));return;}
      if(status<200||status>=300){res.destroy();done(new ProviderError(status>=500||status===429?'UNREACHABLE':'INVALID_RESPONSE',status>=500||status===429));return;}
      if(!/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(res.headers['content-type']??'')){res.destroy();done(new ProviderError('INVALID_RESPONSE'));return;}
      if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();done(new ProviderError('INVALID_RESPONSE'));return;}
      const chunks:Buffer[]=[];let bytes=0;
      res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>8*1024*1024){res.destroy();done(new ProviderError('INVALID_RESPONSE'));}else chunks.push(chunk);});
      res.on('end',()=>done(undefined,Buffer.concat(chunks).toString('utf8')));
      res.on('error',()=>done(new ProviderError('UNREACHABLE',true)));
      res.on('aborted',()=>done(new ProviderError('UNREACHABLE',true)));
    });
    req.on('error',()=>done(new ProviderError('UNREACHABLE',true)));
    timer=setTimeout(()=>{done(new ProviderError('UNREACHABLE',true));req.destroy();},20000);timer.unref();
    req.end();
  });
}
