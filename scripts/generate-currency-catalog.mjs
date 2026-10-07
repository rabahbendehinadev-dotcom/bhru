// Manual metadata maintenance only. Never used at application startup; never fetches FX.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const CATALOG_SOURCE = 'https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml';
const symbols = {
 DZD: 'دج', MAD: 'د.م.', SAR: 'ر.س', AED: 'د.إ', QAR: 'ر.ق', KWD: 'د.ك',
 BHD: 'د.ب', OMR: 'ر.ع.', JOD: 'د.ا', TND: 'د.ت', LYD: 'د.ل',
 EGP: 'ج.م', IQD: 'د.ع', YER: 'ر.ي', LBP: 'ل.ل',
};
function decode(value) {
 return value.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#([0-9]+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
  .replaceAll('&apos;', "'").replaceAll('&amp;', '&').trim();
}
export function generateCurrencyCatalog(xml) {
 const published = xml.match(/<ISO_4217 Pblshd="([^"]+)"/)?.[1];
 if (!published) throw new Error('Expected an official ISO 4217 current-list XML document.');
 const get = (entry, tag) => decode(entry.match(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1] ?? '');
 const entries = new Map();
 for (const [, text] of xml.matchAll(/<CcyNtry>([\s\S]*?)<\/CcyNtry>/g)) {
  const code = get(text, 'Ccy');
  if (!code) continue;
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`Invalid ISO code: ${code}`);
  const minor = get(text, 'CcyMnrUnts');
  const decimals = /^\d+$/.test(minor) ? Number(minor) : null;
  const fund = /<CcyNm IsFund="true"/.test(text);
  let entry = entries.get(code);
  if (entry && entry.decimals !== decimals) throw new Error(`Conflicting precision: ${code}`);
  if (!entry) {
   const symbol = symbols[code] ?? new Intl.NumberFormat('en', {
    style: 'currency', currency: code, currencyDisplay: 'narrowSymbol',
   }).formatToParts(1).find(p => p.type === 'currency')?.value ?? code;
   entry = { code, name: get(text, 'CcyNm'), symbol, decimals,
    active: code !== 'XTS' && code !== 'XXX', selectable: false, fund, countries: [] };
   entries.set(code, entry);
  }
  entry.fund ||= fund;
  const country = get(text, 'CtryNm');
  if (country && !entry.countries.includes(country)) entry.countries.push(country);
 }
 for (const entry of entries.values()) {
  if (entry.decimals !== null && (entry.decimals < 0 || entry.decimals > 4)) {
   throw new Error(`Review schema precision support before publishing ${entry.code}.`);
  }
  entry.selectable = entry.active && entry.decimals !== null;
 }
 if (entries.size < 150 || !entries.has('USD')) throw new Error('Incomplete official currency list.');
 return { source: CATALOG_SOURCE, published, xml_sha256: createHash('sha256').update(xml).digest('hex'),
  symbol_source: 'Pinned CLDR narrow symbols with explicit Arabic presentation overrides; symbols are not ISO-defined.',
  currencies: [...entries.values()].sort((a, b) => a.code.localeCompare(b.code, 'en')) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const fileIndex = process.argv.indexOf('--xml-file');
 const xml = fileIndex >= 0 ? fs.readFileSync(process.argv[fileIndex + 1], 'utf8')
  : await (async () => {
   const response = await fetch(CATALOG_SOURCE, { signal: AbortSignal.timeout(30000) });
   if (!response.ok) throw new Error(`ISO metadata download failed: ${response.status}`);
   return response.text();
  })();
 const catalog = generateCurrencyCatalog(xml);
 // One entry per line keeps the checked-in snapshot straightforward to review.
 const { currencies, ...metadata } = catalog;
 process.stdout.write(JSON.stringify(metadata, null, 2).slice(0, -2)
  + ',\n  "currencies": [\n'
  + currencies.map(c => '    ' + JSON.stringify(c)).join(',\n') + '\n  ]\n}\n');
}
