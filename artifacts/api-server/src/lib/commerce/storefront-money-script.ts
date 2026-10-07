import { createHash } from 'node:crypto';
import { parseNumberFormat, formatCurrencyPresentation } from './currency-money';

/** BigInt-only commercial conversion, shared by all public price nodes and totals. */
export const STOREFRONT_MONEY_SCRIPT = String.raw`(function(){
'use strict';
var cfg;try{cfg=JSON.parse(document.getElementById('sf-config').textContent);}catch(e){return;}
var key='bhru-storefront-preferences:'+cfg.slug,rows=cfg.currencies.slice(),selectedCode=cfg.defaultCurrency;
var historical=false,lockedToBase=false,historicalReadOnly=false,MAX=9223372036854775807n,moneyScale=cfg.moneyScale||2;
if(cfg.view==='confirmation'){
 var receipt;try{receipt=JSON.parse(sessionStorage.getItem('bhru-receipt:'+cfg.slug)||'null');}catch(e){}
 if(receipt){
  historical=true;
  if(receipt.currency_snapshot&&receipt.currency_snapshot.currencies){
   rows=[receipt.currency_snapshot.currency];selectedCode=rows[0].code;cfg.defaultCurrency=selectedCode;
   moneyScale=receipt.currency_snapshot.canonical_scale||2;historicalReadOnly=true;
  }else{
   rows=[{code:receipt.currency,name:receipt.currency,prefix:'',suffix:receipt.currency,number_format:'1,234.56',rate:'1.000000',decimals:2,enabled:true,client_default:true,is_base:true}];
   selectedCode=receipt.currency;cfg.defaultCurrency=selectedCode;moneyScale=2;lockedToBase=true;historicalReadOnly=true;
  }
 }
}
function getSaved(){try{return JSON.parse(localStorage.getItem(key)||'{}')||{};}catch(e){return {};}}
var saved=getSaved();if(rows.some(function(c){return c.code===saved.currency;}))selectedCode=saved.currency;
function selected(){return rows.filter(function(c){return c.code===selectedCode;})[0]||rows.filter(function(c){return c.code===cfg.defaultCurrency;})[0]||rows.filter(function(c){return c.is_base;})[0]||rows[0];}
function convert(raw,c){
 var parts=c.rate.split('.'),units=BigInt(parts[0])*1000000n+BigInt((parts[1]||'').padEnd(6,'0'));
 var d=10n**BigInt(moneyScale)*1000000n,answer=(BigInt(raw)*units*10n**BigInt(c.decimals)+d/2n)/d;
 if(answer<0n||answer>MAX)throw new Error('Converted amount exceeds safe money limit');return answer;
}
function format(value,c){
 var parseFormat=${parseNumberFormat.toString()};
 var present=${formatCurrencyPresentation.toString()};
 return present(value,c.decimals,c,parseFormat(c.number_format)||[',','.'],undefined,historical&&c.presentation_version!==2);
}
function render(n){
 var c=selected();if(!c)return;
 try{
  var total;
  if(n.hasAttribute('data-sf-lines')){
   var items=JSON.parse(n.getAttribute('data-sf-lines'));
   total=items.reduce(function(sum,i){return sum+convert(i.unit_price_minor,c)*BigInt(i.quantity);},0n);
  }else total=convert(n.getAttribute('data-sf-money'),c)*BigInt(n.getAttribute('data-sf-quantity')||'1');
  if(total>MAX)throw new Error('Converted amount exceeds safe money limit');
  n.textContent=format(total,c);
 }catch(e){n.textContent='Amount unavailable';}
}
function update(){Array.prototype.forEach.call(document.querySelectorAll('[data-sf-money], [data-sf-lines]'),render);}
function select(code){
 var c=rows.filter(function(c){return c.code===code;})[0];
 if(!c)c=rows.filter(function(c){return c.code===cfg.defaultCurrency;})[0]||rows.filter(function(c){return c.is_base;})[0]||rows[0];
 if(!c)return null;selectedCode=c.code;
 if(!historicalReadOnly){var v=getSaved();v.currency=c.code;try{localStorage.setItem(key,JSON.stringify(v));}catch(e){}}
 update();return c;
}
function resolve(snapshot,requestedCode){
 if(historical||!snapshot)return;
 moneyScale=snapshot.canonical_scale||2;
 rows=snapshot.currencies;cfg.defaultCurrency=(rows.filter(function(c){return c.client_default;})[0]||snapshot.currency).code;
 if(selectedCode===requestedCode||!rows.some(function(c){return c.code===selectedCode;}))selectedCode=snapshot.currency.code;
 select(selectedCode);
 window.dispatchEvent(new Event('bhru-currency-config'));
}
window.bhruStorefrontMoney={selected:selected,select:select,render:render,update:update,resolve:resolve,
 currencies:function(){return rows;},historical:historical,lockedToBase:lockedToBase,historicalReadOnly:historicalReadOnly};
select(selectedCode);
})();`;
export const STOREFRONT_MONEY_HASH = `'sha256-${createHash('sha256').update(STOREFRONT_MONEY_SCRIPT).digest('base64')}'`;
