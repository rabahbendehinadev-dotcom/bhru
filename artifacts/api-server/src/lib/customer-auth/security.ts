import { createHash,randomBytes,randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { PoolClient } from '@workspace/db';
import { hashPassword,verifyPassword } from '@workspace/db/security';
import { z } from '@workspace/api-zod';
import { HttpError,rateLimit } from '../auth';
import { transaction } from '../platform';
import { activityContext,CLIENT_ACTIVITY_TYPES } from './activity';
import { securityRequest } from './security-request';
import { customerContext,customerCsrf } from './service';

const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const password=z.string().min(8).max(128);
export const passwordChangeInput=z.object({currentPassword:z.string().min(1).max(128),newPassword:password,confirmPassword:password}).strict();
export const resetInput=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),newPassword:password,confirmPassword:password}).strict();
export const forgotInput=z.object({identifier:z.string().trim().min(1).max(254)}).strict();
export const RECOVERY_MESSAGE='Password recovery email delivery is not configured. Contact your reseller for assistance. No email has been sent.';
export async function securityEvent(db:PoolClient,sub:string,id:string,type:keyof typeof CLIENT_ACTIVITY_TYPES,key:string){
  if(CLIENT_ACTIVITY_TYPES[type]!=='SECURITY')throw new Error('Not a security event');
  await db.query("SELECT emit_client_activity($1,$2,$3,'SECURITY','customer_account',$2,$4)",[sub,id,type,`${type}:${key}`]);
}
export async function securityAccount(db:PoolClient,sub:string,id:string){
  const row=(await db.query('SELECT * FROM public_customer_accounts WHERE subscriber_id=$1 AND id=$2 FOR UPDATE',[sub,id])).rows[0];
  if(!row)throw new HttpError(404,'Client not found.');
  return row;
}
async function authenticated(db:PoolClient,req:Request){
  const {tenant,customer,sessionHash}=customerContext(req);
  if(!customer||!sessionHash)throw new HttpError(401,'Sign in to manage security.');
  const account=await securityAccount(db,tenant.id,customer.id);
  const session=(await db.query(`SELECT session_public_id FROM public_customer_sessions WHERE subscriber_id=$1 AND customer_id=$2
    AND token_hash=$3 AND revoked_at IS NULL AND expires_at>now()`,[tenant.id,customer.id,sessionHash])).rows[0];
  if(!account.enabled||!session)throw new HttpError(401,'Sign in to manage security.');
  await activityContext(db,tenant.id,customer.id,{type:'customer',id:customer.id},'',req);
  return {sub:tenant.id,id:customer.id,hash:sessionHash,account};
}
export async function securityView(sub:string,id:string,db:PoolClient,currentHash?:string){
  const a=(await db.query('SELECT enabled,last_login_at FROM public_customer_accounts WHERE subscriber_id=$1 AND id=$2',[sub,id])).rows[0];
  if(!a)throw new HttpError(404,'Client not found.');
  const state=(await db.query('SELECT locked_until,password_changed_at FROM customer_security_state WHERE subscriber_id=$1 AND customer_id=$2',[sub,id])).rows[0];
  const successful=(await db.query(`SELECT created_at,ip_address FROM customer_login_history WHERE subscriber_id=$1 AND customer_id=$2
    AND result='success' ORDER BY created_at DESC,id DESC LIMIT 1`,[sub,id])).rows[0];
  const sessions=(await db.query(`SELECT session_public_id,token_hash=$3 AS current,device_label,ip_address,created_at,last_seen_at,expires_at,
    count(*) OVER()::integer AS total FROM public_customer_sessions WHERE subscriber_id=$1 AND customer_id=$2
    AND revoked_at IS NULL AND expires_at>now() ORDER BY current DESC,created_at DESC,session_public_id DESC LIMIT 50`,[sub,id,currentHash??''])).rows;
  const history=(await db.query(`SELECT id,created_at,result,ip_address,device_label FROM customer_login_history WHERE subscriber_id=$1
    AND customer_id=$2 ORDER BY created_at DESC,id DESC LIMIT 30`,[sub,id])).rows;
  return {enabled:a.enabled,lastLoginAt:successful?.created_at??a.last_login_at,lastLoginIp:successful?.ip_address??null,
    lastLoginSource:successful?'history':a.last_login_at?'legacy':null,passwordChangedAt:state?.password_changed_at??null,
    lockedUntil:state?.locked_until&&new Date(state.locked_until).getTime()>Date.now()?state.locked_until:null,
    activeSessionCount:sessions[0]?.total??0,
    sessions:sessions.map(s=>({id:s.session_public_id,current:s.current,device:s.device_label??'Unknown device (legacy session)',
      ipAddress:s.ip_address,createdAt:s.created_at,lastSeenAt:s.last_seen_at,expiresAt:s.expires_at,status:'active' as const})),
    history:history.map(h=>({id:h.id,createdAt:h.created_at,result:h.result,ipAddress:h.ip_address,device:h.device_label}))};
}
export async function customerSecurity(req:Request){
  return transaction(async db=>{const a=await authenticated(db,req);return securityView(a.sub,a.id,db,a.hash);});
}
export async function changePassword(req:Request){
  customerCsrf(req);
  const input=passwordChangeInput.parse(req.body);
  if(input.newPassword!==input.confirmPassword)throw new HttpError(400,'Passwords do not match.');
  const ctx=customerContext(req);
  await rateLimit(`customer-security:password:${ctx.tenant.id}:${ctx.customer?.id}`,10);
  return transaction(async db=>{
    const a=await authenticated(db,req);
    if(!await verifyPassword(input.currentPassword,a.account.password_hash))throw new HttpError(400,'Current password is incorrect.');
    if(await verifyPassword(input.newPassword,a.account.password_hash))throw new HttpError(400,'Choose a password different from your current password.');
    const hash=await hashPassword(input.newPassword);
    await db.query('UPDATE public_customer_accounts SET password_hash=$3 WHERE subscriber_id=$1 AND id=$2',[a.sub,a.id,hash]);
    await db.query(`INSERT INTO customer_security_state(subscriber_id,customer_id,password_changed_at) VALUES($1,$2,now())
      ON CONFLICT(subscriber_id,customer_id) DO UPDATE SET password_changed_at=now()`,[a.sub,a.id]);
    await db.query(`UPDATE public_customer_sessions SET revoked_at=now() WHERE subscriber_id=$1 AND customer_id=$2
      AND token_hash<>$3 AND revoked_at IS NULL`,[a.sub,a.id,a.hash]);
    await db.query('UPDATE customer_password_resets SET used_at=now() WHERE subscriber_id=$1 AND customer_id=$2 AND used_at IS NULL',[a.sub,a.id]);
    await securityEvent(db,a.sub,a.id,'password_changed',randomUUID());
    return {ok:true};
  });
}
/** Internal delivery boundary, NEVER a public token-returning endpoint. Caller holds account lock. */
export async function issueResetToken(db:PoolClient,sub:string,id:string,req?:Request){
  const token=randomBytes(32).toString('hex'),key=randomUUID();
  await db.query('UPDATE customer_password_resets SET used_at=now() WHERE subscriber_id=$1 AND customer_id=$2 AND used_at IS NULL',[sub,id]);
  await db.query(`INSERT INTO customer_password_resets(id,subscriber_id,customer_id,token_hash,expires_at)
    VALUES($1,$2,$3,$4,now()+interval '30 minutes')`,[key,sub,id,digest(token)]);
  await activityContext(db,sub,id,{type:'system',id:null},'',req);
  await securityEvent(db,sub,id,'password_reset_requested',key);
  return token;
}
export async function forgotPassword(req:Request){
  customerCsrf(req);const {tenant}=customerContext(req),input=forgotInput.parse(req.body);
  await rateLimit(`customer-security:forgot:ip:${req.ip}`,10);
  await rateLimit(`customer-security:forgot:${tenant.id}:${digest(input.identifier.toLowerCase())}`,3);
  await transaction(async db=>{
    const row=(await db.query(`SELECT id,enabled FROM public_customer_accounts WHERE subscriber_id=$1
      AND (email=$2 OR lower(username)=$2 OR lower(client_code)=$2) FOR UPDATE`,[tenant.id,input.identifier.toLowerCase()])).rows[0];
    if(row?.enabled)await issueResetToken(db,tenant.id,row.id,req);
    // No configured sender: do not return/log tokens or pretend to have delivered one.
  });
  return {message:RECOVERY_MESSAGE,deliveryAvailable:false};
}
export async function resetPassword(req:Request){
  customerCsrf(req);const {tenant}=customerContext(req),input=resetInput.parse(req.body);
  if(input.newPassword!==input.confirmPassword)throw new HttpError(400,'Passwords do not match.');
  await rateLimit(`customer-security:reset:ip:${req.ip}`,20);
  const invalid=()=>new HttpError(400,'Reset link is invalid or expired.');
  return transaction(async db=>{
    const match=(await db.query('SELECT customer_id FROM customer_password_resets WHERE subscriber_id=$1 AND token_hash=$2',[tenant.id,digest(input.token)])).rows[0];
    if(!match)throw invalid();
    const a=await securityAccount(db,tenant.id,match.customer_id);
    const reset=(await db.query(`SELECT id FROM customer_password_resets WHERE subscriber_id=$1 AND customer_id=$2
      AND token_hash=$3 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,[tenant.id,a.id,digest(input.token)])).rows[0];
    if(!reset||!a.enabled)throw invalid();
    if(await verifyPassword(input.newPassword,a.password_hash))throw new HttpError(400,'Choose a password different from your current password.');
    const hash=await hashPassword(input.newPassword);
    await db.query('UPDATE public_customer_accounts SET password_hash=$3 WHERE subscriber_id=$1 AND id=$2',[tenant.id,a.id,hash]);
    await db.query(`INSERT INTO customer_security_state(subscriber_id,customer_id,password_changed_at) VALUES($1,$2,now())
      ON CONFLICT(subscriber_id,customer_id) DO UPDATE SET password_changed_at=now(),failed_count=0,failure_window_started_at=NULL,locked_until=NULL`,[tenant.id,a.id]);
    await db.query('UPDATE customer_password_resets SET used_at=now() WHERE subscriber_id=$1 AND customer_id=$2 AND used_at IS NULL',[tenant.id,a.id]);
    await db.query('UPDATE public_customer_sessions SET revoked_at=now() WHERE subscriber_id=$1 AND customer_id=$2 AND revoked_at IS NULL',[tenant.id,a.id]);
    await activityContext(db,tenant.id,a.id,{type:'customer',id:a.id},'',req);
    await securityEvent(db,tenant.id,a.id,'password_reset_completed',reset.id);
    return {ok:true};
  });
}
export async function revokeSession(req:Request,publicId?:string){
  customerCsrf(req);z.object({}).strict().parse(req.body);
  return transaction(async db=>{
    const a=await authenticated(db,req);
    if(publicId){
      const target=(await db.query('SELECT token_hash,revoked_at FROM public_customer_sessions WHERE subscriber_id=$1 AND customer_id=$2 AND session_public_id=$3',[a.sub,a.id,z.string().uuid().parse(publicId)])).rows[0];
      if(!target)throw new HttpError(404,'Session not found.');
      if(target.token_hash===a.hash)throw new HttpError(409,'Use Logout to sign out your current session.');
    }
    const changed=await db.query(`UPDATE public_customer_sessions SET revoked_at=now() WHERE subscriber_id=$1 AND customer_id=$2
      AND token_hash<>$3 AND revoked_at IS NULL AND expires_at>now() AND ($4::uuid IS NULL OR session_public_id=$4) RETURNING session_public_id`,
      [a.sub,a.id,a.hash,publicId??null]);
    if(changed.rowCount)await securityEvent(db,a.sub,a.id,publicId?'session_revoked':'all_other_sessions_revoked',publicId?`session:${publicId}:revoked`:randomUUID());
    return {ok:true,affected:changed.rowCount??0};
  });
}
export async function forceLogout(sub:string,id:string,owner:string,db:PoolClient){
  await securityAccount(db,sub,id);
  const changed=await db.query(`UPDATE public_customer_sessions SET revoked_at=now() WHERE subscriber_id=$1 AND customer_id=$2
    AND revoked_at IS NULL AND expires_at>now() RETURNING session_public_id`,[sub,id]);
  if(changed.rowCount){
    await activityContext(db,sub,id,{type:'subscriber_owner',id:owner});
    await securityEvent(db,sub,id,'reseller_force_logout',randomUUID());
  }
  return {ok:true,affected:changed.rowCount??0};
}
