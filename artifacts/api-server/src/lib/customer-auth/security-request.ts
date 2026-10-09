import { isIP } from 'node:net';
import type { Request } from 'express';

/** Express's existing trusted proxy policy determines req.ip; never parse XFF ourselves. */
export function securityRequest(req?: Request) {
  const ip = req?.ip;
  const ua = req?.get('user-agent')?.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,500) ?? null;
  let browser = 'Unknown browser',device = 'Desktop';
  if(ua){
    browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other browser';
    device=/iPad|Tablet/i.test(ua)?'Tablet':/Mobile|Android|iPhone/i.test(ua)?'Mobile':'Desktop';
  }
  return {ip:ip&&isIP(ip)?ip:null,ua,device:ua?`${browser} · ${device}`:'Unknown device'};
}
