import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {HttpError} from '../auth';
type Envelope={v:1;keyVersion:1;iv:string;tag:string;ciphertext:string};
export function providerStorageReady(){
  const value=process.env.BHRU_PROVIDER_ENCRYPTION_KEY_V1;
  return !!value&&/^[A-Za-z0-9+/]{43}=$/.test(value)&&Buffer.from(value,'base64').length===32;
}
function key(){
  if(!providerStorageReady())throw new HttpError(503,'Provider encryption is unavailable. Configure BHRU_PROVIDER_ENCRYPTION_KEY_V1.');
  return Buffer.from(process.env.BHRU_PROVIDER_ENCRYPTION_KEY_V1!,'base64');
}
const aad=(sub:string,id:string)=>Buffer.from(`bhru-external-provider:v1:${sub}:${id}`);
export function encryptToken(sub:string,id:string,token:string):Envelope{
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(aad(sub,id));
  const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return {v:1,keyVersion:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function decryptToken(sub:string,id:string,e:Envelope):string{
  const k=key();
  try{
    if(e.v!==1||e.keyVersion!==1)throw Error();
    const iv=Buffer.from(e.iv,'base64'),tag=Buffer.from(e.tag,'base64');
    if(iv.length!==12||tag.length!==16)throw Error();
    const cipher=createDecipheriv('aes-256-gcm',k,iv);
    cipher.setAAD(aad(sub,id));cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(Buffer.from(e.ciphertext,'base64')),cipher.final()]).toString('utf8');
  }catch{throw new HttpError(503,'Stored provider credentials cannot be opened. Replace the credentials or restore the configured key.');}
}
