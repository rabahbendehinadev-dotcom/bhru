// Fast pure arithmetic checks: no browser, network, database or account creation.
import assert from 'node:assert/strict';
import { parseUsd,usdCents,rateUnits,convertMinor,formatCurrencyMinor } from '../artifacts/api-server/src/lib/commerce/currency-money.ts';
import {parseUnits,rateScaled,formatScaled,unitsToInput} from '../artifacts/bhru/src/lib/currency-money.ts';
const c=(code,rate,prefix='',suffix=code)=>({code,rate,prefix,suffix,name:code,number_format:'1,234.56',decimals:2,enabled:true,client_default:false});
const usd=c('USD','1.000000','$','USD'),dzd=c('DZD','260.000000'),eur=c('EUR','0.860000','€','EUR');
assert.equal(parseUsd('50.00'),50000000000000n);
assert.equal(parseUnits('50000000000000'),50000000000000n);
assert.equal(unitsToInput('50000000000000'),'50.00');
assert.equal(unitsToInput('125000000000'),'0.125');
assert.equal(unitsToInput('19230769000000'),'19.230769');
for(const value of ['0.125','0.4875','1.0032','19.230769']) {
 const [w,f]=value.split('.');
 assert.equal(parseUsd(value),BigInt(w)*1000000000000n+BigInt(f.padEnd(12,'0')));
}
assert.equal(convertMinor(parseUsd('50'),usd,12),5000n);
assert.equal(convertMinor(parseUsd('50'),dzd,12),1300000n);
assert.equal(convertMinor(parseUsd('50'),eur,12),4300n);
assert.equal(formatCurrencyMinor(convertMinor(parseUsd('50'),dzd,12),dzd),'13,000.00 DZD');
for(const currency of [usd,dzd,eur])for(const amount of ['50','0.125','0.4875','1.0032','19.230769']) {
 assert.equal(formatScaled(parseUsd(amount)*rateScaled(currency.rate),18,currency),formatCurrencyMinor(convertMinor(parseUsd(amount),currency,12),currency));
}
assert.equal(convertMinor(parseUsd('1.10'),dzd,12),28600n);
assert.equal(convertMinor(parseUsd('0.125'),usd,12),13n);
assert.equal(usdCents(parseUsd('0.4875')),49n);
assert.equal(rateUnits('0.003846'),3846n);
assert.equal(rateUnits('260.00000'),260000000n); // old five-decimal snapshots remain compatible
assert.equal(convertMinor('500000',c('DZD','1.00000'),2),500000n);
const original=convertMinor(parseUsd('50'),dzd,12);
assert.equal(convertMinor(parseUsd('50'),{...dzd,rate:'270.000000'},12),1350000n);
assert.equal(original,1300000n);
assert.equal(convertMinor(parseUsd('0.125'),usd,12)*3n,39n); // rounded unit × qty, not rounded raw aggregate
assert.throws(()=>parseUsd('0.1234567890123'));
assert.throws(()=>rateUnits('1.1234567'));
assert.throws(()=>convertMinor('999999999999999999999999999999',dzd,12));
console.log('USD precision, six-decimal rates, 50 USD examples, legacy arithmetic, rounding and bounds: PASS');
