import { createHash } from 'node:crypto';

/**
 * Storefront browser script. One identical constant for every commerce-enabled site; all per-store
 * values are read from the escaped application/json blob #cx-config. No inline handlers, no dependencies,
 * credentials are always omitted and prices come from the server quote only.
 */
export const COMMERCE_SCRIPT = String.raw`(function(){
'use strict';
var cfgEl=document.getElementById('cx-config');if(!cfgEl)return;
var cfg;try{cfg=JSON.parse(cfgEl.textContent||'{}');}catch(e){return;}
var slug=String(cfg.slug||''),base='/'+slug,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var CART_KEY='bhru-cart:'+slug,CK_KEY='bhru-checkout:'+slug,RC_KEY='bhru-receipt:'+slug;
var live=document.getElementById('cx-live');
function say(t){if(!live)return;live.textContent='';window.setTimeout(function(){live.textContent=t;},30);}
function store(kind){try{return kind==='s'?window.sessionStorage:window.localStorage;}catch(e){return null;}}
function read(kind,key){var s=store(kind);if(!s)return null;try{var v=s.getItem(key);return v?JSON.parse(v):null;}catch(e){return null;}}
function write(kind,key,val){var s=store(kind);if(!s)return;try{s.setItem(key,JSON.stringify(val));}catch(e){}}
function drop(kind,key){var s=store(kind);if(!s)return;try{s.removeItem(key);}catch(e){}}
function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;}
function clampQty(n,max){n=parseInt(n,10);if(!(n>=1))n=1;var m=Math.min(99,max||99);return n>m?m:n;}
/* ---- money (integer minor units, two decimals, BigInt safe) ---- */
function money(minor,cur){var s=String(minor==null?'0':minor);if(!/^-?\d{1,20}$/.test(s))return '';var neg=s.charAt(0)==='-';if(neg)s=s.slice(1);
 var b;try{b=BigInt(s);}catch(e){return '';}var i=(b/100n).toString(),f=(b%100n).toString();if(f.length<2)f='0'+f;
 return (neg?'-':'')+i.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+f+' '+String(cur||cfg.currency||'');}
/* ---- cart: ids and quantities only ---- */
function loadCart(){var raw=read('l',CART_KEY),out=[];if(!Array.isArray(raw))return out;
 raw.forEach(function(r){if(r&&typeof r.id==='string'&&UUID.test(r.id)){var q=parseInt(r.q,10);if(q>=1&&q<=99&&!out.some(function(o){return o.id===r.id;}))out.push({id:r.id,q:q});}});return out;}
function saveCart(c){if(c.length)write('l',CART_KEY,c);else drop('l',CART_KEY);renderCount();}
function cartCount(){return loadCart().reduce(function(a,r){return a+r.q;},0);}
function renderCount(){var n=cartCount();Array.prototype.forEach.call(document.querySelectorAll('[data-cx-count]'),function(c){c.textContent=String(n);c.hidden=false;});
 Array.prototype.forEach.call(document.querySelectorAll('[data-cx-cart-link]'),function(a){a.setAttribute('aria-label','Cart, '+n+(n===1?' item':' items'));});}
function addToCart(id,q,max){if(!UUID.test(id))return;var c=loadCart(),f=c.filter(function(r){return r.id===id;})[0];
 if(f)f.q=clampQty(f.q+q,max);else c.push({id:id,q:clampQty(q,max)});saveCart(c);}
/* ---- network: guest only, never login ---- */
function api(path,body){var o={credentials:'omit',headers:{'X-BHRU-Request':'1','Accept':'application/json'}};
 if(body){o.method='POST';o.headers['Content-Type']='application/json';o.body=JSON.stringify(body);}
 return fetch('/api/public/commerce/'+encodeURIComponent(slug)+path,o).then(function(r){return r.json().catch(function(){return {};}).then(function(j){if(!r.ok){var e=new Error('request');e.status=r.status;throw e;}return j;});});}
/* ---- product cards (mirrors server markup) ---- */
function safeSrc(u){return typeof u==='string'&&(/^\/api\/public\/media\/[a-f0-9-]{36}\.(png|jpg)(\?[a-z0-9.=]*)?$/.test(u)||/^https:\/\//.test(u))?u:'';}
function card(p){
 var li=el('li','cx-card'),link=el('a','cx-media');link.href=base+'/product/'+encodeURIComponent(p.slug||'');
 var im=p.images&&p.images[0],src=im?safeSrc(im.url):'';
 if(src){var img=el('img');img.src=src;img.alt=p.name||'';img.loading='lazy';img.decoding='async';img.width=im.width||600;img.height=im.height||600;link.appendChild(img);}else{link.appendChild(el('span','cx-ph','No image'));}
 if(p.featured)link.appendChild(el('span','cx-flag','Featured'));
 li.appendChild(link);var body=el('div','cx-body'),h=el('h3','cx-name'),a=el('a',null,p.name||'');a.href=link.href;h.appendChild(a);body.appendChild(h);
 var pr=el('p','cx-price');pr.appendChild(el('strong',null,money(p.price_minor)));
 if(p.compare_at_minor&&BigInt(p.compare_at_minor)>BigInt(p.price_minor)){var s=el('s','cx-was',money(p.compare_at_minor));pr.appendChild(s);}
 body.appendChild(pr);
 var max=stockMax(p);
 if(max>0){var b=el('button','cx-btn cx-btn-solid','Add to cart');b.type='button';b.setAttribute('data-cx-add',p.id);b.setAttribute('data-max',String(max));b.setAttribute('aria-label','Add '+(p.name||'product')+' to cart');body.appendChild(b);}
 else{body.appendChild(el('p','cx-out','Out of stock'));}
 li.appendChild(body);return li;}
function stockMax(p){if(!p.in_stock)return 0;if(p.stock_quantity==null)return 99;var n=parseInt(p.stock_quantity,10);return n>0?Math.min(99,n):0;}
/* ---- global click delegation ---- */
document.addEventListener('click',function(ev){
 var t=ev.target;if(!(t instanceof Element))return;
 var add=t.closest('[data-cx-add]');
 if(add){var id=add.getAttribute('data-cx-add'),max=parseInt(add.getAttribute('data-max')||'99',10),qi=document.querySelector('[data-cx-qty]');
  var q=qi&&add.hasAttribute('data-cx-withqty')?clampQty(qi.value,max):1;addToCart(id,q,max);say('Added to cart.');
  var lbl=add.textContent;add.textContent='Added';window.setTimeout(function(){add.textContent=lbl;},1400);return;}
 var buy=t.closest('[data-cx-buy]');
 if(buy){var bid=buy.getAttribute('data-cx-buy'),bm=parseInt(buy.getAttribute('data-max')||'99',10),bq=document.querySelector('[data-cx-qty]');
  addToCart(bid,bq?clampQty(bq.value,bm):1,bm);window.location.assign(base+'/checkout');return;}
 var step=t.closest('[data-cx-step]');
 if(step){var inp=document.querySelector('[data-cx-qty]');if(inp){var mx=parseInt(inp.getAttribute('max')||'99',10);inp.value=String(clampQty((parseInt(inp.value,10)||1)+parseInt(step.getAttribute('data-cx-step'),10),mx));}return;}
 var th=t.closest('[data-cx-thumb]');
 if(th){var main=document.getElementById('cx-main-img');if(main){main.src=th.getAttribute('data-src')||main.src;main.alt=th.getAttribute('data-alt')||'';
   Array.prototype.forEach.call(document.querySelectorAll('[data-cx-thumb]'),function(b){b.setAttribute('aria-pressed',b===th?'true':'false');});}return;}
});
/* ---- home: category filter + load more ---- */
function initHome(){
 var grid=document.getElementById('cx-grid'),more=document.getElementById('cx-more'),status=document.getElementById('cx-home-status');if(!grid)return;
 var cat='',page=parseInt(cfg.page,10)||1,busy=false;
 function setStatus(t){if(status)status.textContent=t;}
 function load(reset){if(busy)return;busy=true;var next=reset?1:page+1;if(more)more.disabled=true;setStatus('Loading products...');
  api('/catalog?page='+next+(cat?'&category='+encodeURIComponent(cat):'')).then(function(j){
   var rows=Array.isArray(j.data)?j.data:[];if(reset){grid.textContent='';}
   rows.forEach(function(p){grid.appendChild(card(p));});page=next;
   var empty=document.getElementById('cx-empty');if(empty)empty.hidden=grid.children.length>0;
   if(more)more.hidden=!j.has_more;setStatus(rows.length?'':(reset?'No products in this category.':''));
  }).catch(function(){setStatus('Products could not be loaded. Please try again.');}).then(function(){busy=false;if(more)more.disabled=false;});}
 if(more)more.addEventListener('click',function(){load(false);});
 Array.prototype.forEach.call(document.querySelectorAll('[data-cx-cat]'),function(b){b.addEventListener('click',function(){
  cat=b.getAttribute('data-cx-cat')||'';if(cat&&!UUID.test(cat))return;
  Array.prototype.forEach.call(document.querySelectorAll('[data-cx-cat]'),function(o){o.setAttribute('aria-pressed',o===b?'true':'false');});load(true);});});
}
/* ---- quote ---- */
function quote(cart){return api('/quote',{items:cart.map(function(r){return {product_id:r.id,quantity:r.q};})}).then(function(j){return j&&j.data?j.data:{items:[],subtotal_minor:'0',total_minor:'0',currency:cfg.currency};});}
function reconcile(q){var ids={};q.items.forEach(function(i){ids[i.product_id]=i.quantity;});var cart=loadCart(),before=JSON.stringify(cart);
 cart=cart.filter(function(r){return ids[r.id]!=null;}).map(function(r){return {id:r.id,q:Math.min(r.q,ids[r.id])};});
 var changed=before!==JSON.stringify(cart);if(changed){saveCart(cart);}return changed;}
function emptyBlock(title,text,href,label){var d=el('div','cx-empty-state');d.appendChild(el('h2',null,title));d.appendChild(el('p',null,text));var a=el('a','cx-btn cx-btn-solid',label);a.href=href;d.appendChild(a);return d;}
function errorBlock(retry){var d=el('div','cx-empty-state');d.setAttribute('role','alert');d.appendChild(el('h2',null,'Something went wrong'));d.appendChild(el('p',null,'We could not load your cart. Please try again.'));var b=el('button','cx-btn cx-btn-solid','Try again');b.type='button';b.addEventListener('click',retry);d.appendChild(b);return d;}
function skeleton(root){root.textContent='';var s=el('div','cx-skel');s.setAttribute('aria-busy','true');s.appendChild(el('span','cx-sr','Loading'));root.appendChild(s);}
function lineImg(i){var src=safeSrc(i.image_url);if(src){var im=el('img');im.src=src;im.alt='';im.loading='lazy';im.width=72;im.height=72;return im;}return el('span','cx-ph cx-ph-sm');}
/* ---- cart page ---- */
function initCart(){
 var root=document.getElementById('cx-cart');if(!root)return;
 function draw(){var cart=loadCart();
  if(!cart.length){root.textContent='';root.appendChild(emptyBlock('Your cart is empty','Browse the store and add something you like.',base+'#store-products','Continue shopping'));return;}
  skeleton(root);
  quote(cart).then(function(q){var removed=reconcile(q);if(!q.items.length){draw();return;}paint(q,removed);}).catch(function(){root.textContent='';root.appendChild(errorBlock(draw));});}
 function paint(q,removed){root.textContent='';
  if(removed){var n=el('p','cx-note','Your cart was updated to match current availability.');n.setAttribute('role','status');root.appendChild(n);}
  var list=el('ul','cx-lines');
  q.items.forEach(function(i){var li=el('li','cx-line');li.appendChild(lineImg(i));
   var info=el('div','cx-line-info');info.appendChild(el('strong',null,i.product_name));info.appendChild(el('span','cx-muted',money(i.unit_price_minor,q.currency)));
   var ctl=el('div','cx-qty');
   function mk(label,delta,sym){var b=el('button','cx-step',sym);b.type='button';b.setAttribute('aria-label',label+' '+i.product_name);b.addEventListener('click',function(){var c=loadCart();c.forEach(function(r){if(r.id===i.product_id)r.q=clampQty(r.q+delta);});saveCart(c);draw();});return b;}
   var dec=mk('Decrease quantity of',-1,'-');if(i.quantity<=1)dec.disabled=true;var inc=mk('Increase quantity of',1,'+');if(i.quantity>=99)inc.disabled=true;
   var out=el('span','cx-qty-n',i.quantity);out.setAttribute('aria-label','Quantity '+i.quantity);ctl.appendChild(dec);ctl.appendChild(out);ctl.appendChild(inc);info.appendChild(ctl);
   var side=el('div','cx-line-side');side.appendChild(el('strong',null,money(i.line_total_minor,q.currency)));
   var rm=el('button','cx-link','Remove');rm.type='button';rm.setAttribute('aria-label','Remove '+i.product_name+' from cart');rm.addEventListener('click',function(){saveCart(loadCart().filter(function(r){return r.id!==i.product_id;}));say('Item removed.');draw();});side.appendChild(rm);
   li.appendChild(info);li.appendChild(side);list.appendChild(li);});
  root.appendChild(list);
  var sum=el('div','cx-sum');var row=el('p','cx-sum-row');row.appendChild(el('span',null,'Subtotal'));row.appendChild(el('strong',null,money(q.subtotal_minor,q.currency)));sum.appendChild(row);
  var tot=el('p','cx-sum-row cx-sum-total');tot.appendChild(el('span',null,'Total'));tot.appendChild(el('strong',null,money(q.total_minor,q.currency)));sum.appendChild(tot);
  var go=el('a','cx-btn cx-btn-solid cx-wide','Proceed to checkout');go.href=base+'/checkout';sum.appendChild(go);
  var cont=el('a','cx-btn cx-wide','Continue shopping');cont.href=base+'#store-products';sum.appendChild(cont);root.appendChild(sum);}
 draw();
}
/* ---- checkout page ---- */
function uuid(){if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();var b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=Array.prototype.map.call(b,function(x){return ('0'+x.toString(16)).slice(-2);}).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function initCheckout(){
 var root=document.getElementById('cx-checkout');if(!root)return;var s=cfg.settings||{};
 function draw(){var cart=loadCart();
  if(!cart.length){root.textContent='';root.appendChild(emptyBlock('Your cart is empty','Add products before checking out.',base+'#store-products','Browse products'));return;}
  skeleton(root);
  quote(cart).then(function(q){reconcile(q);if(!q.items.length){draw();return;}paint(q);}).catch(function(){root.textContent='';root.appendChild(errorBlock(draw));});}
 function paint(q){root.textContent='';var saved=read('l',CK_KEY),prev=saved&&saved.payload?saved.payload:{};
  var wrap=el('div','cx-checkout');var form=el('form','cx-form');form.noValidate=true;
  form.appendChild(el('h2',null,'Your details'));
  var err=el('p','cx-form-error');err.setAttribute('role','alert');err.hidden=true;
  var fields={};
  function field(name,label,mode,type,multi){var w=el('div','cx-field');var id='cx-f-'+name;var l=el('label',null,label+(mode==='required'?'':' (optional)'));l.setAttribute('for',id);
   var i=multi?el('textarea'):el('input');i.id=id;i.name=name;if(!multi){i.type=type||'text';}else{i.rows=3;}i.maxLength=multi?500:160;i.value=prev[name]||'';
   if(mode==='required')i.setAttribute('aria-required','true');var m=el('span','cx-field-err');m.id=id+'-err';m.hidden=true;i.setAttribute('aria-describedby',m.id);
   w.appendChild(l);w.appendChild(i);w.appendChild(m);form.appendChild(w);fields[name]={input:i,msg:m,mode:mode,label:label};}
  field('customer_name','Full name','required','text');field('phone','Phone number','required','tel');
  if(s.email_mode!=='hidden')field('email','Email',s.email_mode,'email');
  if(s.show_state)field('state','State','optional','text');if(s.show_city)field('city','City','optional','text');
  if(s.address_mode!=='hidden')field('address','Address',s.address_mode,'text',true);
  if(s.show_note)field('note','Order note','optional','text',true);
  form.appendChild(err);
  var submit=el('button','cx-btn cx-btn-solid cx-wide','Place order');submit.type='submit';form.appendChild(submit);
  var back=el('a','cx-btn cx-wide','Back to cart');back.href=base+'/cart';form.appendChild(back);
  var aside=el('aside','cx-sum');aside.setAttribute('aria-label','Order summary');aside.appendChild(el('h2',null,'Order summary'));
  var ul=el('ul','cx-lines');q.items.forEach(function(i){var li=el('li','cx-line');li.appendChild(lineImg(i));var info=el('div','cx-line-info');info.appendChild(el('strong',null,i.product_name));info.appendChild(el('span','cx-muted',i.quantity+' x '+money(i.unit_price_minor,q.currency)));
   var side=el('div','cx-line-side');side.appendChild(el('strong',null,money(i.line_total_minor,q.currency)));li.appendChild(info);li.appendChild(side);ul.appendChild(li);});aside.appendChild(ul);
  var tot=el('p','cx-sum-row cx-sum-total');tot.appendChild(el('span',null,'Total'));tot.appendChild(el('strong',null,money(q.total_minor,q.currency)));aside.appendChild(tot);
  wrap.appendChild(aside);wrap.appendChild(form);root.appendChild(wrap);
  var inflight=false;
  form.addEventListener('submit',function(ev){ev.preventDefault();if(inflight)return;err.hidden=true;var bad=null;
   var vals={};Object.keys(fields).forEach(function(k){var f=fields[k];var v=f.input.value.trim();vals[k]=v;f.msg.hidden=true;f.input.removeAttribute('aria-invalid');var m='';
    if(f.mode==='required'&&!v)m='Please enter your '+f.label.toLowerCase()+'.';
    else if(k==='phone'&&v&&!/^[+0-9()\-. ]{6,24}$/.test(v))m='Please enter a valid phone number.';
    else if(k==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))m='Please enter a valid email address.';
    if(m){f.msg.textContent=m;f.msg.hidden=false;f.input.setAttribute('aria-invalid','true');if(!bad)bad=f.input;}});
   if(bad){bad.focus();return;}
   var payload={items:q.items.map(function(i){return {product_id:i.product_id,quantity:i.quantity};})};
   Object.keys(vals).forEach(function(k){if(vals[k])payload[k]=vals[k];});
   var rec=read('l',CK_KEY);
   if(rec&&rec.key&&UUID.test(rec.key)&&JSON.stringify(rec.payload)!==JSON.stringify(payload)){
    err.textContent='A previous submission may still be pending. Retry with the original details before starting another order.';err.hidden=false;return;
   }
   var key=rec&&rec.key&&UUID.test(rec.key)?rec.key:uuid();
   write('l',CK_KEY,{key:key,payload:payload});
   var body={checkout_key:key};Object.keys(payload).forEach(function(k){body[k]=payload[k];});
   inflight=true;submit.disabled=true;submit.textContent='Placing order...';submit.setAttribute('aria-busy','true');
   api('/orders',body).then(function(j){var d=j&&j.data;if(!d||!d.reference)throw new Error('bad');
    write('s',RC_KEY,d);drop('l',CART_KEY);drop('l',CK_KEY);window.location.replace(base+'/confirmation');
   }).catch(function(e){inflight=false;submit.disabled=false;submit.textContent='Place order';submit.removeAttribute('aria-busy');
    if(e&&e.status===400)drop('l',CK_KEY);
    err.textContent=e&&(e.status===409||e.status===422)?'Some items in your cart are no longer available. Please review your cart and try again.':'We could not place your order. Please check your details and try again.';err.hidden=false;});
  });}
 draw();
}
/* ---- confirmation page ---- */
function initConfirmation(){
 var root=document.getElementById('cx-confirmation');if(!root)return;var r=read('s',RC_KEY);root.textContent='';
 if(!r||typeof r.reference!=='string'){root.appendChild(emptyBlock('No recent order found','Orders are shown here right after checkout on the same device.',base+'#store-products','Continue shopping'));return;}
 var box=el('div','cx-confirm');box.setAttribute('role','status');box.appendChild(el('h2',null,'Order received'));
 box.appendChild(el('p','cx-ref',r.reference));
 var dl=el('dl','cx-facts');function row(k,v){var d=el('div');d.appendChild(el('dt',null,k));d.appendChild(el('dd',null,v));dl.appendChild(d);}
 row('Customer',r.customer_name||'');row('Total',money(r.total_minor,r.currency));row('Status','New');box.appendChild(dl);
 if(r.confirmation_message)box.appendChild(el('p',null,r.confirmation_message));
 var wa=String(r.whatsapp||'').replace(/[\s\-().]/g,'');
 if(/^\+?[0-9]{6,15}$/.test(wa)){var a=el('a','cx-btn cx-wide','Message us on WhatsApp');a.href='https://wa.me/'+wa.replace('+','')+'?text='+encodeURIComponent('Hello, my order reference is '+r.reference);a.target='_blank';a.rel='noopener noreferrer';box.appendChild(a);}
 var home=el('a','cx-btn cx-btn-solid cx-wide','Continue shopping');home.href=base+'#store-products';box.appendChild(home);root.appendChild(box);
}
renderCount();initHome();initCart();initCheckout();initConfirmation();
window.addEventListener('pageshow',function(e){if(e.persisted)renderCount();});
window.addEventListener('storage',function(e){if(e.key===CART_KEY)renderCount();});
})();`;

export const COMMERCE_SCRIPT_HASH = `'sha256-${createHash('sha256').update(COMMERCE_SCRIPT).digest('base64')}'`;
