import { randomUUID } from 'node:crypto';
import type { PoolClient } from '@workspace/db';
import { HttpError } from '../auth';
import { formatCurrencyPresentation, parseNumberFormat } from '../commerce/currency-money';
import { customerProfile, type CustomerIdentity } from './types';
import { CUSTOMER_PROFILE_SELECT, normalizePhone, profileEditInput, registrationOptions, validatePreferences } from './profile';
import { financialSummary, financialSummaries } from '../client-finance/wallet';
import { orderSummary } from '../client-finance/orders';

type ClientRow = CustomerIdentity & { enabled: boolean; orderCount: number };
export const CLIENT_PAGE_SIZE = 30;
export async function ownedClient(subscriber: string, id: string, db: PoolClient, lock = false): Promise<ClientRow> {
  const row = (await db.query(`SELECT ${CUSTOMER_PROFILE_SELECT},c.enabled,
    c.client_group_id AS "groupId",w.available_balance AS "walletAvailable",w.locked_balance AS "walletLocked",
    ((SELECT count(*)::int FROM store_orders o WHERE o.subscriber_id=c.subscriber_id AND o.customer_id=c.id)
    +(SELECT count(*)::int FROM service_orders o WHERE o.subscriber_id=c.subscriber_id AND o.customer_id=c.id)) AS "orderCount"
    FROM public_customer_accounts c JOIN customer_wallets w ON w.subscriber_id=c.subscriber_id AND w.customer_id=c.id
    WHERE c.subscriber_id=$1 AND c.id=$2 ${lock?'FOR UPDATE OF c':''}`,[subscriber,id])).rows[0];
  if (!row) throw new HttpError(404, 'Client not found.');
  return row;
}
function clientView(row: ClientRow, financial: Awaited<ReturnType<typeof financialSummary>>) {
  const wallet=row as ClientRow & {walletAvailable:string;walletLocked:string;groupId:string|null};
  return {...customerProfile(row),id:row.id,enabled:row.enabled,orderCount:row.orderCount,
    groupId:wallet.groupId,effectiveCurrency:financial.accountCurrency,availableBalance:financial.formattedAvailable,
    lockedAmount:financial.formattedLocked,financial};
}
export async function listClients(subscriber: string, query: {page:number;search?:string;status?:string}, db: PoolClient) {
  const search = query.search ? `%${query.search.replace(/[\\%_]/g,'\\$&')}%` : null;
  const phoneSearch = query.search ? `%${query.search.replace(/[\s().-]/g,'').replace(/[\\%_]/g,'\\$&')}%` : null;
  const rows = (await db.query(`SELECT ${CUSTOMER_PROFILE_SELECT},c.enabled,
    c.client_group_id AS "groupId",w.available_balance AS "walletAvailable",w.locked_balance AS "walletLocked",
    ((SELECT count(*)::int FROM store_orders o WHERE o.subscriber_id=c.subscriber_id AND o.customer_id=c.id)
    +(SELECT count(*)::int FROM service_orders o WHERE o.subscriber_id=c.subscriber_id AND o.customer_id=c.id)) AS "orderCount"
    FROM public_customer_accounts c JOIN customer_wallets w ON w.subscriber_id=c.subscriber_id AND w.customer_id=c.id
    WHERE c.subscriber_id=$1
      AND ($2::text IS NULL OR c.username ILIKE $2 OR c.client_code ILIKE $2 OR c.first_name ILIKE $2
        OR c.last_name ILIKE $2 OR concat_ws(' ',c.first_name,c.last_name) ILIKE $2 OR c.email ILIKE $2
        OR c.whatsapp_phone ILIKE $2 OR c.whatsapp_phone ILIKE $6)
      AND ($3::boolean IS NULL OR c.enabled=$3)
    ORDER BY c.created_at DESC,c.id LIMIT $4 OFFSET $5`,
    [subscriber,search,query.status ? query.status==='active' : null,CLIENT_PAGE_SIZE+1,(query.page-1)*CLIENT_PAGE_SIZE,phoneSearch])).rows as ClientRow[];
  const visible=rows.slice(0,CLIENT_PAGE_SIZE);
  const summaries=await financialSummaries(subscriber,visible.map(row=>row.id),db);
  return {data:visible.map(row => {
    const financial=summaries.get(row.id);
    if(!financial)throw new HttpError(503,'Wallet is not initialized.');
    return clientView(row,financial);
  }),page:query.page,hasMore:rows.length>CLIENT_PAGE_SIZE};
}
export function historicalClientOrder(row: Record<string, any>) {
  const snapshot = row.currency_snapshot, c = snapshot?.currency ?? snapshot ?? {};
  const code = c.code ?? row.currency, total = String(snapshot?.total_minor ?? row.total_minor);
  const decimals = c.decimals ?? 2;
  return {
    id:row.id,reference:row.reference,status:row.status,createdAt:row.created_at,totalMinor:total,currency:code,
    formattedTotal:formatCurrencyPresentation(BigInt(total),decimals,
      {code,prefix:c.prefix??'',suffix:c.suffix??'',number_format:c.number_format??'1,000.99',decimals},
      parseNumberFormat(c.number_format??'1,000.99')??[',','.'],code,c.presentation_version!==2),
  };
}
export async function clientDetail(subscriber: string, id: string, db: PoolClient) {
  const row = await ownedClient(subscriber,id,db), financial = await financialSummary(subscriber,id,db);
  const orders = (await db.query(`SELECT id,reference,status,created_at,total_minor::text,currency,currency_snapshot
    FROM store_orders WHERE subscriber_id=$1 AND customer_id=$2 ORDER BY created_at DESC,id LIMIT 30`,[subscriber,id])).rows;
  const activity = (await db.query(`SELECT id,action,created_at AS "createdAt" FROM public_customer_activity
    WHERE subscriber_id=$1 AND customer_id=$2 ORDER BY created_at DESC,id LIMIT 50`,[subscriber,id])).rows;
  const notes = (await db.query(`SELECT id,body,created_at AS "createdAt" FROM reseller_client_notes
    WHERE subscriber_id=$1 AND customer_id=$2 ORDER BY created_at DESC,id LIMIT 50`,[subscriber,id])).rows;
  return {
    client:clientView(row,financial),options:await registrationOptions(subscriber,db),
    financial,
    orderSummary:{totalOrders:row.orderCount,retailOrders:row.orderCount-(await orderSummary(subscriber,db,id)).totalOrders,
      serviceOrders:await orderSummary(subscriber,db,id)},
    orders:orders.map(historicalClientOrder),activity,notes,
  };
}
export async function clientActivity(subscriber: string, customer: string, action: string, actor: string, db: PoolClient) {
  await db.query('INSERT INTO public_customer_activity(id,subscriber_id,customer_id,action,actor_id) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(),subscriber,customer,action,actor]);
}
export async function updateClientProfile(subscriber: string, id: string, raw: unknown, actor: string, db: PoolClient) {
  const input = profileEditInput.parse(raw);
  for (const value of Object.values(input)) if (typeof value==='string' && /[\u0000-\u001f\u007f]/.test(value)) throw new HttpError(400,'Enter valid profile information.');
  // Same lock order as registration prevents username/client-code namespace races.
  await db.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[subscriber]);
  const prior = await ownedClient(subscriber,id,db,true);
  if(input.preferredCurrency!==prior.preferredCurrency)throw new HttpError(409,'Account currency is immutable after registration.');
  if (input.countryCode) input.countryCode=input.countryCode.toUpperCase();
  if (input.whatsappPhone) input.whatsappPhone=normalizePhone(input.whatsappPhone);
  await validatePreferences(subscriber,input.preferredLanguage,null,input.countryCode,db);
  if ((await db.query(`SELECT id FROM public_customer_accounts WHERE subscriber_id=$1 AND id<>$2
    AND (lower(username)=lower($3) OR lower(client_code)=lower($3))`,[subscriber,id,input.username])).rowCount) throw new HttpError(400,'Choose another username.');
  await db.query(`UPDATE public_customer_accounts SET first_name=$3,last_name=$4,username=$5,whatsapp_phone=$6,
    preferred_language=$7,preferred_currency=$8,newsletter_opt_in=$9,address_line_1=$10,address_line_2=$11,
    country_code=$12,state=$13,city=$14,postal_code=$15,updated_at=now() WHERE subscriber_id=$1 AND id=$2`,
    [subscriber,id,input.firstName,input.lastName,input.username,input.whatsappPhone,input.preferredLanguage,
      input.preferredCurrency,input.newsletterOptIn,input.addressLine1,input.addressLine2,input.countryCode,input.state,input.city,input.postalCode]);
  await clientActivity(subscriber,id,'profile_updated',actor,db);
}
export async function changeClientStatus(subscriber: string, id: string, enabled: boolean, actor: string, db: PoolClient) {
  const prior = await ownedClient(subscriber,id,db,true);
  await db.query('UPDATE public_customer_accounts SET enabled=$3,updated_at=now() WHERE subscriber_id=$1 AND id=$2',[subscriber,id,enabled]);
  if (!enabled) await db.query('DELETE FROM public_customer_sessions WHERE subscriber_id=$1 AND customer_id=$2',[subscriber,id]);
  if (prior.enabled!==enabled) await clientActivity(subscriber,id,enabled?'reactivated':'blocked',actor,db);
}
export async function addClientNote(subscriber: string, id: string, body: string, actor: string, db: PoolClient) {
  await ownedClient(subscriber,id,db);
  await db.query('INSERT INTO reseller_client_notes(id,subscriber_id,customer_id,author_id,body) VALUES($1,$2,$3,$4,$5)',[randomUUID(),subscriber,id,actor,body]);
  await clientActivity(subscriber,id,'note_added',actor,db);
}
