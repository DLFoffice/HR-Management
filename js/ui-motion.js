/* ===== ui-motion.js =====
   Interface polish: icons, theme switching, sliding nav indicator,
   page-enter choreography, ripple, spotlight, mobile drawer. */

const NAV_ICONS = {
  dashboard:'<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  employees:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 3.5a4 4 0 0 1 0 9M22 21a6 6 0 0 0-4-5.6"/>',
  orgchart:'<rect x="9" y="2" width="6" height="5" rx="1.5"/><rect x="2" y="17" width="6" height="5" rx="1.5"/><rect x="16" y="17" width="6" height="5" rx="1.5"/><path d="M12 7v5M5 17v-3h14v3"/>',
  leaves:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18M9 15l2 2 4-4"/>',
  loans:'<rect x="2" y="6" width="20" height="13" rx="3"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 10v5M18 10v5"/>',
  welfare:'<path d="M12 21s-8-4.6-8-11a4.5 4.5 0 0 1 8-2.9A4.5 4.5 0 0 1 20 10c0 6.4-8 11-8 11z"/>',
  kpi:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  training:'<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  reports:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};
NAV_ICONS.myhome = '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>';
NAV_ICONS.myleaves = NAV_ICONS.leaves;
NAV_ICONS.myloans = NAV_ICONS.loans;
NAV_ICONS.mywelfare = NAV_ICONS.welfare;
NAV_ICONS.mykpi = NAV_ICONS.kpi;
NAV_ICONS.mytraining = NAV_ICONS.training;

function navIconSvg(id){
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[id]||''}</svg>`;
}

const prefersReducedMotion = ()=> window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Sliding nav indicator ---------- */
function moveNavIndicator(instant){
  const nav = document.getElementById('navlist');
  if(!nav) return;
  let ind = nav.querySelector('.nav-indicator');
  if(!ind){ ind = document.createElement('div'); ind.className='nav-indicator'; nav.prepend(ind); }
  const active = nav.querySelector('button.active');
  if(!active){ ind.style.opacity = 0; return; }
  if(instant){ ind.style.transition = 'none'; }
  ind.style.transform = `translateY(${active.offsetTop}px)`;
  ind.style.height = active.offsetHeight + 'px';
  ind.style.opacity = 1;
  if(instant){ void ind.offsetWidth; ind.style.transition = ''; }
}
let __navIndicatorY = null;

/* ---------- Page-enter choreography ---------- */
function playViewEnter(root){
  if(!root || prefersReducedMotion()) return;
  root.classList.remove('view-enter');
  [...root.children].forEach((el,i)=> el.style.setProperty('--i', Math.min(i, 10)));
  void root.offsetWidth;
  root.classList.add('view-enter');
  clearTimeout(window.__viewEnterT);
  window.__viewEnterT = setTimeout(()=> root.classList.remove('view-enter'), 1100);
}

/* ---------- Topbar breadcrumb ---------- */
function updateTopbar(){
  const crumb = document.getElementById('topCrumb');
  if(crumb){
    const item = (typeof currentNav==='function' ? currentNav() : []).find(n=>n.id===state.currentView);
    crumb.innerHTML = item ? `${navIconSvg(item.id).replace('<svg','<svg width="16" height="16" stroke="currentColor"')}<b>${esc(item.label)}</b>` : '';
  }
  const chip = document.getElementById('todayChip');
  if(chip){
    try{ chip.textContent = new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{weekday:'long', day:'numeric', month:'long', year:'numeric'}).format(new Date()); }catch(e){}
  }
  const fy = document.getElementById('brandFY');
  if(fy && typeof fiscalYearBE==='function') fy.textContent = 'ปีงบประมาณ ' + fiscalYearBE();
  const foot = document.getElementById('loginArtFoot');
  if(foot && typeof fiscalYearBE==='function') foot.textContent = 'ปีงบประมาณ ' + fiscalYearBE();
}

/* ---------- Theme ---------- */
function currentTheme(){ return document.documentElement.getAttribute('data-theme')==='dark' ? 'dark' : 'light'; }
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem('hr_theme', t); }catch(e){}
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', t==='dark' ? '#0E1412' : '#17735F');
  applyChartTheme();
  if(state && state.currentView==='dashboard' && typeof renderDashboardCharts==='function' && document.getElementById('app').style.display!=='none'){
    setTimeout(renderDashboardCharts, 0);
  }
}
function toggleTheme(ev){
  const next = currentTheme()==='dark' ? 'light' : 'dark';
  if(!document.startViewTransition || prefersReducedMotion()){ applyTheme(next); return; }
  const x = ev ? ev.clientX : innerWidth/2, y = ev ? ev.clientY : 0;
  const r = Math.hypot(Math.max(x, innerWidth-x), Math.max(y, innerHeight-y));
  const vt = document.startViewTransition(()=> applyTheme(next));
  vt.ready.then(()=>{
    document.documentElement.animate(
      { clipPath:[`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration:560, easing:'cubic-bezier(.22,1,.36,1)', pseudoElement:'::view-transition-new(root)' }
    );
  }).catch(()=>{});
}

/* ---------- Chart.js defaults follow the theme ---------- */
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function chartPalette(){
  return {
    accent: cssVar('--accent'), accent2: cssVar('--accent-2'),
    rose: cssVar('--rose'), marigold: cssVar('--marigold'),
    blue: '#3D7BD9', ink: cssVar('--ink'), soft: cssVar('--ink-soft'), line: cssVar('--line'),
    accentSoft: cssVar('--accent-soft')
  };
}
function applyChartTheme(){
  if(typeof Chart==='undefined') return;
  const p = chartPalette();
  Chart.defaults.font.family = "'Anuphan','Noto Sans Thai',sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = p.soft;
  Chart.defaults.borderColor = p.line;
  Chart.defaults.animation.duration = 900;
  Chart.defaults.animation.easing = 'easeOutQuart';
  Chart.defaults.plugins.tooltip.backgroundColor = p.ink;
  Chart.defaults.plugins.tooltip.titleColor = cssVar('--paper');
  Chart.defaults.plugins.tooltip.bodyColor = cssVar('--paper');
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.displayColors = false;
}

/* ---------- Mobile drawer ---------- */
function closeNavDrawer(){ document.body.classList.remove('nav-open'); }

/* ---------- global listeners ---------- */
document.addEventListener('click', (e)=>{
  const tt = e.target.closest('[data-theme-toggle]');
  if(tt){ toggleTheme(e); return; }

  const btn = e.target.closest('.btn, .icon-btn, .pill-nav button');
  if(btn && !btn.disabled && !prefersReducedMotion()){
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = s.style.height = size + 'px';
    s.style.left = (e.clientX - r.left - size/2) + 'px';
    s.style.top = (e.clientY - r.top - size/2) + 'px';
    if(getComputedStyle(btn).position==='static') btn.style.position='relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(s);
    setTimeout(()=> s.remove(), 650);
  }
  // remember where a modal was opened from so it can grow out of that point
  window.__lastClick = { x:e.clientX, y:e.clientY };
}, true);

document.addEventListener('pointermove', (e)=>{
  const card = e.target.closest && e.target.closest('.stat');
  if(!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
  card.style.setProperty('--my', (e.clientY - r.top) + 'px');
}, {passive:true});

window.addEventListener('scroll', ()=>{
  const tb = document.getElementById('topbar');
  if(tb) tb.classList.toggle('scrolled', window.scrollY > 4);
}, {passive:true});
window.addEventListener('resize', ()=> moveNavIndicator(true));

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('btnMenu')?.addEventListener('click', ()=> document.body.classList.toggle('nav-open'));
  document.getElementById('navScrim')?.addEventListener('click', closeNavDrawer);
  applyChartTheme();
  updateTopbar();
});
const EYE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10 10 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 5.2A9 9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M14.1 14.2a3 3 0 1 1-4.2-4.2M2 2l20 20"/></svg>';
