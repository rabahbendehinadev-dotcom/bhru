import { createHash } from 'node:crypto';
import { PUBLIC_MENU_SCRIPT } from '../public-site/mobile-menu';

// Extend the existing mobile focus trap for these commerce-only controls, without
// changing the frozen non-commerce template or its script.
export const STOREFRONT_MENU_SCRIPT = PUBLIC_MENU_SCRIPT.replace(
  "menu.querySelectorAll('.menu-panel a[href]')",
  "Array.from(menu.querySelectorAll('.menu-panel a[href], .menu-panel button, .menu-panel summary')).filter(element => element.getClientRects().length)",
);
export const STOREFRONT_MENU_HASH = `'sha256-${createHash('sha256').update(STOREFRONT_MENU_SCRIPT).digest('base64')}'`;

export const STOREFRONT_HEADER_SCRIPT = String.raw`(function(){
'use strict';
var node=document.getElementById('sf-config');if(!node)return;
var cfg;try{cfg=JSON.parse(node.textContent||'{}');}catch(e){return;}
var header=document.querySelector('.sf-header'),dialog=document.getElementById('sf-customer-auth');
if(!header)return;
var key='bhru-storefront-preferences:'+cfg.slug,selected={language:cfg.defaultLanguage,currency:cfg.defaultCurrency};
try{var saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved==='object'){
 if(cfg.enabledLanguages.indexOf(saved.language)!==-1)selected.language=saved.language;
 if(cfg.enabledCurrencies.indexOf(saved.currency)!==-1)selected.currency=saved.currency;
}}catch(e){}
function all(q,fn){Array.prototype.forEach.call(header.querySelectorAll(q),fn);}
function closePickers(except){all('.sf-picker[open]',function(p){if(p!==except)p.open=false;});}
function persist(){try{localStorage.setItem(key,JSON.stringify(selected));}catch(e){}}
function sync(){
 var lang=cfg.languages.filter(function(l){return l.code===selected.language;})[0]||cfg.languages[0];
 // Requested currency is a preference, never a conversion. All money formatters
 // continue using the authoritative base currency, including quotes and receipts.
 document.documentElement.dataset.sfDirection=lang.rtl?'rtl':'ltr';
 header.dir=lang.rtl?'rtl':'ltr';
 all('[data-sf-language]',function(n){n.textContent=lang.name;});
 all('[data-sf-flag]',function(n){n.src='https://flagcdn.com/w40/'+lang.flag+'.png';});
 all('[data-sf-currency]',function(n){n.textContent=selected.currency;});
 all('[data-sf-language-option]',function(n){n.setAttribute('aria-pressed',String(n.dataset.sfLanguageOption===selected.language));});
 all('[data-sf-currency-option]',function(n){n.setAttribute('aria-pressed',String(n.dataset.sfCurrencyOption===selected.currency));});
 var notes=[];
 if(cfg.translatedLanguages.indexOf(lang.code)===-1)notes.push(lang.name+' selected. Translations are not available yet; storefront content remains English.');
 if(selected.currency!==cfg.baseCurrency)notes.push(selected.currency+' selected. Conversion is unavailable; all prices and totals remain in '+cfg.baseCurrency+'.');
 var notice=header.querySelector('[data-sf-notice]');notice.textContent=notes.join(' ');notice.hidden=!notes.length;
 // One resolved display context for every commerce page. No exchange rates,
 // price mutation, checkout inputs or API requests are introduced.
 window.bhruStorefrontContext=Object.freeze({store:cfg.slug,requestedLanguage:lang.code,contentLanguage:'en',direction:lang.rtl?'rtl':'ltr',requestedCurrency:selected.currency,displayCurrency:cfg.baseCurrency,conversionAvailable:false});
}
header.addEventListener('click',function(ev){
 var t=ev.target;if(!(t instanceof Element))return;
 var summary=t.closest('.sf-picker>summary');
 if(summary){closePickers(summary.parentElement);return;}
 var l=t.closest('[data-sf-language-option]'),c=t.closest('[data-sf-currency-option]');
 if(l||c){if(l)selected.language=l.dataset.sfLanguageOption;if(c)selected.currency=c.dataset.sfCurrencyOption;persist();sync();closePickers();
  var picker=(l||c).closest('.sf-picker');if(picker)picker.querySelector('summary').focus();return;}
 var a=t.closest('[data-sf-auth]');
 if(a&&dialog){
  closePickers();var menu=header.querySelector('details.menu');
  var mobile=window.matchMedia('(max-width:959px)').matches;
  if(menu.open){menu.open=false;menu.dispatchEvent(new Event('toggle'));}
  document.getElementById('sf-auth-title').textContent='Customer '+a.dataset.sfAuth;
  var restore=mobile?menu.querySelector('summary'):a;
  dialog.addEventListener('close',function(){restore.focus();},{once:true});
  dialog.showModal();
 }
});
document.addEventListener('click',function(ev){if(!header.contains(ev.target))closePickers();});
document.addEventListener('keydown',function(ev){
 var p=header.querySelector('.sf-picker[open]');
 if(ev.key==='Escape'&&p){ev.preventDefault();ev.stopImmediatePropagation();closePickers();p.querySelector('summary').focus();return;}
 if(!p||!p.contains(ev.target))return;
 var items=Array.prototype.slice.call(p.querySelectorAll('button')),i=items.indexOf(document.activeElement);
 if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();var next=i<0?(ev.key==='ArrowDown'?0:items.length-1):(i+(ev.key==='ArrowDown'?1:items.length-1))%items.length;items[next].focus();}
 if(ev.key==='Home'||ev.key==='End'){ev.preventDefault();items[ev.key==='Home'?0:items.length-1].focus();}
},true);
header.addEventListener('focusout',function(){setTimeout(function(){all('.sf-picker[open]',function(p){if(!p.contains(document.activeElement))p.open=false;});},0);});
window.addEventListener('storage',function(ev){if(ev.key!==key)return;try{var v=JSON.parse(ev.newValue||'null');if(v){
 if(cfg.enabledLanguages.indexOf(v.language)!==-1)selected.language=v.language;
 if(cfg.enabledCurrencies.indexOf(v.currency)!==-1)selected.currency=v.currency;sync();
}}catch(e){}});
if(dialog)dialog.addEventListener('click',function(ev){if(ev.target===dialog){var r=dialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)dialog.close();}});
sync();
})();`;
export const STOREFRONT_HEADER_HASH = `'sha256-${createHash('sha256').update(STOREFRONT_HEADER_SCRIPT).digest('base64')}'`;
