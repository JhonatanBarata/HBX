// Small global helper for page transitions and navigation
// Implements fetch-based swap of `.wrap` content to avoid full reload and
// performs staggered exit/enter animations for tiles/buttons.
async function navigateWithTransition(url){
  try{
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) { window.open(url, '_blank'); return; }
  }catch(e){ /* ignore malformed url */ }

  // For certain admin pages that initialize complex state (charts, event listeners)
  // prefer a full reload to avoid duplicated JS state after SPA swaps.
  try{
    const path = String(url || '').toLowerCase();
    if (path.includes('dashboard') || path.includes('/clientes') || path.includes('/client.html')){
      location.href = url;
      return;
    }
  }catch(e){}

  const root = document.querySelector('.wrap');
  if (!root) { location.href = url; return; }

  // exit animation: stagger buttons then tiles
  document.body.classList.add('page-exiting');
  const animated = root.querySelectorAll('.tile, .btn, .icon');
  animated.forEach((el,i)=>{ el.style.transition = 'transform .48s cubic-bezier(.2,.9,.2,1), opacity .38s ease'; el.style.transitionDelay = `${i*30}ms`; el.style.transformOrigin = 'center'; el.style.opacity = '0'; el.style.transform = 'translateY(-24px) scale(.98)'; });

  await new Promise(r => setTimeout(r, 420));

  // fetch target and swap .wrap innerHTML
  try{
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch-failed');
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const newRoot = doc.querySelector('.wrap');
    if (!newRoot) { location.href = url; return; }
    // replace content
    root.innerHTML = newRoot.innerHTML;
    // execute any scripts contained in the fetched page
    const scripts = doc.querySelectorAll('script');
    for (const s of scripts){
      try{
        if (s.src){
          // avoid reloading our core helper
          if (s.src.includes('/app.js')) continue;
          const ns = document.createElement('script'); ns.src = s.src; ns.async = false; document.body.appendChild(ns);
        } else {
          const ns = document.createElement('script'); ns.textContent = s.textContent; document.body.appendChild(ns);
        }
      }catch(e){ /* ignore script execution errors */ }
    }
    // update url without reload
    history.pushState({}, '', url);

    // small delay to allow DOM to settle
    requestAnimationFrame(()=>{
      // entry animations: fade/slide in, staggered
      document.body.classList.remove('page-exiting');
      document.body.classList.add('page-entering');
      const incoming = root.querySelectorAll('.tile, .btn, .icon');
      incoming.forEach((el,i)=>{
        el.style.opacity = '0';
        el.style.transform = 'translateY(18px) scale(.995)';
        el.style.transition = 'transform .48s cubic-bezier(.2,.9,.2,1), opacity .42s ease';
        el.style.transitionDelay = `${i*40+60}ms`;
        requestAnimationFrame(()=>{ el.style.opacity = '1'; el.style.transform = 'translateY(0) scale(1)'; });
      });
    });

    // cleanup after animations
    setTimeout(()=>{
      document.body.classList.remove('page-entering');
      // re-run any init hooks if page scripts expect them
      if (typeof window.onPageSwapped === 'function') window.onPageSwapped();
    }, 900);

  }catch(e){
    // on error, fallback to full navigation
    location.href = url;
  }
}

// Support back/forward buttons by loading via fetch as well
window.addEventListener('popstate', async ()=>{
  try{ await navigateWithTransition(location.pathname + location.search); }catch(e){ location.reload(); }
});

// Initialize entry animation on all pages that include this script
document.body.classList.add('init');
window.addEventListener('DOMContentLoaded', () => {
  requestAnimationFrame(() => {
    document.body.classList.add('ready');
    document.body.classList.remove('init');
  });
});

// Inject global UI helpers (stronger shadows and transitions)
(function injectGlobalStyles(){
  const css = `
    :root{--btn-shadow: 0 18px 50px rgba(2,6,23,0.14);--btn-shadow-soft: 0 10px 30px rgba(2,6,23,0.08)}
    /* global professional background used across all pages */
    body{background-image:linear-gradient(rgba(255,255,255,0.6), rgba(255,255,255,0.6)), url('https://images.unsplash.com/photo-1551218808-94e220e084d2?q=80&w=1600&auto=format&fit=crop&ixlib=rb-4.0.3&s=5f0b1d4f3b9f2a4e6a0f1b6c2e6c3f2a');background-size:cover;background-position:center;background-attachment:fixed}
    .wrap{background:rgba(255,255,255,0.9);backdrop-filter:blur(6px);border-radius:12px}
    .btn{box-shadow:var(--btn-shadow-soft);transition:transform .28s cubic-bezier(.2,.9,.2,1), box-shadow .28s ease, background .12s ease}
    .logo .mark{border:4px solid transparent;transition:border-color .28s ease, box-shadow .28s ease}
    .logo .mark.ok{border-color:#10b981;box-shadow:0 8px 30px rgba(16,185,129,0.14);}
    .logo .mark.down{border-color:#ef4444;box-shadow:0 8px 30px rgba(239,68,68,0.12);}
    .btn:hover{transform:translateY(-6px);box-shadow:var(--btn-shadow)}
    .btn:active{transform:translateY(-2px)}
    a.btn{display:inline-block}
    .tile{transition:transform .48s cubic-bezier(.2,.9,.2,1), box-shadow .48s ease, opacity .42s ease}
    .tile:hover{transform:translateY(-10px) rotate(-0.6deg);box-shadow:0 30px 70px rgba(2,6,23,0.12)}
    body.page-exiting .tile, body.page-exiting .btn{opacity:0}
    body.page-entering .tile, body.page-entering .btn{opacity:1}
    /* subtle backdrop for swapped pages */
    .wrap{will-change:transform,opacity}
  `;
  const s = document.createElement('style'); s.setAttribute('data-generated','app-styles'); s.textContent = css; document.head.appendChild(s);
})();

// Expose to global scope
window.navigateWithTransition = navigateWithTransition;

// Optional hook pages can implement to re-run page JS after swap
window.onPageSwapped = window.onPageSwapped || function(){ /* no-op */ };

// API health check indicator: toggles .logo .mark.ok/.down based on backend availability
async function checkApiHealth(){
  const backend = (window.BACKEND_URL || 'http://localhost:3000');
  let ok = false;
  try{
    const res = await fetch(backend + '/', { method: 'GET', cache: 'no-store', mode: 'cors' });
    ok = res.ok;
  }catch(e){ ok = false; }
  const mark = document.querySelector('.logo .mark');
  if (!mark) return ok;
  mark.classList.remove('ok','down');
  if (ok) mark.classList.add('ok'); else mark.classList.add('down');
  return ok;
}

// Run on load and every 8s
document.addEventListener('DOMContentLoaded', ()=>{ checkApiHealth(); setInterval(checkApiHealth, 8000); });
// Also run after SPA swaps
const _oldOnSwap = window.onPageSwapped;
window.onPageSwapped = function(){ if (typeof _oldOnSwap === 'function') _oldOnSwap(); checkApiHealth(); };

// Delegated click handlers to support elements added/removed by fetch-swaps
document.addEventListener('click', (evt) => {
  // global logout handler for any element with data-logout
  const out = evt.target.closest && evt.target.closest('[data-logout]');
  if (out) {
    try{ localStorage.removeItem('token'); }catch(e){}
    // ensure full reload to clear app state
    location.href = '/login';
    evt.preventDefault();
    return;
  }
  const btn = evt.target.closest && evt.target.closest('#clientesHBXBtn');
  if (btn) {
    const adminSection = document.getElementById('adminSection');
    if (adminSection) {
      adminSection.style.display = 'block';
      adminSection.scrollIntoView({ behavior: 'smooth' });
    }
    const createForm = document.getElementById('createClientForm');
    if (createForm) createForm.style.display = 'block';
    const plansList = document.getElementById('plansList'); if (plansList) plansList.style.display = 'none';
    // try to load plans if function available
    try{ if (typeof window.loadPlans === 'function') window.loadPlans(); }catch(e){}
    setTimeout(()=>{ const el = document.getElementById('clientName'); if (el) el.focus(); }, 250);
    evt.preventDefault();
    return;
  }
});
