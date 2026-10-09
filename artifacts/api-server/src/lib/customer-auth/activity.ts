import { isIP } from 'node:net';
import type { Request } from 'express';
import type { PoolClient } from '@workspace/db';
import { z } from '@workspace/api-zod';
import { HttpError } from '../auth';
import { money } from '../client-finance/wallet';

/** Mirrors the database's closed registry. Reserved API/PAYMENT/VERIFICATION are not emitted. */
export const CLIENT_ACTIVITY_TYPES = {
  account_created:'ACCOUNT',account_blocked:'ACCOUNT',account_unblocked:'ACCOUNT',
  profile_updated:'PROFILE',client_note_added:'PROFILE',
  wallet_funds_added:'FINANCIAL',wallet_deducted:'FINANCIAL',wallet_adjusted:'FINANCIAL',
  service_order_charged:'FINANCIAL',service_order_refunded:'FINANCIAL',
  service_order_created:'ORDER',service_order_processing:'ORDER',service_order_completed:'ORDER',service_order_rejected:'ORDER',
  customer_logged_out:'SECURITY',
  login_success:'SECURITY',login_failed:'SECURITY',login_locked:'SECURITY',
  password_changed:'SECURITY',password_reset_requested:'SECURITY',password_reset_completed:'SECURITY',
  session_revoked:'SECURITY',all_other_sessions_revoked:'SECURITY',reseller_force_logout:'SECURITY',
} as const;
export const activityQuery = z.object({
  category:z.enum(['ACCOUNT','PROFILE','FINANCIAL','ORDER','SECURITY']).optional(),
  cursor:z.string().max(100).optional(),
}).strict();
type Actor = {type:'customer'|'subscriber_owner'|'system';id:string|null};
export async function activityContext(db:PoolClient,sub:string,customer:string,actor:Actor,reason='',req?:Request) {
  const ua=req?.get('user-agent')?.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,500);
  await db.query("SELECT set_config('bhru.activity_context',$1,true)",[JSON.stringify({
    subscriber_id:sub,customer_id:customer,actor_type:actor.type,actor_id:actor.id,reason,
    ...(req?.ip&&isIP(req.ip)?{ip_address:req.ip}:{}),...(ua?{user_agent:ua}:{}),
  })]);
}
export async function listActivity(sub:string,customer:string,raw:unknown,db:PoolClient) {
  const q=activityQuery.parse(raw);
  if(!(await db.query('SELECT 1 FROM public_customer_accounts WHERE subscriber_id=$1 AND id=$2',[sub,customer])).rowCount)
    throw new HttpError(404,'Client not found.');
  let date:string|null=null,id:string|null=null;
  if(q.cursor){
    const parts=q.cursor.split('|');
    if(parts.length!==2||!z.string().uuid().safeParse(parts[1]).success||!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(parts[0]!))
      throw new HttpError(400,'Invalid activity cursor.');
    if(!Number.isFinite(Date.parse(parts[0]!)))throw new HttpError(400,'Invalid activity cursor.');
    [date,id]=parts as [string,string];
  }
  const rows=(await db.query(`SELECT e.*,to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,
    l.amount_account_units::text,l.direction,l.account_currency_snapshot,l.reason AS ledger_reason,
    o.reference AS order_reference
    FROM client_activity_events e
    LEFT JOIN customer_wallet_ledger l ON e.reference_type='wallet_ledger_entry' AND l.subscriber_id=e.subscriber_id
      AND l.customer_id=e.customer_id AND l.id=e.reference_id
    LEFT JOIN service_orders o ON e.reference_type='service_order' AND o.subscriber_id=e.subscriber_id
      AND o.customer_id=e.customer_id AND o.id=e.reference_id
    WHERE e.subscriber_id=$1 AND e.customer_id=$2 AND ($3::text IS NULL OR e.event_category=$3)
      AND ($4::timestamptz IS NULL OR (e.created_at,e.id)<($4::timestamptz,$5::uuid))
    ORDER BY e.created_at DESC,e.id DESC LIMIT 31`,[sub,customer,q.category??null,date,id])).rows;
  const visible=rows.slice(0,30),last=visible.at(-1);
  return {data:visible.map(row=>({
    id:row.id,eventCategory:row.event_category,eventType:row.event_type,summary:row.summary,
    actorType:row.actor_type,actorId:row.actor_id,actorDisplay:row.actor_display_snapshot,
    referenceType:row.reference_type,referenceId:row.reference_id,referenceLabel:row.order_reference??null,
    createdAt:row.created_at,
    // Deliberately project known fields, never return stored JSON or row wholesale.
    changedFields:Array.isArray(row.metadata?.changed_fields)?row.metadata.changed_fields:[],
    reason:row.ledger_reason??row.metadata?.reason??null,
    previousStatus:row.metadata?.previous_status??null,status:row.metadata?.status??null,
    formattedAmount:row.account_currency_snapshot?money(row.amount_account_units,row.account_currency_snapshot):null,
    direction:row.direction??null,currency:row.account_currency_snapshot?.code??null,
    ipAddress:row.ip_address??null,userAgent:row.user_agent??null,
  })),nextCursor:rows.length>30&&last?`${last.cursor_time}|${last.id}`:null};
}
