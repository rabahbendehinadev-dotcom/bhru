import {createHash,randomUUID} from 'node:crypto';
import type {Request} from 'express';
import {verifyPassword,dummyHash} from '@workspace/db/security';
import {HttpError,rateLimit} from '../auth';
import {transaction} from '../platform';
import {customerContext,customerCsrf,loginInput} from './service';
import {CUSTOMER_PROFILE_SELECT,effectiveCustomerProfile} from './profile';
import type {CustomerIdentity} from './types';
import {createCustomerSession} from './session';
import {customerLinks} from './links';
import {activityContext} from './activity';
import {securityEvent} from './security';
import {securityRequest} from './security-request';

/** Account row locks serialize canonical account attempts across email/username/code aliases. */
export async function secureLogin(req:Request){
  customerCsrf(req);
  const {tenant,sessionHash}=customerContext(req),input=loginInput(req.body),info=securityRequest(req);
  await rateLimit(`public-customer:login:${req.ip}`,60);
  await rateLimit(`public-customer:login:${tenant.id}:${input.email}`,10);
  const result=await transaction(async db=>{
    const row=(await db.query(`SELECT ${CUSTOMER_PROFILE_SELECT},c.password_hash,c.enabled
      FROM public_customer_accounts c WHERE c.subscriber_id=$1 AND
      (c.email=$2 OR lower(c.username)=$2 OR lower(c.client_code)=$2) FOR UPDATE OF c`,[tenant.id,input.email])).rows[0] as (CustomerIdentity&{password_hash:string;enabled:boolean})|undefined;
    const valid=await verifyPassword(input.password,row?.password_hash||dummyHash);
    if(!row)return {denied:true as const};
    await db.query(`INSERT INTO customer_security_state(subscriber_id,customer_id) VALUES($1,$2)
      ON CONFLICT(subscriber_id,customer_id) DO NOTHING`,[tenant.id,row.id]);
    const state=(await db.query(`SELECT *,locked_until>now() AS locked,
      failure_window_started_at>now()-interval '15 minutes' AS in_window
      FROM customer_security_state WHERE subscriber_id=$1 AND customer_id=$2`,[tenant.id,row.id])).rows[0];
    let status='success',newLock=false,token:string|undefined;
    if(!row.enabled)status='blocked';
    else if(state.locked)status='locked';
    else if(!valid){
      status='failed';
      const count=(state.in_window?state.failed_count:0)+1;
      newLock=count>=5;
      await db.query(`UPDATE customer_security_state SET failed_count=$3,
        failure_window_started_at=CASE WHEN $4 THEN failure_window_started_at ELSE now() END,
        locked_until=CASE WHEN $5 THEN now()+interval '15 minutes' ELSE NULL END
        WHERE subscriber_id=$1 AND customer_id=$2`,[tenant.id,row.id,count,!!state.in_window,newLock]);
    }else{
      await db.query(`UPDATE customer_security_state SET failed_count=0,failure_window_started_at=NULL,locked_until=NULL
        WHERE subscriber_id=$1 AND customer_id=$2`,[tenant.id,row.id]);
      token=await createCustomerSession(db,tenant,row,sessionHash,req);
      row.lastLoginAt=(await db.query(`UPDATE public_customer_accounts SET last_login_at=now()
        WHERE subscriber_id=$1 AND id=$2 RETURNING last_login_at`,[tenant.id,row.id])).rows[0].last_login_at;
      await db.query("INSERT INTO public_customer_activity(id,subscriber_id,customer_id,action) VALUES($1,$2,$3,'login')",[randomUUID(),tenant.id,row.id]);
    }
    const publicSession=token?(await db.query('SELECT session_public_id FROM public_customer_sessions WHERE token_hash=$1',
      [createHash('sha256').update(token.split('.')[0]!).digest('hex')])).rows[0]?.session_public_id:null;
    const key=randomUUID();
    await db.query(`INSERT INTO customer_login_history(id,subscriber_id,customer_id,result,session_public_id,ip_address,user_agent,device_label)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[key,tenant.id,row.id,status,publicSession,info.ip,info.ua,info.device]);
    await activityContext(db,tenant.id,row.id,status==='success'?{type:'customer',id:row.id}:{type:'system',id:null},'',req);
    await securityEvent(db,tenant.id,row.id,status==='success'?'login_success':'login_failed',key);
    if(newLock)await securityEvent(db,tenant.id,row.id,'login_locked',`${key}:locked`);
    if(!token)return {denied:true as const};
    return {token,customer:await effectiveCustomerProfile(row,db),next:customerLinks(tenant.slug,tenant.customRoot).accountHref};
  });
  // Denials are returned AFTER commit: throwing inside the transaction would erase attempts/lockout.
  if('denied' in result)throw new HttpError(401,'Invalid email or password.');
  return result;
}
