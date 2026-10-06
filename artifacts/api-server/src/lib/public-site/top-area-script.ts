import { createHash } from 'node:crypto';

/** Optional extension, leaving the frozen V2 menu and its default CSP untouched. */
export const TOP_AREA_SCRIPT=`(function(){
  var top=document.querySelector('.p2-top-area');if(!top)return;
  var menu=document.querySelector('details.menu'),mobile=window.matchMedia('(max-width:959px)'),blocked=false,wasInert=false,wasHidden=null;
  function sync(){
    var open=menu&&menu.open&&mobile.matches;
    top.classList.toggle('p2-menu-paused',Boolean(open));
    if(open&&!blocked){wasInert=top.inert;wasHidden=top.getAttribute('aria-hidden');top.inert=true;top.setAttribute('aria-hidden','true');blocked=true;}
    if(!open&&blocked){top.inert=wasInert;if(wasHidden===null)top.removeAttribute('aria-hidden');else top.setAttribute('aria-hidden',wasHidden);blocked=false;}
  }
  if(menu)menu.addEventListener('toggle',sync);mobile.addEventListener('change',sync);sync();
  var motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  top.querySelectorAll('[data-ticker]').forEach(function(root){
    var track=root.querySelector('.p2-ticker-track'),group=track.querySelector('.p2-ticker-group');
    var originals=Array.from(group.children),button=root.querySelector('[data-ticker-pause]'),queued=false;
    var partner=Boolean(root.closest('.p2-partner-strip')),lastViewport=0,lastWidth=0;
    function copy(node){
      var clone=node.cloneNode(true);clone.setAttribute('data-ticker-copy','');clone.setAttribute('aria-hidden','true');
      clone.querySelectorAll('a').forEach(function(a){a.tabIndex=-1;});
      clone.querySelectorAll('img').forEach(function(img){img.loading='lazy';});
      return clone;
    }
    function rebuild(){
      if(root.classList.contains('p2-focus-static')){if(button)button.hidden=motion.matches;return;}
      // Partner cards have fixed dimensions. Ignore repeated size/font notices
      // when the geometry is unchanged, keeping the animation's current phase.
      if(partner&&!motion.matches&&root.classList.contains('p2-ready')&&lastViewport===root.clientWidth&&lastWidth===group.getBoundingClientRect().width)return;
      root.classList.remove('p2-ready');
      track.querySelectorAll('[data-ticker-copy]').forEach(function(node){node.remove();});
      if(motion.matches){if(button)button.hidden=true;return;}
      // Fill short sequences to at least one viewport; two equal halves then
      // translate exactly one sequence width, including its trailing spacing.
      for(var i=0;i<64&&group.getBoundingClientRect().width<root.clientWidth;i++){
        originals.forEach(function(node){group.appendChild(copy(node));});
      }
      var width=group.getBoundingClientRect().width;if(!width||!root.clientWidth)return;
      track.appendChild(copy(group));
      root.style.setProperty('--p2-duration',String(width/(Number(root.dataset.speed)||45))+'s');
      root.scrollLeft=0;root.classList.add('p2-ready');if(button)button.hidden=false;
      if(partner){lastViewport=root.clientWidth;lastWidth=width;}
    }
    function refresh(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;rebuild();});}
    if(button)button.addEventListener('click',function(){
      var paused=root.classList.toggle('p2-paused');
      button.setAttribute('aria-pressed',String(paused));button.textContent=paused?'Resume motion':'Pause motion';
    });
    root.addEventListener('focusin',function(event){
      if(group.contains(event.target)&&!event.target.closest('[data-ticker-copy]')){
        root.classList.add('p2-focus-static');
        event.target.scrollIntoView({block:'nearest',inline:'nearest'});
      }
    });
    root.addEventListener('focusout',function(event){
      if(!root.contains(event.relatedTarget)){root.classList.remove('p2-focus-static');refresh();}
    });
    function visibility(){root.classList.toggle('p2-background-paused',document.hidden);}
    document.addEventListener('visibilitychange',visibility);visibility();
    motion.addEventListener('change',refresh);
    if(window.ResizeObserver)new ResizeObserver(refresh).observe(root);else window.addEventListener('resize',refresh);
    if(document.fonts)document.fonts.ready.then(refresh);
    rebuild();
  });
})();`;
export const TOP_AREA_SCRIPT_HASH=createHash('sha256').update(TOP_AREA_SCRIPT).digest('base64');
