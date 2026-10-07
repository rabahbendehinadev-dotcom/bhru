import type { PoolClient } from '@workspace/db';
import { z } from '@workspace/api-zod';
import { HttpError } from '../auth';
import { currencyCatalog, type StoreCurrency, convertMinor, MAX_MINOR, rateUnits } from './currency-money';

const text = (n: number) => z.string().trim().max(n).regex(/^[^\u0000-\u001f\u007f]*$/);
export const currencyInput = z.object({
  code: z.string().regex(/^[A-Z]{3}$/), name: text(100).min(1), prefix: text(24), suffix: text(24),
  number_format: z.enum(['1,234.56', '1.234,56', '1 234,56', '1234.56']),
  rate: z.string().regex(/^\d{1,9}(?:\.\d{1,5})?$/).refine(v => /^\d{1,9}(?:\.\d{1,5})?$/.test(v) && rateUnits(v)>0n && rateUnits(v)<=99999999900000n, 'Enter a positive manual rate up to 999999999.'),
  enabled: z.boolean(), client_default: z.boolean(),
}).strict();

export async function currencies(id: string, client: PoolClient): Promise<StoreCurrency[]> {
  return (await client.query(`SELECT code,name,prefix,suffix,number_format,rate::text,decimals,enabled,client_default,is_base
    FROM subscriber_currencies WHERE subscriber_id=$1 ORDER BY is_base DESC,code FOR SHARE`, [id])).rows;
}
export async function currencyConfig(id: string, client: PoolClient) {
  const rows = await currencies(id, client);
  return { base_currency: await baseCurrency(id,client), currencies: rows, catalog: currencyCatalog };
}
async function baseCurrency(id: string,client: PoolClient): Promise<string> {
  return (await client.query("SELECT coalesce((SELECT currency FROM store_settings WHERE subscriber_id=$1),'DZD') AS code",[id])).rows[0].code;
}
export async function saveCurrency(id: string, raw: unknown, client: PoolClient) {
  const input = currencyInput.parse(raw);
  const standard = currencyCatalog.find(c => c.code === input.code);
  if (!standard) throw new HttpError(400, 'Choose a currency from the standard currency list.');
  const rows = await currencies(id, client), old = rows.find(c => c.code === input.code);
  const isBase = input.code === await baseCurrency(id,client);
  if (input.client_default && !input.enabled) throw new HttpError(400, 'The Client Default currency must be enabled.');
  if (isBase && !/^0*1(?:\.0+)?$/.test(input.rate)) {
    throw new HttpError(400, 'The base currency rate must stay 1.');
  }
  if (old?.client_default && !input.client_default) throw new HttpError(400, 'Select another currency as Client Default first.');
  if (input.client_default) await client.query('UPDATE subscriber_currencies SET client_default=false WHERE subscriber_id=$1 AND client_default', [id]);
  await client.query(`INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,number_format,rate,decimals,enabled,client_default,is_base)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(subscriber_id,code) DO UPDATE SET name=EXCLUDED.name,prefix=EXCLUDED.prefix,suffix=EXCLUDED.suffix,
    number_format=EXCLUDED.number_format,rate=EXCLUDED.rate,enabled=EXCLUDED.enabled,client_default=EXCLUDED.client_default,updated_at=now()`,
    [id,input.code,input.name,input.prefix,input.suffix,input.number_format,input.rate,isBase?2:standard.decimals,input.enabled,input.client_default,isBase]);
  return { code: input.code };
}
export async function deleteCurrency(id: string, code: string, client: PoolClient) {
  if (!/^[A-Z]{3}$/.test(code)) throw new HttpError(400, 'Invalid currency code.');
  const rows = await currencies(id, client), row = rows.find(c => c.code === code);
  if (!row) throw new HttpError(404, 'Currency not found.');
  if (row.client_default) throw new HttpError(409, 'Select another Client Default before deleting this currency.');
  await client.query('DELETE FROM subscriber_currencies WHERE subscriber_id=$1 AND code=$2', [id,code]);
}
export function chooseCurrency(rows: StoreCurrency[], requested?: string): StoreCurrency {
  const live = rows.filter(c => c.enabled);
  const chosen = live.find(c => c.code === requested) ?? live.find(c => c.client_default);
  if (!chosen) throw new HttpError(503, 'Store currency configuration is unavailable.');
  return chosen;
}
export function currencySnapshot(baseCurrency: string, rows: StoreCurrency[], requested: string | undefined, items: { product_id: string; unit_price_minor: string; quantity: number }[], baseTotal: string) {
  const chosen = chooseCurrency(rows, requested);
  let total = 0n;
  const displayItems = items.map(i => {
    let unit: bigint;
    try { unit = convertMinor(i.unit_price_minor, chosen); }
    catch { throw new HttpError(400,'A converted price exceeds the safe money limit.'); }
    const line = unit * BigInt(i.quantity);
    total += line;
    if (line > MAX_MINOR || total > MAX_MINOR) throw new HttpError(400, 'Converted order total is too large.');
    return { product_id: i.product_id, base_unit_price_minor:i.unit_price_minor, quantity:i.quantity, unit_price_minor: unit.toString(), line_total_minor: line.toString() };
  });
  return { base_currency: baseCurrency, base_total_minor: baseTotal, currency: chosen,
    currencies: rows.filter(c => c.enabled), items: displayItems, total_minor: total.toString() };
}
