import {BlockList,isIP} from 'node:net';
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {HttpError} from '../auth';
import {logger} from '../logger';
import {legacyMimeDiagnostic,type LegacyDiagnosticCode} from './legacy-diagnostics';
export class ProviderError extends Error{
  readonly upstreamHttpStatus?:number;
  constructor(public category:'AUTH_FAILED'|'AUTHENTICATION_FAILED'|'UNSUPPORTED_PROVIDER'|'UNREACHABLE'|'INVALID_RESPONSE'|'CONFIGURATION_CHANGED',public retryable=false,public diagnosticCode?:LegacyDiagnosticCode,upstreamHttpStatus?:number){
    super(category);
    // Only a numeric HTTP status may leave the transport; never upstream text.
    if(diagnosticCode==='HTTP_FAILURE'&&typeof upstreamHttpStatus==='number'&&
      Number.isInteger(upstreamHttpStatus)&&upstreamHttpStatus>=100&&upstreamHttpStatus<=599)
      this.upstreamHttpStatus=upstreamHttpStatus;
  }
  get safeError(){
    if(!this.diagnosticCode)return this.category;
    return `${this.category}:${this.diagnosticCode}${this.upstreamHttpStatus===undefined?'':`:${this.upstreamHttpStatus}`}`;
  }
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
export function providerUrl(raw:string,protocol='fusion_rest'){
  if(!['fusion_rest','DHRU_FUSION_LEGACY_V61'].includes(protocol))throw new ProviderError('UNSUPPORTED_PROVIDER');
  let url:URL;try{url=new URL(raw);}catch{throw new HttpError(400,'Enter a valid public HTTPS API URL.');}
  const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port&&url.port!=='443'||
    !host.includes('.')&&!isIP(host)||/^(localhost|.*\.(localhost|local|internal|lan|home|test|invalid))$/.test(host)||
    isIP(host)&&!publicAddress(host)||raw.includes('\\')||
    (protocol==='fusion_rest'?url.pathname.replace(/\/+$/,'')!=='/api/reseller/v1':
      !/^\/[a-zA-Z0-9_./-]*$/.test(url.pathname)||/(?:^|\/)\.{1,2}(?:\/|$)/.test(raw)))
    throw new HttpError(400,protocol==='fusion_rest'?
      'Use a public HTTPS host on port 443 with API path /api/reseller/v1; no credentials, query or fragment.':
      'Use the exact public HTTPS Legacy endpoint on port 443; no credentials, query, fragment or encoded path.');
  if(protocol==='fusion_rest'){url.pathname='/api/reseller/v1';return url.toString().replace(/\/$/,'');}
  return url.toString();
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
/** REST can GET only these two endpoints. No paid actions exist in this transport. */
export async function safeRead(base:string,token:string,path:'account'|'products'){
  if(path!=='account'&&path!=='products')throw new ProviderError('INVALID_RESPONSE');
  return sendRead(new URL(`${providerUrl(base)}/${path}`),'GET',{Authorization:`Bearer ${token}`});
}
export type LegacyCredentials={username:string;apiAccessKey:string};
export function legacyCredentials(serialized:string):LegacyCredentials{
  try{
    const v=JSON.parse(serialized);
    if(typeof v.username!=='string'||!v.username.trim()||v.username.length>200||
      typeof v.apiAccessKey!=='string'||!v.apiAccessKey.length||v.apiAccessKey.length>4096||
      /[\x00-\x1f\x7f]/.test(v.username+v.apiAccessKey))throw Error();
    return {username:v.username,apiAccessKey:v.apiAccessKey};
  }catch{throw new ProviderError('INVALID_RESPONSE');}
}
/** Exact reference contract: form POST to configured URL, never URL query credentials. */
export async function safeLegacyRead(base:string,serialized:string,action:'accountinfo'|'imeiservicelist'){
  if(action!=='accountinfo'&&action!=='imeiservicelist')throw new ProviderError('INVALID_RESPONSE');
  const {username,apiAccessKey}=legacyCredentials(serialized);
  // Explicit JSON negotiation from the official Legacy PHP client. The v6.1
  // reference listener ignores this extra field and already returns JSON.
  // This is Legacy-only, not a claim that every real provider requires it.
  const body=new URLSearchParams({username,apiaccesskey:apiAccessKey,action,requestformat:'JSON'}).toString();
  try{return await sendRead(new URL(providerUrl(base,'DHRU_FUSION_LEGACY_V61')),'POST',
    {'Content-Type':'application/x-www-form-urlencoded','Content-Length':String(Buffer.byteLength(body))},body,true);}
  catch(e){
    if(e instanceof ProviderError&&e.category==='AUTH_FAILED')throw new ProviderError('AUTHENTICATION_FAILED',e.retryable,e.diagnosticCode,e.upstreamHttpStatus);
    if(e instanceof ProviderError&&e.category==='UNREACHABLE'&&!e.diagnosticCode)
      throw new ProviderError(e.category,e.retryable,'NETWORK_FAILURE');
    throw e;
  }
}
async function sendRead(url:URL,method:'GET'|'POST',headers:Record<string,string>,body?:string,legacy=false){
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const destination=await resolvePublic(host);
  return new Promise<string>((resolve,reject)=>{
    let settled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const done=(error?:ProviderError,body?:string)=>{
      if(settled)return;settled=true;if(timer)clearTimeout(timer);
      if(error)reject(error);else resolve(body!);
    };
    const req=request(url,{
      method,agent:false,rejectUnauthorized:true,
      ...(isIP(host)?{}:{servername:host}),
      // Pin the vetted address in the actual connection; no second DNS lookup.
      lookup:((_hostname:unknown,options:any,callback:any)=>{
        callback(null,options?.all?[destination]:destination.address,destination.family);
      }) as any,
      headers:{...headers,Accept:'application/json','Accept-Encoding':'identity'},
    },res=>{
      const status=res.statusCode??0;
      if(legacy&&(status<200||status>=300)&&Number.isInteger(status)&&status>=100&&status<=599){
        // Explicit allowlist of fields. No URL, headers, request, response or error object.
        logger.warn({providerProtocol:'DHRU_FUSION_LEGACY_V61',diagnosticCode:'HTTP_FAILURE',upstreamHttpStatus:status},
          'Legacy provider returned an unsuccessful HTTP response');
      }
      if(status===401||status===402||status===403){res.destroy();done(new ProviderError('AUTH_FAILED',false,legacy?'HTTP_FAILURE':undefined,legacy?status:undefined));return;}
      if(status<200||status>=300){res.destroy();done(new ProviderError(status>=500||status===429?'UNREACHABLE':'INVALID_RESPONSE',status>=500||status===429,legacy?'HTTP_FAILURE':undefined,legacy?status:undefined));return;}
      const contentType=res.headers['content-type']??'';
      if(!/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(contentType)){res.destroy();done(new ProviderError('INVALID_RESPONSE',false,legacy?legacyMimeDiagnostic(contentType):undefined));return;}
      if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();done(new ProviderError('INVALID_RESPONSE',false,legacy?'UNSUPPORTED_CONTENT_ENCODING':undefined));return;}
      const chunks:Buffer[]=[];let bytes=0;
      res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>8*1024*1024){res.destroy();done(new ProviderError('INVALID_RESPONSE',false,legacy?'RESPONSE_TOO_LARGE':undefined));}else chunks.push(chunk);});
      res.on('end',()=>done(undefined,Buffer.concat(chunks).toString('utf8')));
      res.on('error',()=>done(new ProviderError('UNREACHABLE',true)));
      res.on('aborted',()=>done(new ProviderError('UNREACHABLE',true)));
    });
    req.on('error',()=>done(new ProviderError('UNREACHABLE',true)));
    timer=setTimeout(()=>{done(new ProviderError('UNREACHABLE',true));req.destroy();},20000);timer.unref();
    req.end(body);
  });
}
