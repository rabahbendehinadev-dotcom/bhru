import { createHash } from 'node:crypto';

/** BigInt-only commercial conversion, shared by all public price nodes and totals. */
export const STOREFRONT_MONEY_SCRIPT = String.raw`(function(){
'use strict';
var cfg;try{cfg=JSON.parse(document.getElementById('sf-config').textContent);}catch(e){return;}
var key='bhru-storefront-preferences:'+cfg.slug,rows=cfg.currencies.slice(),selectedCode=cfg.defaultCurrency;
var historical=false,lockedToBase=false,historicalReadOnly=false,MAX=9223372036854775807n;
if(cfg.view==='confirmation'){
 var receipt;try{receipt=JSON.parse(sessionStorage.getItem('bhru-receipt:'+cfg.slug)||'null');}catch(e){}
 if(receipt){
  historical=true;
  if(receipt.currency_snapshot&&receipt.currency_snapshot.currencies){
   var savedRows=receipt.currency_snapshot.currencies;
   rows=rows.map(function(c){return savedRows.filter(function(s){return s.code===c.code;})[0];}).filter(Boolean);
   if(!rows.length){rows=[receipt.currency_snapshot.currency];selectedCode=rows[0].code;historicalReadOnly=true;}
  }else{rows=rows.filter(function(c){return c.code===receipt.currency&&c.is_base;});lockedToBase=true;}
 }
}
function getSaved(){try{return JSON.parse(localStorage.getItem(key)||'{}')||{};}catch(e){return {};}}
var saved=getSaved();if(rows.some(function(c){return c.code===saved.currency;}))selectedCode=saved.currency;
function selected(){return rows.filter(function(c){return c.code===selectedCode;})[0]||rows.filter(function(c){return c.code===cfg.defaultCurrency;})[0]||rows.filter(function(c){return c.is_base;})[0]||rows[0];}
function convert(raw,c){
 var parts=c.rate.split('.'),units=BigInt(parts[0])*100000n+BigInt((parts[1]||'').padEnd(5,'0'));
 var d=10000000n,answer=(BigInt(raw)*units*10n**BigInt(c.decimals)+d/2n)/d;
 if(answer<0n||answer>MAX)throw new Error('Converted amount exceeds safe money limit');return answer;
}
function format(value,c){
 var formats={'1,234.56':[',','.'],'1.234,56':['.',','],'1 234,56':[' ',','],'1234.56':['','.']};
 var sep=formats[c.number_format]||formats['1,234.56'],scale=10n**BigInt(c.decimals);
 var w=(value/scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g,sep[0]);
 var f=c.decimals?sep[1]+(value%scale).toString().padStart(c.decimals,'0'):'';
 return c.prefix+w+f+(c.suffix?' '+c.suffix:'');
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
