import { createHash } from 'node:crypto';

/** Trusted static behavior; subscriber content never enters executable source. */
export const BANNER_SCRIPT = `(function(){
  var root=document.querySelector('[data-banner-stage]');if(!root)return;
  var slides=Array.from(root.querySelectorAll('.p2-banner-slide')),dots=Array.from(root.querySelectorAll('[data-banner-dot]'));
  if(!slides.length)return;
  var index=0,timer=null,userPaused=false,hover=false,focus=false,start=null,swiped=false,firstReady=false,request=0,pending=false,loads=new Map();
  var frame=root.querySelector('.p2-banner-images');
  var motion=window.matchMedia('(prefers-reduced-motion: reduce)'),pause=root.querySelector('[data-banner-pause]');
  var wanted=root.dataset.autoplay==='true',delay=Number(root.dataset.interval)*1000;
  function ensure(i){
    if(loads.has(i))return loads.get(i);
    var img=slides[i].querySelector('img');
    var work=new Promise(function(resolve){
      if(!img){resolve(false);return;}
      function failed(){img.removeEventListener('load',loaded);img.removeEventListener('error',failed);resolve(false);}
      function loaded(){
        img.removeEventListener('load',loaded);img.removeEventListener('error',failed);
        var decoded=img.decode?img.decode():Promise.resolve();
        decoded.then(function(){if(!img.naturalWidth){resolve(false);return;}img.classList.add('p2-image-ready');resolve(true);},failed);
      }
      img.addEventListener('load',loaded);img.addEventListener('error',failed);
      if(!img.getAttribute('src')){img.loading='eager';img.src=img.dataset.src;}
      else if(img.complete){if(img.naturalWidth)loaded();else failed();}
    });
    loads.set(i,work);return work;
  }
  function preloadNext(){if(slides.length>1)ensure((index+1)%slides.length);}
  function schedule(){
    clearInterval(timer);timer=null;
    var playing=slides.length>1&&firstReady&&!pending&&wanted&&!userPaused&&!hover&&!focus&&!motion.matches&&!document.hidden;
    if(pause){pause.hidden=motion.matches;pause.textContent=wanted&&!userPaused?'Pause slideshow':'Play slideshow';pause.setAttribute('aria-pressed',String(userPaused||!wanted));}
    if(playing)timer=setInterval(function(){show(index+1,false);},delay);
  }
  function show(next,manual){
    var target=(next+slides.length)%slides.length,ticket=++request;pending=true;schedule();
    ensure(target).then(function(ready){
      if(ticket!==request)return;
      pending=false;
      if(ready){
        index=target;firstReady=true;frame.setAttribute('aria-busy','false');
        slides.forEach(function(s,i){s.hidden=i!==index;s.setAttribute('aria-hidden',String(i!==index));});
        dots.forEach(function(d,i){d.setAttribute('aria-current',String(i===index));});
        var status=root.querySelector('[data-banner-status]');
        if(status){status.setAttribute('aria-live',manual?'polite':'off');status.textContent='Banner '+(index+1)+' of '+slides.length;}
        preloadNext();
      }
      schedule();
    });
  }
  if(slides.length===1){ensure(0).then(function(ready){if(ready)frame.setAttribute('aria-busy','false');});return;}
  var prev=root.querySelector('[data-banner-prev]'),next=root.querySelector('[data-banner-next]');
  if(prev)prev.addEventListener('click',function(){show(index-1,true);});
  if(next)next.addEventListener('click',function(){show(index+1,true);});
  dots.forEach(function(d,i){d.addEventListener('click',function(){show(i,true);});});
  if(pause)pause.addEventListener('click',function(){if(!wanted){wanted=true;userPaused=false;}else userPaused=!userPaused;schedule();});
  root.addEventListener('mouseenter',function(){hover=true;schedule();});
  root.addEventListener('mouseleave',function(){hover=false;schedule();});
  root.addEventListener('focusin',function(){focus=true;schedule();});
  root.addEventListener('focusout',function(e){focus=root.contains(e.relatedTarget);schedule();});
  root.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(index+(e.key==='ArrowLeft'?-1:1),true);}});
  root.addEventListener('pointerdown',function(e){swiped=false;if(e.isPrimary&&e.pointerType==='touch')start={x:e.clientX,y:e.clientY};});
  root.addEventListener('pointerup',function(e){if(!start)return;var dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){swiped=true;show(index+(dx<0?1:-1),true);}});
  root.addEventListener('pointercancel',function(){start=null;});
  root.addEventListener('click',function(e){if(swiped){e.preventDefault();swiped=false;}},true);
  document.addEventListener('visibilitychange',schedule);
  motion.addEventListener('change',schedule);
  ensure(0).then(function(ready){if(ready){firstReady=true;frame.setAttribute('aria-busy','false');preloadNext();}schedule();});
  schedule();
})();`;
export const BANNER_SCRIPT_HASH=createHash('sha256').update(BANNER_SCRIPT).digest('base64');
