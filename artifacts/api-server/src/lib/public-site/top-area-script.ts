import { createHash } from 'node:crypto';

/** Optional extension, leaving the frozen V2 menu and its default CSP untouched. */
export const TOP_AREA_SCRIPT=`(function(){
  var top=document.querySelector('.p2-top-area');if(!top)return;
  var menu=document.querySelector('details.menu'),mobile=window.matchMedia('(max-width:959px)'),blocked=false,wasInert=false,wasHidden=null;
  function sync(){
    var open=menu&&menu.open&&mobile.matches;
    if(open&&!blocked){wasInert=top.inert;wasHidden=top.getAttribute('aria-hidden');top.inert=true;top.setAttribute('aria-hidden','true');blocked=true;}
    if(!open&&blocked){top.inert=wasInert;if(wasHidden===null)top.removeAttribute('aria-hidden');else top.setAttribute('aria-hidden',wasHidden);blocked=false;}
  }
  if(menu)menu.addEventListener('toggle',sync);mobile.addEventListener('change',sync);sync();
  top.querySelectorAll('[data-announcement-pause]').forEach(function(button){
    button.addEventListener('click',function(){
      var bar=button.closest('.p2-announcement'),paused=bar.classList.toggle('p2-paused');
      button.setAttribute('aria-pressed',String(paused));button.textContent=paused?'Resume motion':'Pause motion';
    });
  });
})();`;
export const TOP_AREA_SCRIPT_HASH=createHash('sha256').update(TOP_AREA_SCRIPT).digest('base64');
