import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {HttpError} from '../auth';
interface Envelope {v:1;iv:string;tag:string;ciphertext:string}
export function credentialStorageReady(){
  const k=process.env.BHRU_GATEWAY_ENCRYPTION_KEY;
  return !!k&&/^[A-Za-z0-9+/]{43}=$/.test(k)&&Buffer.from(k,'base64').length===32;
}
function key(){if(!credentialStorageReady())throw new HttpError(503,'Gateway credential storage is not configured.');return Buffer.from(process.env.BHRU_GATEWAY_ENCRYPTION_KEY!,'base64');}
const aad=(tenant:string,code:string)=>Buffer.from(`bhru-gateway-credentials:v1:${tenant}:${code}`);
export function encryptCredentials(tenant:string,code:string,values:Record<string,string>):Envelope {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(aad(tenant,code));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(values),'utf8'),cipher.final()]);
  return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function decryptCredentials(tenant:string,code:string,envelope:Envelope|null):Record<string,string>{
  if(!envelope)return {};
  const k=key();
  try{
    if(envelope.v!==1)throw Error();
    const decipher=createDecipheriv('aes-256-gcm',k,Buffer.from(envelope.iv,'base64'));
    decipher.setAAD(aad(tenant,code));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString('utf8'));
  }catch{throw new HttpError(503,'Gateway credentials cannot be opened. Contact the administrator.');}
}
