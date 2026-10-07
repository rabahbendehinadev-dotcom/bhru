// Focused pure/embedded-JS checks; no browser, database or real tenant data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import { formatCurrencyPresentation, SUPPORTED_NUMBER_FORMATS } from '../lib/currency-presentation/src/index.mts';
import { formatScaled } from '../artifacts/bhru/src/lib/currency-money.ts';
import { formatCurrencyMinor } from '../artifacts/api-server/src/lib/commerce/currency-money.ts';

const c = (extra = {}) => ({
 code:'DZD',name:'Algerian Dinar',prefix:'',suffix:'',number_format:'1,000.99',
 decimals:2,rate:'260.000000',enabled:true,client_default:true,...extra,
});
const sample = 12345678n;
const examples = ['1234.57 DZD', '1,234.57 DZD', '1,234,57 DZD', '1,234.57 DZD'];
for (const [i, format] of SUPPORTED_NUMBER_FORMATS.entries()) {
 const currency = c({number_format:format});
 assert.equal(formatScaled(sample,4,currency), examples[i]);
 assert.equal(formatCurrencyMinor(123457n,currency), examples[i]);
}
for (const [extra, expected] of [
 [{suffix:'DZD'},'1,234.57 DZD'],
 [{prefix:'$'},'$1,234.57'],
 [{prefix:'$',suffix:'USD'},'$1,234.57 USD'],
 [{prefix:'USD'},'USD 1,234.57'],
 [{prefix:'دج'},'دج 1,234.57'],
 [{prefix:'US$'},'US$1,234.57'],
 [{prefix:' $ ',suffix:' DZD '},'$1,234.57 DZD'],
 [{code:'KWD',decimals:3},'1,234.568 KWD'],
 [{code:'JPY',decimals:0},'1,235 JPY'],
]) assert.equal(formatScaled(sample,4,c(extra)), expected);
assert.equal(formatScaled(sample,4,c({rate:'270.000000'})),formatScaled(sample,4,c({rate:'260.000000'})));
const old = c({prefix:'DZD'});
assert.equal(formatCurrencyPresentation(123457n,2,old,[',','.'],undefined,true),'DZD1,234.57');

const bundle = async entry => {
 const result = await build({
  entryPoints:[entry],bundle:true,platform:'node',format:'esm',write:false,
  plugins:[{name:'no-db',setup(b){
   b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'isolated'}));
   b.onLoad({filter:/.*/,namespace:'isolated'},()=>({loader:'js',contents:'export const pool={query(){throw Error("Database access forbidden")}};'}));
  }}],
 });
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const { STOREFRONT_MONEY_SCRIPT } = await bundle('artifacts/api-server/src/lib/commerce/storefront-money-script.ts');
const { currencySnapshot } = await bundle('artifacts/api-server/src/lib/commerce/currencies.ts');
const newSnapshot = currencySnapshot('USD',[old],undefined,[], '0','0');
assert.equal(newSnapshot.currency.presentation_version,2);
assert.ok(!('presentation_version' in old), 'Snapshot tagging must not mutate a live currency or old snapshot');

function publicText(currency, raw, receipt) {
 const node = {textContent:'',hasAttribute:()=>false,getAttribute:key=>key==='data-sf-money'?raw:null};
 const cfg = {slug:'isolated',currencies:[currency],defaultCurrency:currency.code,moneyScale:12,view:receipt?'confirmation':'home'};
 vm.runInNewContext(STOREFRONT_MONEY_SCRIPT,{
  document:{getElementById:()=>({textContent:JSON.stringify(cfg)}),querySelectorAll:()=>[node]},
  localStorage:{getItem:()=>null,setItem:()=>{}},
  sessionStorage:{getItem:()=>JSON.stringify(receipt)},window:{},
 });
 return node.textContent;
}
for (const number_format of SUPPORTED_NUMBER_FORMATS) {
 for (const decimals of [0,2,3]) {
  for (const prefix of ['', '$', 'USD', 'دج']) {
   const currency = c({number_format,decimals,prefix,rate:'1.000000'});
   // Raw input is already this currency for the rate-one public test; no preview conversion.
   const value = decimals===0?1235n:decimals===2?123457n:1234568n;
   assert.equal(publicText(currency,'1234567800000000'),formatScaled(sample,4,currency));
   assert.equal(formatCurrencyMinor(value,currency),formatScaled(sample,4,currency));
  }
 }
}
const receiptCurrency = c({prefix:'DZD',rate:'1.000000'});
const receipt = {currency_snapshot:{currency:receiptCurrency,currencies:[receiptCurrency],canonical_scale:12}};
assert.equal(publicText(receiptCurrency,'1234570000000000',receipt),'DZD1,234.57');
const newCurrency = {...receiptCurrency,presentation_version:2};
assert.equal(publicText(newCurrency,'1234570000000000',{currency_snapshot:{...receipt.currency_snapshot,currency:newCurrency}}),'DZD 1,234.57');
assert.equal(receipt.currency_snapshot.currency.prefix,'DZD');
assert.ok(!('presentation_version' in receipt.currency_snapshot.currency));
const page = fs.readFileSync('artifacts/bhru/src/pages/currencies.tsx','utf8');
assert.match(page,/formatScaled\(12345678n, 4, currency\)/);
assert.equal((page.match(/Preview: \{preview\(add\)\}/g)??[]).length,2);
assert.match(page,/Preview: \{preview\(form\)\}/);
assert.doesNotMatch(page,/\$\{add\.prefix\}|\$\{form\.prefix\}/);
assert.match(fs.readFileSync('artifacts/bhru/src/pages/ecommerce.tsx','utf8'),/c\.presentation_version !== 2/);
await build({
 entryPoints:['artifacts/bhru/src/pages/currencies.tsx','artifacts/bhru/src/pages/ecommerce.tsx'],
 bundle:true,packages:'external',platform:'browser',format:'esm',outdir:'/tmp/currency-presentation-check',write:false,logLevel:'silent',
});
console.log('PASS: DZD four styles, KWD 3/JPY 0, affix spacing/code fallback, rate-independent preview, shared panel/server/public formatting, unchanged historical affixes, future receipt presentation metadata, Add/Edit binding and focused UI compile.');
