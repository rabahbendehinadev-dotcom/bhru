import type { PoolClient } from '@workspace/db';
import { z } from '@workspace/api-zod';
import { HttpError } from '../auth';
import { currencyCatalog, type StoreCurrency, convertMinor, MAX_MINOR, rateUnits, parseNumberFormat } from './currency-money';

const text = (n: number) => z.string().trim().max(n).regex(/^[^\u0000-\u001f\u007f]*$/);
export const currencyInput = z.object({
  code: z.string().regex(/^[A-Z]{3}$/), name: text(100).min(1), prefix: text(24), suffix: text(24),
  number_format: z.string().trim().max(24).refine(v => parseNumberFormat(v) !== null, 'Use a number sample such as 1,000.99 or 1000,99, with different grouping and decimal separators.'),
  rate: z.string().trim().regex(/^\d{1,9}(?:\.\d{1,6})?$/, 'Enter a positive manual rate with up to 6 decimal places.')
    .refine(v => /^\d{1,9}(?:\.\d{1,6})?$/.test(v)&&rateUnits(v)>0n && rateUnits(v)<=999999999000000n, 'Enter a positive manual rate up to 999999999 with six decimal places.')
    .transform(v => { const [whole, fraction = ''] = v.split('.'); return `${BigInt(whole!).toString()}.${fraction.padEnd(6, '0')}`; }),
  enabled: z.boolean(), client_default: z.boolean(),
}).strict();

export async function currencies(id: string, client: PoolClient): Promise<StoreCurrency[]> {
  return (await client.query(`SELECT code,name,prefix,suffix,number_format,rate::text,decimals,enabled,client_default,is_base,rate_configured
    FROM subscriber_currencies WHERE subscriber_id=$1 ORDER BY is_base DESC,code FOR SHARE`, [id])).rows;
}
export async function currencyConfig(id: string, client: PoolClient, userId?: string) {
  const rows = await currencies(id, client);
  const settings=(await client.query('SELECT currency,money_model_version FROM store_settings WHERE subscriber_id=$1',[id])).rows[0];
  if(!settings)throw new HttpError(503,'Currency initialization is required.');
  const saved=userId?(await client.query('SELECT panel_display_currency FROM account_users WHERE id=$1 AND subscriber_id=$2',[userId,id])).rows[0]?.panel_display_currency:null;
  const live=rows.filter(c=>c.enabled&&c.rate_configured!==false);
  const display=live.find(c=>c.code===saved)??live.find(c=>c.code==='USD')??live.find(c=>c.client_default);
  return {base_currency:settings.currency,system_base_currency:'USD',money_model_version:settings.money_model_version,
    canonical_scale:settings.money_model_version===2?12:2,requires_conversion:settings.money_model_version!==2,
    panel_display_currency:display?.code??'',currencies:rows,catalog:currencyCatalog};
}
export async function saveDisplayCurrency(id:string,userId:string,raw:unknown,client:PoolClient) {
  const input=z.object({code:z.string().regex(/^[A-Z]{3}$/)}).strict().parse(raw);
  const rows=await currencies(id,client);
  if(!rows.some(c=>c.code===input.code&&c.enabled&&c.rate_configured!==false))throw new HttpError(400,'Choose an enabled currency.');
  await client.query('UPDATE account_users SET panel_display_currency=$3 WHERE id=$1 AND subscriber_id=$2',[userId,id,input.code]);
  return {code:input.code};
}
export async function requireUsdModel(id:string,client:PoolClient) {
  const row=(await client.query('SELECT money_model_version FROM store_settings WHERE subscriber_id=$1',[id])).rows[0];
  if(row?.money_model_version!==2)throw new HttpError(409,'Legacy currency conversion requires an explicitly approved basis before USD pricing can be edited.');
}
async function baseCurrency(id: string,client: PoolClient): Promise<string> {
  const row=(await client.query('SELECT currency AS code FROM store_settings WHERE subscriber_id=$1',[id])).rows[0];
  if(!row)throw new HttpError(503,'Accounting reference is unavailable. Apply the currency initialization migration.');
  return row.code;
}
export async function saveCurrency(id: string, raw: unknown, client: PoolClient) {
  await requireUsdModel(id,client);
  const input = currencyInput.parse(raw);
  const standard = currencyCatalog.find(c => c.code === input.code);
  if (!standard) throw new HttpError(400, 'Choose a currency from the standard currency list.');
  const rows = await currencies(id, client), old = rows.find(c => c.code === input.code);
  const isBase = input.code === await baseCurrency(id,client);
  if (input.client_default && !input.enabled) throw new HttpError(400, 'The Client Default currency must be enabled.');
  if (isBase && !/^0*1(?:\.0+)?$/.test(input.rate)) {
    throw new HttpError(400, 'The base currency rate must stay 1.');
  }
  if(isBase&&!input.enabled)throw new HttpError(400,'The permanent USD reference must remain enabled.');
  if (old?.client_default && !input.client_default) throw new HttpError(400, 'Select another currency as Client Default first.');
  if (input.client_default) await client.query('UPDATE subscriber_currencies SET client_default=false WHERE subscriber_id=$1 AND client_default', [id]);
  await client.query(`INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,number_format,rate,decimals,enabled,client_default,is_base)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(subscriber_id,code) DO UPDATE SET name=EXCLUDED.name,prefix=EXCLUDED.prefix,suffix=EXCLUDED.suffix,
    number_format=EXCLUDED.number_format,rate=EXCLUDED.rate,enabled=EXCLUDED.enabled,client_default=EXCLUDED.client_default,rate_configured=true,updated_at=now()`,
    [id,input.code,input.name,input.prefix,input.suffix,input.number_format,input.rate,isBase?2:standard.decimals,input.enabled,input.client_default,isBase]);
  return { code: input.code };
}
export async function deleteCurrency(id: string, code: string, client: PoolClient) {
  await requireUsdModel(id,client);
  if (!/^[A-Z]{3}$/.test(code)) throw new HttpError(400, 'Invalid currency code.');
  const rows = await currencies(id, client), row = rows.find(c => c.code === code);
  if (!row) throw new HttpError(404, 'Currency not found.');
  if(code==='USD')throw new HttpError(409,'The permanent USD reference cannot be deleted.');
  if (row.client_default) throw new HttpError(409, 'Select another Client Default before deleting this currency.');
  await client.query('DELETE FROM subscriber_currencies WHERE subscriber_id=$1 AND code=$2', [id,code]);
}
export function chooseCurrency(rows: StoreCurrency[], requested?: string): StoreCurrency {
  const live = rows.filter(c => c.enabled&&c.rate_configured!==false);
  const chosen = live.find(c => c.code === requested) ?? live.find(c => c.client_default);
  if (!chosen) throw new HttpError(503, 'Store currency configuration is unavailable.');
  return chosen;
}
export function currencySnapshot(baseCurrency: string, rows: StoreCurrency[], requested: string | undefined, items: { product_id: string; unit_price_minor: string; unit_price_usd_units?: string | null; provider_cost_usd_units?:string|null; quantity: number }[], baseTotal: string, usdTotal?:string) {
  const chosen = chooseCurrency(rows, requested);
  let total = 0n;
  const displayItems = items.map(i => {
    let unit: bigint;
    try { unit = convertMinor(i.unit_price_usd_units??i.unit_price_minor, chosen,i.unit_price_usd_units!=null?12:2); }
    catch { throw new HttpError(400,'A converted price exceeds the safe money limit.'); }
    const line = unit * BigInt(i.quantity);
    total += line;
    if (line > MAX_MINOR || total > MAX_MINOR) throw new HttpError(400, 'Converted order total is too large.');
    return { product_id: i.product_id, base_unit_price_minor:i.unit_price_minor,base_unit_price_usd_units:i.unit_price_usd_units??null,
      quantity:i.quantity, unit_price_minor: unit.toString(), line_total_minor: line.toString() };
  });
  return {money_model_version:usdTotal!==undefined?2:1,canonical_scale:usdTotal!==undefined?12:2,rate_scale:6,
    base_currency: baseCurrency, base_total_minor: baseTotal,base_total_usd_units:usdTotal??null, currency: chosen,
    currencies: rows.filter(c => c.enabled), items: displayItems, total_minor: total.toString() };
}
