import express,{type Request,type Response,type NextFunction} from 'express';
import {resolve} from 'node:path';
import {pool} from '@workspace/db';
import {domainConfig,normalizeDomain} from './config';
import {domainProof,type DomainRow} from './evidence';
import {domainActive} from './service';
import {tryCommerceDocument} from '../commerce/navigation';
import {resolvePublicDocument,writePublicDocument} from '../public-site';

export function requestHost(value:unknown):string|null{
  if(typeof value!=='string'||!value||/[\s/@\\?#,]/u.test(value))return null;
  try{
    const url=new URL(`http://${value}`);
    return url.hostname.replace(/\.$/,'').toLowerCase();
  }catch{return null;}
}
const sharedStatic=express.static(resolve(import.meta.dirname,'public'),{index:false,dotfiles:'deny'});
export async function customDomainGateway(req:Request,res:Response,next:NextFunction){
  if(req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()==='host').length!==1){res.status(400).end();return;}
  const host=requestHost(req.headers.host);if(!host){res.status(400).end();return;}
  const c=domainConfig();
  // Host is the original Host preserved by Traefik. Never use req.hostname,
  // X-Forwarded-Host or any tenant identity header for custom-domain selection.
  if(c.hosts.includes(host)){next();return;}
  const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'');
  if(loopback&&['127.0.0.1','localhost','[::1]'].includes(host)&&req.path==='/healthz'){next();return;}
  if(process.env.NODE_ENV!=='production'){
    const devHosts=[process.env.REPLIT_DEV_DOMAIN,...(process.env.REPLIT_DOMAINS||'').split(','),'localhost','127.0.0.1','[::1]'];
    if(devHosts.includes(host)){next();return;}
  }
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Host');
  if(!c.enabled){res.status(404).end();return;}
  try{if(normalizeDomain(host)!==host){res.status(404).end();return;}}catch{res.status(404).end();return;}
  const row=(await pool.query(`SELECT d.*,s.public_slug FROM subscriber_custom_domains d
    JOIN subscribers s ON s.id=d.subscriber_id WHERE d.hostname=$1`,[host])).rows[0] as (DomainRow&{public_slug:string})|undefined;
  if(!row){res.status(404).end();return;}
  if(['GET','HEAD'].includes(req.method)&&req.path===`/.well-known/bhru-domain/${row.id}`&&
    row.verification_status==='verified'&&row.dns_status==='ready'&&row.dns_checked_at&&Date.now()-row.dns_checked_at.getTime()<86400000){
    const nonce=req.query.nonce;
    if(typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce)){res.status(400).end();return;}
    res.type('text/plain').send(domainProof(row,nonce));return;
  }
  if(!domainActive(row)){res.status(404).end();return;}
  // No fallback to application/login/private routes or another public slug.
  if(req.path.startsWith(`/api/public/commerce/${row.public_slug}/`)){next();return;}
  const media=/^\/api\/public\/media\/([a-f0-9-]{36})\.(png|jpg)$/.exec(req.path);
  if(media&&['GET','HEAD'].includes(req.method)){
    const own=(await pool.query('SELECT id FROM public_site_assets WHERE id=$1 AND subscriber_id=$2',[media[1],row.subscriber_id])).rows[0];
    if(own){next();return;}res.status(404).end();return;
  }
  if(['GET','HEAD'].includes(req.method)&&/^\/(assets|brand)\//.test(req.path)){sharedStatic(req,res,()=>res.status(404).end());return;}
  if(!['GET','HEAD'].includes(req.method)||!/^\/(?:product\/[a-z0-9]+(?:-[a-z0-9]+)*|cart|checkout|confirmation)?$/.test(req.path)){res.status(404).end();return;}
  const internal=`/${row.public_slug}${req.path==='/'?'':req.path}`;
  if(await tryCommerceDocument(req,res,internal,true))return;
  if(req.path!=='/'){res.status(404).end();return;}
  writePublicDocument(req,res,await resolvePublicDocument(internal));
}
