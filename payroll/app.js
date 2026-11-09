/* =====================================================================
   payroll/app.js — หน้าระบบเงินสะสม 5% และเลื่อนเงินเดือน (ผู้ดูแลเท่านั้น)
   ===================================================================== */
const PR_URL_KEY = 'payroll_gas_url';
/* URL ของ Apps Script ระบบเงินสะสม — ฝังไว้ เปิดเครื่องไหนก็เชื่อมต่อให้อัตโนมัติ (ยังต้องใส่รหัสผ่าน Admin ทุกครั้ง) */
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycby7jwsN_F4HO97l6R39EWowZijtlwaWbM51-EBPwQKKYewK2EdvG_lNe5_n9hKUUCw/exec';
const PR_DEMO_KEY = 'payroll_demo_session';
function setDemoSession(on){ try{ on ? sessionStorage.setItem(PR_DEMO_KEY,'1') : sessionStorage.removeItem(PR_DEMO_KEY); }catch(e){} }
const PR_TOKEN_KEY = 'payroll_token';
const PR_TAB_KEY = 'payroll_tab';

const PR = {
  data: null,                 // snapshot from backend (Apps Script or demo)
  token: null,
  tab: 'overview',
  fundMonth: null,            // 'YYYY-MM'
  fundYear: null,             // fiscal year (พ.ศ.) for annual matrix
  roundKey: null,
  staffQuery: '',
  busy: false
};

/* ------------------------------------------------------------ helpers */
const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const TH_MONTHS_S = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function n(v){ return pr_num(v); }
function baht(v, dec){ const d = dec === undefined ? 2 : dec; return n(v).toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function baht0(v){ return n(v).toLocaleString('th-TH', { maximumFractionDigits: 0 }); }
function thDate(s){ const d = pr_parse(s); return d ? `${d.getDate()} ${TH_MONTHS_S[d.getMonth()]} ${d.getFullYear()+543}` : '-'; }
function thDateLong(s){ const d = pr_parse(s); return d ? `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()+543}` : '-'; }
function ymLabel(ym, short){ const [y,m] = String(ym).split('-').map(Number); return y ? `${(short?TH_MONTHS_S:TH_MONTHS)[m-1]} ${y+543}` : '-'; }
function ymAdd(ym, k){ const [y,m] = ym.split('-').map(Number); const d = new Date(y, m-1+k, 1); return pr_ym(d); }
function todayYm(){ return pr_ym(new Date()); }
function fyOf(ym){ const [y,m] = ym.split('-').map(Number); return (m >= 10 ? y+1 : y) + 543; }
function fyMonths(fy){ const endY = fy - 543; const out = []; for(let i=0;i<12;i++) out.push(pr_ym(new Date(endY-1, 9+i, 1))); return out; }
function daysUntil(dstr){ const d = pr_parse(dstr); const t = new Date(); t.setHours(0,0,0,0); return Math.round((d - t)/86400000); }
function toast(msg){ const t = document.getElementById('toast'); t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 3200); }
function progress(on){ document.getElementById('topProgress').classList.toggle('run', !!on); }
function reducedMotion(){ return matchMedia('(prefers-reduced-motion: reduce)').matches; }

/* in-memory db over the snapshot so core.js helpers (ledger, summaries) work client-side */
function snapDb(){
  const d = PR.data;
  return { all: t => (d[t] || []).slice(), getConfig: () => d.config, kpiRecords: () => [], insert(){}, update(){}, remove(){}, setConfig(){}, log(){} };
}
function cfg(){ return PR.data.config; }
function staffById(id){ return (PR.data.staff || []).find(s => s.id === id); }
function activeStaff(){ return (PR.data.staff || []).filter(s => (s.status || 'active') === 'active'); }

/* ------------------------------------------------------------ backend */
function gasUrl(){
  try{ if(sessionStorage.getItem(PR_DEMO_KEY) === '1') return ''; }catch(e){}
  try{ return localStorage.getItem(PR_URL_KEY) || DEFAULT_GAS_URL; }catch(e){ return DEFAULT_GAS_URL; }
}
function isDemo(){ return !gasUrl(); }

async function api(action, payload){
  const body = Object.assign({ action }, payload || {});
  if(action !== 'login') body.token = PR.token;
  progress(true);
  try{
    let res;
    if(isDemo()){
      await new Promise(r => setTimeout(r, 120));
      res = LocalPayroll.handle(body);
    } else {
      const r = await fetch(gasUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      if(!r.ok) throw new Error('เชื่อมต่อ Apps Script ไม่สำเร็จ (' + r.status + ')');
      res = await r.json();
    }
    if(res && res.error === 'AUTH'){ logout(true); throw new Error(res.message || 'กรุณาเข้าสู่ระบบใหม่'); }
    if(res && res.error) throw new Error(res.error);
    if(res && res.staff){ PR.data = res; }
    return res;
  } finally { progress(false); }
}

/* run an action, refresh the view, show a toast */
async function act(action, payload, okMsg){
  try{
    const res = await api(action, payload);
    render();
    if(okMsg) toast(typeof okMsg === 'function' ? okMsg(res) : okMsg);
    return res;
  }catch(e){ toast(e.message); throw e; }
}

/* ------------------------------------------------------------ login */
function showLogin(){
  document.getElementById('prApp').hidden = true;
  document.getElementById('prLogin').style.display = 'grid';
  const st = document.getElementById('prConnState');
  st.innerHTML = isDemo()
    ? `<span class="pill-demo">โหมดทดลอง</span> ใช้ข้อมูลตัวอย่างในเครื่องนี้ · รหัสผ่าน <b>${DEMO_PASSWORD}</b>`
    : `<span class="pill-live">เชื่อมต่อ Google Sheet</span> ${esc(gasUrl().replace(/^https:\/\/script\.google\.com\/macros\/s\//,'').slice(0,18))}…`;
  document.getElementById('prGasUrl').value = gasUrl();
  setTimeout(()=>document.getElementById('prPassword').focus(), 50);
}
async function login(ev){
  ev && ev.preventDefault();
  const pw = document.getElementById('prPassword').value;
  const err = document.getElementById('prLoginError');
  err.style.display = 'none';
  if(!pw){ err.textContent = 'กรุณากรอกรหัสผ่าน'; err.style.display = 'block'; return; }
  const btn = document.getElementById('prLoginBtn'); btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
  try{
    const r = await api('login', { password: pw });
    PR.token = r.token;
    try{ sessionStorage.setItem(PR_TOKEN_KEY, r.token); }catch(e){}
    await api('bootstrap');
    document.getElementById('prPassword').value = '';
    enterApp();
    if(r.mustChange) setTimeout(()=>{ openPasswordModal(true); }, 400);
  }catch(e){
    err.textContent = e.message; err.style.display = 'none'; void err.offsetWidth; err.style.display = 'block';
  }finally{ btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ'; }
}
async function resumeSession(){
  try{ PR.token = sessionStorage.getItem(PR_TOKEN_KEY); }catch(e){}
  if(!PR.token) return showLogin();
  try{ await api('bootstrap'); enterApp(); }catch(e){ showLogin(); }
}
function logout(silent){
  if(!silent && PR.token) api('logout').catch(()=>{});
  PR.token = null; PR.data = null;
  try{ sessionStorage.removeItem(PR_TOKEN_KEY); }catch(e){}
  showLogin();
}
function enterApp(){
  document.getElementById('prLogin').style.display = 'none';
  document.getElementById('prApp').hidden = false;
  try{ PR.tab = sessionStorage.getItem(PR_TAB_KEY) || 'overview'; }catch(e){}
  PR.fundMonth = PR.fundMonth || todayYm();
  PR.fundYear = PR.fundYear || fyOf(todayYm());
  render(true);
}

/* ------------------------------------------------------------ shell */
const TABS = [
  { id:'overview', label:'ภาพรวม', ic:'<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>' },
  { id:'staff', label:'เงินเดือนพนักงาน', ic:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 3.5a4 4 0 0 1 0 9M22 21a6 6 0 0 0-4-5.6"/>' },
  { id:'fund', label:'เงินสะสม 5%', ic:'<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3"/><path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 12h-5a2 2 0 0 0 0 4h5z"/>' },
  { id:'rounds', label:'เลื่อนเงินเดือน', ic:'<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>' },
  { id:'export', label:'ส่งออกรายงาน', ic:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 18v-6M9 15l3 3 3-3"/>' },
  { id:'settings', label:'ตั้งค่า', ic:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>' }
];
function svg(path, size){ return `<svg viewBox="0 0 24 24" width="${size||18}" height="${size||18}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`; }

function renderShell(){
  const tabs = document.getElementById('prTabs');
  tabs.innerHTML = TABS.map(t => `<button role="tab" class="${PR.tab===t.id?'on':''}" data-tab="${t.id}" aria-selected="${PR.tab===t.id}">${svg(t.ic,17)}<span>${t.label}</span>${t.id==='rounds' && pendingRoundBadge() ? `<i class="tab-dot"></i>` : ''}</button>`).join('');
  const c = cfg();
  document.getElementById('prOrg').textContent = c.orgName || 'ผู้ดูแลระบบ';
  const seal = document.getElementById('prSeal');
  seal.innerHTML = c.logoUrl ? `<img src="${esc(c.logoUrl)}" alt="">` : '฿';
  document.getElementById('prMode').innerHTML = isDemo() ? '<span class="pill-demo" title="ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น">โหมดทดลอง</span>' : '<span class="pill-live">เชื่อมต่อ Google Sheet</span>';
}
function pendingRoundBadge(){ return (PR.data.rounds || []).some(r => r.status === 'draft'); }

function render(animate){
  if(!PR.data) return;
  renderShell();
  const v = document.getElementById('prView');
  const views = { overview: viewOverview, staff: viewStaff, fund: viewFund, rounds: viewRounds, export: viewExport, settings: viewSettings };
  v.innerHTML = (views[PR.tab] || viewOverview)();
  bindView();
  if(animate && !reducedMotion()){
    [...v.children].forEach((el,i)=> el.style.setProperty('--i', Math.min(i, 8)));
    v.classList.remove('view-enter'); void v.offsetWidth; v.classList.add('view-enter');
    setTimeout(()=>v.classList.remove('view-enter'), 900);
  }
}
function setTab(id){
  PR.tab = id;
  try{ sessionStorage.setItem(PR_TAB_KEY, id); }catch(e){}
  render(true);
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/* ------------------------------------------------------------ modal */
function openModal(html, width){
  const o = document.getElementById('modalOverlay'), b = document.getElementById('modalBox');
  b.innerHTML = html; b.style.maxWidth = width ? width + 'px' : '';
  o.classList.remove('closing'); o.classList.add('active'); document.body.style.overflow = 'hidden';
  b.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', closeModal));
}
function closeModal(){
  const o = document.getElementById('modalOverlay');
  if(!o.classList.contains('active')) return;
  o.classList.add('closing');
  setTimeout(()=>{ o.classList.remove('active','closing'); document.getElementById('modalBox').innerHTML=''; document.body.style.overflow=''; }, 200);
}

/* ============================================================ OVERVIEW */
function monthTotals(ym){
  const rows = (PR.data.contributions || []).filter(c => c.period === ym);
  return { count: rows.length, total: rows.reduce((a,c)=>a+n(c.amount),0) };
}
function viewOverview(){
  const d = PR.data, c = cfg();
  const active = activeStaff();
  const payroll = active.reduce((a,s)=>a+n(s.salary),0);
  const fundAll = Object.values(d.balances || {}).reduce((a,v)=>a+n(v),0);
  const ym = todayYm(), mt = monthTotals(ym);
  const expected = active.filter(s=>n(s.salary)>0).reduce((a,s)=>a+pr_fundAmount(s.salary, c),0);
  const dedDay = c.deductionDay;
  const today = new Date();
  const nextKey = pr_nextRoundKey(today);
  const info = pr_roundInfo(nextKey);
  const round = (d.rounds||[]).find(r=>r.key===nextKey);
  const dl = daysUntil(info.effectiveDate);
  const draftDate = new Date(pr_parse(info.effectiveDate)); draftDate.setDate(draftDate.getDate() - c.leadDays);
  const auto = d.automation || {};

  // 12-month contribution trend
  const months = []; for(let k=11;k>=0;k--) months.push(ymAdd(ym, -k));
  const series = months.map(m => monthTotals(m).total);
  const max = Math.max(1, ...series);

  const steps = [
    { label:'ช่วงประเมินผล', sub:`${thDate(info.evalStart)} – ${thDate(info.evalEnd)}`, done: today > pr_parse(info.evalEnd) },
    { label:'ระบบสร้างร่างอัตโนมัติ', sub:`${thDate(pr_ymd(draftDate))} (ก่อน ${c.leadDays} วัน)`, done: !!round },
    { label: c.autoApply ? 'ปรับเงินเดือนอัตโนมัติ' : 'รอผู้ดูแลอนุมัติ', sub: thDate(info.effectiveDate), done: round && round.status==='applied' }
  ];
  const curStep = steps.findIndex(s=>!s.done);

  return `
  <section class="hero pr-hero">
    <div class="hero-glow g1"></div><div class="hero-glow g2"></div><div class="hero-dots"></div>
    <div class="hero-text">
      <div class="hero-kicker">${ymLabel(ym)} · ปีงบประมาณ ${fyOf(ym)}</div>
      <h1>เงินสะสมรวม ${baht(fundAll)} บาท</h1>
      <p>พนักงาน ${active.length} คน · หักเงินสะสม ${c.fundRate}% ทุกวันที่ ${dedDay} · ${pr_roundInfo(nextKey).label} อีก ${dl} วัน</p>
      <div class="hero-actions">
        <button class="hero-btn" data-run-daily>${svg('<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M21 4v5h-5M3 20v-5h5"/>',16)}รันงานอัตโนมัติตอนนี้</button>
        <button class="hero-btn ghost" data-goto="export">${svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',16)}ส่งออก PDF / Excel</button>
      </div>
    </div>
    <div class="pr-hero-card">
      <div class="phc-label">${pr_roundInfo(nextKey).label}</div>
      <div class="phc-big"><b>${dl}</b><span>วัน</span></div>
      <div class="phc-sub">${round ? (round.status==='applied' ? 'ปรับเงินเดือนแล้ว' : 'ร่างพร้อมตรวจสอบ') : 'ยังไม่ถึงเวลาสร้างร่าง'}</div>
      <div class="phc-auto ${auto.installed?'on':''}"><i></i>${auto.installed ? `งานอัตโนมัติทำงานทุกวัน ${String(auto.hour||6).padStart(2,'0')}:00 น.` : 'ยังไม่ได้เปิดงานอัตโนมัติ'}</div>
    </div>
  </section>

  <div class="grid grid-4" style="margin-bottom:16px;">
    <div class="stat tone-blue"><div class="stat-ic">${svg(TABS[1].ic,24)}</div><div class="label">พนักงานในระบบเงินสะสม</div><div class="value">${active.length}</div><div class="foot">${(d.staff||[]).length - active.length} คนพ้นสภาพ</div></div>
    <div class="stat tone-violet"><div class="stat-ic">${svg('<rect x="2" y="6" width="20" height="13" rx="3"/><circle cx="12" cy="12.5" r="2.5"/>',24)}</div><div class="label">เงินเดือนรวมต่อเดือน (บาท)</div><div class="value">${baht0(payroll)}</div><div class="foot">เฉลี่ย ${baht0(active.length ? payroll/active.length : 0)} บาท/คน</div></div>
    <div class="stat ${mt.count?'tone-teal':'tone-amber'}"><div class="stat-ic">${svg(TABS[2].ic,24)}</div><div class="label">หักเงินสะสมเดือนนี้ (บาท)</div><div class="value">${baht0(mt.count ? mt.total : expected)}</div><div class="foot">${mt.count ? `หักแล้ว ${mt.count} คน` : `จะหักอัตโนมัติวันที่ ${dedDay} ${TH_MONTHS_S[today.getMonth()]}`}</div></div>
    <div class="stat tone-sky"><div class="stat-ic">${svg(TABS[3].ic,24)}</div><div class="label">เลื่อนเงินเดือนล่าสุด</div><div class="value">${lastAppliedRoundText()}</div><div class="foot">${lastAppliedRoundFoot()}</div></div>
  </div>

  <div class="pr-row">
    <div class="panel">
      <h2>${hIc(TABS[3].ic)}ขั้นตอนรอบเลื่อนเงินเดือนถัดไป</h2>
      <ol class="pr-steps">${steps.map((s,i)=>`<li class="${s.done?'done':''}${i===curStep?' now':''}"><span class="ps-dot">${s.done?'✓':i+1}</span><div><b>${s.label}</b><small>${s.sub}</small></div></li>`).join('')}</ol>
      <div class="pr-note">${c.autoApply ? `ถึงวันที่ ${thDate(info.effectiveDate)} ระบบจะปรับเงินเดือนให้เองเมื่อทุกคนมี % ที่จะเลื่อนครบ (จากเกณฑ์ที่กรอกไว้หรือกรอกรายคน) ถ้ายังไม่ครบ ระบบจะรอและแจ้งเตือน` : 'ระบบจะสร้างร่างให้อัตโนมัติ แล้วรอผู้ดูแลกดอนุมัติ'}</div>
      <button class="btn btn-sm" data-goto="rounds">ไปที่หน้าเลื่อนเงินเดือน</button>
    </div>
    <div class="panel">
      <h2>${hIc(TABS[2].ic)}เงินสะสมที่หักรายเดือน <span class="h-count">12 เดือนล่าสุด (บาท)</span></h2>
      <div class="pr-bars">${months.map((m,i)=>`<div class="pb-col" title="${ymLabel(m)}: ${baht(series[i])} บาท"><div class="pb-val">${series[i] ? baht0(series[i]/1000)+'k' : ''}</div><div class="pb-bar${m===ym?' cur':''}" style="--h:${(series[i]/max*100).toFixed(1)}%"></div><div class="pb-lab">${TH_MONTHS_S[Number(m.split('-')[1])-1]}</div></div>`).join('')}</div>
    </div>
  </div>

  <div class="panel">
    <h2>${hIc('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}ประวัติการทำงานของระบบ <span class="h-count">ล่าสุด</span></h2>
    ${(d.logs||[]).length ? `<div class="pr-log">${(d.logs||[]).slice(-10).reverse().map(l=>`<div class="pl-row"><span class="pl-time">${esc(l.time)}</span><span class="pl-tag t-${esc(l.action)}">${logTag(l.action)}</span><span>${esc(l.detail)}</span></div>`).join('')}</div>` : '<div class="empty-note">ยังไม่มีประวัติ</div>'}
  </div>`;
}
function logTag(a){ return ({fund:'เงินสะสม',round:'เลื่อนเงินเดือน',staff:'พนักงาน',daily:'อัตโนมัติ',config:'ตั้งค่า',automation:'อัตโนมัติ'})[a] || a; }
function hIc(path){ return `<span class="h-ic">${svg(path,17)}</span>`; }
function lastApplied(){ return (PR.data.rounds||[]).filter(r=>r.status==='applied').sort((a,b)=>a.key<b.key?1:-1)[0]; }
function lastAppliedRoundText(){ const r = lastApplied(); return r ? `${TH_MONTHS_S[pr_parse(r.effectiveDate).getMonth()]} ${pr_parse(r.effectiveDate).getFullYear()+543}` : '-'; }
function lastAppliedRoundFoot(){
  const r = lastApplied(); if(!r) return 'ยังไม่เคยเลื่อนในระบบนี้';
  const items = (PR.data.roundItems||[]).filter(i=>i.roundId===r.id && pr_bool(i.eligible) && n(i.raise)>0);
  return `เลื่อน ${items.length} คน รวม +${baht0(items.reduce((a,i)=>a+n(i.raise),0))} บาท/เดือน`;
}

/* ============================================================ STAFF */
function viewStaff(){
  const q = PR.staffQuery.trim().toLowerCase();
  const bal = PR.data.balances || {};
  const c = cfg();
  const list = (PR.data.staff||[]).slice().sort((a,b)=> ((a.status||'active')==='active'?0:1)-((b.status||'active')==='active'?0:1) || String(a.department).localeCompare(String(b.department),'th') || String(a.code).localeCompare(String(b.code)))
    .filter(s => !q || [s.name,s.code,s.position,s.department].some(v=>String(v||'').toLowerCase().includes(q)));
  const act = list.filter(s=>(s.status||'active')==='active');
  const tot = act.reduce((a,s)=>a+n(s.salary),0), totFund = act.reduce((a,s)=>a+pr_fundAmount(s.salary,c),0), totBal = list.reduce((a,s)=>a+n(bal[s.id]),0);
  const noSalary = act.filter(s=>!n(s.salary)).length;
  return `
  <div class="page-header">
    <div><h1>เงินเดือนพนักงาน</h1><div class="sub">ข้อมูลเงินเดือนปัจจุบัน ยอดหักเงินสะสม ${c.fundRate}% ต่อเดือน และยอดเงินสะสมของแต่ละคน</div></div>
    <div class="actions">
      <button class="btn" data-sync-main>${svg('<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M21 4v5h-5M3 20v-5h5"/>',16)}ดึงรายชื่อจากระบบ HR</button>
      <button class="btn" data-import>${svg('<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',16)}นำเข้า Excel</button>
      <button class="btn btn-primary" data-add-staff>+ เพิ่มพนักงาน</button>
    </div>
  </div>
  ${noSalary ? `<div class="pr-alert">${svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>',18)}<span>มีพนักงาน <b>${noSalary} คน</b> ที่ยังไม่ได้กรอกเงินเดือน ระบบจะยังไม่หักเงินสะสมของคนกลุ่มนี้ — กรอกทีละคน หรือนำเข้าจาก Excel</span><button class="btn btn-sm" data-template>ดาวน์โหลดแม่แบบ Excel</button></div>` : ''}
  <div class="panel">
    <div class="searchbar"><input type="text" id="staffSearch" placeholder="ค้นหาชื่อ รหัส ตำแหน่ง กลุ่มงาน" value="${esc(PR.staffQuery)}"></div>
    <div class="table-wrap"><table class="reg pr-table">
      <thead><tr><th class="rownum">#</th><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง / กลุ่มงาน</th><th>เริ่มงาน</th><th class="num">เงินเดือน</th><th class="num">หัก ${c.fundRate}%/เดือน</th><th class="num">ยอดเงินสะสม</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((s,i)=>{
        const inactive = (s.status||'active')!=='active';
        return `<tr class="pr-row-link ${inactive?'is-inactive':''}" data-row-staff="${s.id}" tabindex="0" title="คลิกเพื่อดูรายละเอียด ${esc(s.name)}">
          <td class="rownum">${i+1}</td><td>${esc(s.code||'-')}</td>
          <td><div class="pr-person">${staffAvatar(s,40)}<div class="pr-person-text"><b>${esc(s.name)}</b>${inactive?' <span class="tag tag-red">พ้นสภาพ</span>':''}</div></div></td>
          <td><div>${esc(s.position||'-')}</div><small class="muted">${esc(s.department||'')}</small></td>
          <td>${thDate(s.hireDate)}</td>
          <td class="num">${n(s.salary) ? baht(s.salary) : '<span class="tag tag-amber">ยังไม่กรอก</span>'}</td>
          <td class="num">${inactive||!n(s.salary) ? '-' : baht(pr_fundAmount(s.salary,c))}</td>
          <td class="num"><b>${baht(bal[s.id]||0)}</b></td>
          <td class="pr-actions"><button class="btn btn-sm" data-edit-staff="${s.id}">แก้ไข</button><span class="pr-chev" aria-hidden="true">›</span></td>
        </tr>`;}).join('') : `<tr class="empty-row"><td colspan="9">${q?'ไม่พบพนักงานที่ค้นหา':'ยังไม่มีพนักงาน — กด "ดึงรายชื่อจากระบบ HR" หรือ "นำเข้า Excel"'}</td></tr>`}</tbody>
      <tfoot><tr><td colspan="5" class="pr-foot-label">รวม (เฉพาะผู้ที่ยังทำงาน ${act.length} คน)</td><td class="num"><b>${baht(tot)}</b></td><td class="num"><b>${baht(totFund)}</b></td><td class="num"><b>${baht(totBal)}</b></td><td></td></tr></tfoot>
    </table></div>
  </div>`;
}

/* photo avatar (falls back to the first letter of the name) */
function staffInitial(s){ return String((s&&s.name)||'?').replace(/^(นาย|นางสาว|นาง|ดร\.|ว่าที่ร้อยตรี)\s*/,'').trim().slice(0,1) || '?'; }
function staffAvatar(s, size, cls){
  const z = size || 40, ini = esc(staffInitial(s));
  const url = s && String(s.photoUrl||'').trim();
  return `<span class="pr-ava ${cls||''}" style="width:${z}px;height:${z}px;font-size:${Math.round(z*.4)}px">${url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<i>${ini}</i></span>`;
}

function openStaffModal(id){
  const s = id ? staffById(id) : { status:'active' };
  openModal(`
    <h3>${id ? 'แก้ไขข้อมูล ' + esc(s.name) : 'เพิ่มพนักงาน'}</h3>
    <div class="field-grid">
      <div class="field"><label>รหัสพนักงาน</label><input id="sf_code" value="${esc(s.code||'')}"></div>
      <div class="field"><label>สถานะ</label><select id="sf_status"><option value="active" ${s.status!=='resigned'?'selected':''}>ทำงานอยู่</option><option value="resigned" ${s.status==='resigned'?'selected':''}>พ้นสภาพ (หยุดหักเงินสะสม)</option></select></div>
      <div class="field full"><label>ชื่อ-นามสกุล *</label><input id="sf_name" value="${esc(s.name||'')}"></div>
      <div class="field full"><label>ลิงก์รูปพนักงาน (URL)</label><div class="pr-photo-field"><span id="sf_photoPrev">${staffAvatar(s,44)}</span><input id="sf_photoUrl" placeholder="https://… (ดึงจากระบบ HR อัตโนมัติ ถ้ามีรูปในระบบ HR)" value="${esc(s.photoUrl||'')}"></div></div>
      <div class="field"><label>ตำแหน่ง</label><input id="sf_position" value="${esc(s.position||'')}"></div>
      <div class="field"><label>กลุ่มงาน</label><input id="sf_department" value="${esc(s.department||'')}"></div>
      <div class="field"><label>วันเริ่มงาน</label><input type="date" id="sf_hireDate" value="${esc(s.hireDate||'')}"></div>
      <div class="field"><label>เงินเดือนปัจจุบัน (บาท) *</label><input type="number" step="0.01" min="0" id="sf_salary" value="${s.salary!==undefined?esc(s.salary):''}"><div class="days-note" id="sf_fundHint"></div></div>
      <div class="field"><label>ยอดเงินสะสมยกมา (บาท)</label><input type="number" step="0.01" min="0" id="sf_fundOpening" value="${esc(s.fundOpening||'')}"><div class="days-note">ยอดที่สะสมไว้ก่อนเริ่มใช้ระบบนี้</div></div>
      <div class="field"><label>ยกมา ณ วันที่</label><input type="date" id="sf_fundOpeningDate" value="${esc(s.fundOpeningDate||'')}"></div>
      ${id ? `<div class="field full"><label>เหตุผลที่แก้ไขเงินเดือน (ถ้ามี)</label><input id="sf_note" placeholder="เช่น ปรับตามคำสั่ง ที่ .../2569"></div>` : ''}
    </div>
    <div class="field-error" id="sf_err"></div>
    <div class="modal-actions">
      ${id ? `<button class="btn btn-danger" id="sf_del" style="margin-right:auto;">ลบ / พ้นสภาพ</button>` : ''}
      <button class="btn" data-close>ยกเลิก</button><button class="btn btn-primary" id="sf_save">บันทึก</button>
    </div>`, 640);
  const hint = ()=>{ const v = n(document.getElementById('sf_salary').value); document.getElementById('sf_fundHint').textContent = v ? `หักเงินสะสม ${cfg().fundRate}% = ${baht(pr_fundAmount(v,cfg()))} บาท/เดือน` : ''; };
  document.getElementById('sf_salary').addEventListener('input', hint); hint();
  document.getElementById('sf_photoUrl').addEventListener('input', e=>{ document.getElementById('sf_photoPrev').innerHTML = staffAvatar({ name: document.getElementById('sf_name').value, photoUrl: e.target.value.trim() }, 44); });
  document.getElementById('sf_save').addEventListener('click', async ()=>{
    const v = k => document.getElementById('sf_'+k).value.trim();
    const err = document.getElementById('sf_err');
    if(!v('name')){ err.textContent = 'กรุณากรอกชื่อ-นามสกุล'; err.style.display='block'; return; }
    if(v('salary')==='' || n(v('salary')) < 0){ err.textContent = 'กรุณากรอกเงินเดือนให้ถูกต้อง'; err.style.display='block'; return; }
    const data = Object.assign({}, id ? s : {}, { code:v('code'), name:v('name'), position:v('position'), department:v('department'), hireDate:v('hireDate'), photoUrl:v('photoUrl'),
      salary:n(v('salary')), fundOpening:n(v('fundOpening')), fundOpeningDate:v('fundOpeningDate'), status:v('status'), changeNote: id ? v('note') : '' });
    closeModal();
    await act('saveStaff', { staff: data }, 'บันทึกข้อมูลพนักงานแล้ว');
  });
  document.getElementById('sf_del')?.addEventListener('click', async ()=>{
    if(!confirm(`ลบ ${s.name}?\nถ้ามีประวัติเงินสะสม ระบบจะเปลี่ยนเป็น "พ้นสภาพ" แทนการลบ เพื่อเก็บประวัติไว้`)) return;
    closeModal();
    await act('deleteStaff', { id }, r => r.result && r.result.softDeleted ? 'เปลี่ยนสถานะเป็นพ้นสภาพแล้ว (เก็บประวัติเงินสะสมไว้)' : 'ลบแล้ว');
  });
}

function openLedgerModal(id){
  const L = pr_ledger(snapDb(), id);
  const s = L.staff; if(!s) return;
  const hist = (PR.data.salaryHistory||[]).filter(h=>h.staffId===id).sort((a,b)=>a.effectiveDate<b.effectiveDate?1:-1);
  openModal(`
    <div class="pr-profile">
      ${staffAvatar(s,84,'pr-ava-lg')}
      <div class="pr-profile-text">
        <h3>${esc(s.name)} ${(s.status||'active')!=='active'?'<span class="tag tag-red">พ้นสภาพ</span>':''}</h3>
        <div class="muted">${esc(s.position||'-')}${s.department?' · '+esc(s.department):''}</div>
        <div class="pr-profile-meta">
          <span><small>รหัส</small><b>${esc(s.code||'-')}</b></span>
          <span><small>เริ่มงาน</small><b>${thDate(s.hireDate)}</b></span>
          <span><small>เงินเดือน</small><b>${n(s.salary)?baht(s.salary):'ยังไม่กรอก'}</b></span>
          <span><small>หัก ${cfg().fundRate}%/เดือน</small><b>${n(s.salary)?baht(pr_fundAmount(s.salary,cfg())):'-'}</b></span>
        </div>
      </div>
    </div>
    <div class="pr-ledger-stats">
      <div><small>ยอดเงินสะสมทั้งหมด</small><b>${baht(L.balance)}</b></div>
      <div><small>หักจากเงินเดือนในระบบ</small><b>${baht(L.contributed)}</b></div>
      <div><small>ยกมา</small><b>${baht(s.fundOpening||0)}</b></div>
    </div>
    <div class="pill-nav" id="ledTabs"><button class="active" data-led="fund">ทะเบียนเงินสะสม</button><button data-led="salary">ประวัติเงินเดือน (${hist.length})</button></div>
    <div id="led_fund" class="table-wrap pr-scroll"><table class="reg">
      <thead><tr><th>เดือน</th><th class="num">เงินเดือน</th><th class="num">อัตรา</th><th class="num">หักเข้ากองทุน</th><th class="num">ยอดสะสม</th></tr></thead>
      <tbody>${L.rows.length ? L.rows.slice().reverse().map(r=>`<tr${r.opening?' class="row-current"':''}><td>${r.opening ? 'ยอดยกมา' + (r.period?' ('+ymLabel(r.period,true)+')':'') : ymLabel(r.period)}</td><td class="num">${r.opening?'':baht(r.salary)}</td><td class="num">${r.opening?'':n(r.rate)+'%'}</td><td class="num">${baht(r.amount)}</td><td class="num"><b>${baht(r.balance)}</b></td></tr>`).join('') : '<tr class="empty-row"><td colspan="5">ยังไม่มีรายการ</td></tr>'}</tbody>
    </table></div>
    <div id="led_salary" class="table-wrap pr-scroll" hidden><table class="reg">
      <thead><tr><th>มีผลวันที่</th><th class="num">เดิม</th><th class="num">ใหม่</th><th class="num">เพิ่มขึ้น</th><th>ที่มา</th></tr></thead>
      <tbody>${hist.length ? hist.map(h=>`<tr><td>${thDate(h.effectiveDate)}</td><td class="num">${baht(h.oldSalary)}</td><td class="num"><b>${baht(h.newSalary)}</b></td><td class="num">${n(h.newSalary)-n(h.oldSalary)>=0?'+':''}${baht(n(h.newSalary)-n(h.oldSalary))} <small class="muted">(${n(h.percent)}%)</small></td><td>${h.roundKey ? esc(pr_roundInfo(h.roundKey).label) : ''} ${esc(h.note||'')}</td></tr>`).join('') : '<tr class="empty-row"><td colspan="5">ยังไม่มีการเปลี่ยนแปลงเงินเดือน</td></tr>'}</tbody>
    </table></div>
    <div class="modal-actions">
      <button class="btn" data-exp="ledger" data-fmt="pdf" data-staff="${id}">PDF</button>
      <button class="btn" data-exp="ledger" data-fmt="xlsx" data-staff="${id}">Excel</button>
      <button class="btn" data-edit-staff="${id}">แก้ไขข้อมูล</button>
      <button class="btn btn-primary" data-close>ปิด</button>
    </div>`, 760);
  const box = document.getElementById('modalBox');
  box.querySelectorAll('[data-led]').forEach(b=>b.addEventListener('click', ()=>{
    box.querySelectorAll('[data-led]').forEach(x=>x.classList.toggle('active', x===b));
    document.getElementById('led_fund').hidden = b.dataset.led!=='fund';
    document.getElementById('led_salary').hidden = b.dataset.led!=='salary';
  }));
  box.querySelectorAll('[data-exp]').forEach(b=>b.addEventListener('click', ()=>runExport(b.dataset.exp, b.dataset.fmt, { staffId: b.dataset.staff })));
  box.querySelector('[data-edit-staff]')?.addEventListener('click', ()=>{ closeModal(); setTimeout(()=>openStaffModal(id), 220); });
}

/* Excel import: columns รหัส | ชื่อ-นามสกุล | ตำแหน่ง | กลุ่มงาน | วันเริ่มงาน | เงินเดือน | เงินสะสมยกมา | ยกมา ณ วันที่ */
const IMPORT_HEADERS = ['รหัส','ชื่อ-นามสกุล','ตำแหน่ง','กลุ่มงาน','วันเริ่มงาน (ปปปป-ดด-วว)','เงินเดือน','เงินสะสมยกมา','ยกมา ณ วันที่'];
function downloadTemplate(){
  const rows = [IMPORT_HEADERS].concat((PR.data.staff||[]).filter(s=>(s.status||'active')==='active').map(s=>[s.code||'', s.name, s.position||'', s.department||'', s.hireDate||'', n(s.salary)||'', n(s.fundOpening)||'', s.fundOpeningDate||'']));
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [8,30,28,14,18,12,14,16].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'เงินเดือน');
  XLSX.writeFile(wb, 'แม่แบบนำเข้าเงินเดือน.xlsx');
}
function pickImport(){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
  inp.onchange = async ()=>{
    const f = inp.files[0]; if(!f) return;
    try{
      const wb = XLSX.read(await f.arrayBuffer(), { type:'array', cellDates:true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:'', raw:true });
      const pick = (r, keys) => { for(const k of Object.keys(r)) if(keys.some(x=>k.replace(/\s/g,'').includes(x))) return r[k]; return ''; };
      const dateOf = v => v instanceof Date ? pr_ymd(v) : (typeof v==='number' && v>20000 && v<80000 ? pr_ymd(new Date(Math.round((v-25569)*86400000))) : String(v||'').trim());
      const parsed = rows.map(r=>({ code:String(pick(r,['รหัส','code'])||'').trim(), name:String(pick(r,['ชื่อ','name'])||'').trim(), position:String(pick(r,['ตำแหน่ง'])||'').trim(),
        department:String(pick(r,['กลุ่มงาน','ฝ่าย'])||'').trim(), hireDate:dateOf(pick(r,['วันเริ่ม','เริ่มงาน'])), salary:pick(r,['เงินเดือน','salary']),
        fundOpening:pick(r,['สะสมยกมา','ยกมา(บาท)','เงินสะสมยกมา']), fundOpeningDate:dateOf(pick(r,['ยกมาณ','ณวันที่'])) })).filter(r=>r.name);
      if(!parsed.length){ toast('ไม่พบข้อมูลในไฟล์ — ใช้คอลัมน์ตามแม่แบบ'); return; }
      openModal(`<h3>นำเข้าเงินเดือนจาก Excel</h3>
        <p class="muted" style="margin-top:-8px;">พบ ${parsed.length} รายการ — ระบบจะจับคู่ตามรหัสหรือชื่อ คนที่มีอยู่แล้วจะถูกอัปเดต คนใหม่จะถูกเพิ่ม</p>
        <div class="table-wrap pr-scroll"><table class="reg"><thead><tr><th>รหัส</th><th>ชื่อ</th><th>ตำแหน่ง</th><th class="num">เงินเดือน</th><th class="num">สะสมยกมา</th></tr></thead>
        <tbody>${parsed.slice(0,200).map(r=>`<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.position)}</td><td class="num">${r.salary!==''?baht(r.salary):'-'}</td><td class="num">${r.fundOpening!==''?baht(r.fundOpening):'-'}</td></tr>`).join('')}</tbody></table></div>
        <div class="modal-actions"><button class="btn" data-close>ยกเลิก</button><button class="btn btn-primary" id="imp_go">นำเข้า ${parsed.length} รายการ</button></div>`, 760);
      document.getElementById('imp_go').addEventListener('click', async ()=>{ closeModal(); await act('importStaff', { rows: parsed }, r => `นำเข้าแล้ว: เพิ่ม ${r.result.added} คน · อัปเดต ${r.result.updated} คน`); });
    }catch(e){ toast('อ่านไฟล์ไม่ได้: ' + e.message); }
  };
  inp.click();
}

/* ============================================================ FUND */
function viewFund(){
  const c = cfg(), ym = PR.fundMonth;
  const bal = PR.data.balances || {};
  const rows = (PR.data.contributions||[]).filter(x=>x.period===ym).map(x=>({ x, s: staffById(x.staffId) || { name:'(ไม่พบข้อมูล)' } }))
    .sort((a,b)=>String(a.s.department).localeCompare(String(b.s.department),'th') || String(a.s.code).localeCompare(String(b.s.code)));
  const total = rows.reduce((a,r)=>a+n(r.x.amount),0);
  const isPast = ym < todayYm(), isCur = ym === todayYm();
  const due = isCur && new Date().getDate() < c.deductionDay;
  const pending = pr_staffForMonth(snapDb(), ym).filter(s => !rows.some(r=>r.x.staffId===s.id));
  // running balance as of the end of this month
  const balAt = id => { let b = n((staffById(id)||{}).fundOpening); (PR.data.contributions||[]).forEach(cn=>{ if(cn.staffId===id && cn.period<=ym) b += n(cn.amount); }); return b; };
  const fy = PR.fundYear, fyMs = fyMonths(fy);
  return `
  <div class="page-header">
    <div><h1>เงินสะสม ${c.fundRate}%</h1><div class="sub">ระบบหักจากเงินเดือนอัตโนมัติทุกวันที่ ${c.deductionDay} ของเดือน ตามเงินเดือนล่าสุดของแต่ละคน</div></div>
    <div class="actions">
      <button class="btn" data-exp="fundMonth" data-fmt="pdf">PDF เดือนนี้</button>
      <button class="btn" data-exp="fundMonth" data-fmt="xlsx">Excel เดือนนี้</button>
    </div>
  </div>

  <div class="pr-monthbar">
    <button class="cal2-btn" data-fm="-1" aria-label="เดือนก่อน">${svg('<path d="m15 18-6-6 6-6"/>',18)}</button>
    <div class="pm-title"><b>${ymLabel(ym)}</b><small>ปีงบประมาณ ${fyOf(ym)}</small></div>
    <button class="cal2-btn" data-fm="1" aria-label="เดือนถัดไป">${svg('<path d="m9 18 6-6-6-6"/>',18)}</button>
    ${ym!==todayYm()?'<button class="btn btn-sm" data-fm="0">เดือนปัจจุบัน</button>':''}
    <div class="pm-status">${rows.length
      ? `<span class="tag tag-green">หักแล้ว ${rows.length} คน</span>${pending.length?` <span class="tag tag-amber">ยังไม่หัก ${pending.length} คน</span>`:''}`
      : due ? `<span class="tag tag-navy">จะหักอัตโนมัติวันที่ ${c.deductionDay}</span>` : `<span class="tag tag-amber">ยังไม่มีรายการ</span>`}</div>
    ${pending.length && (isPast || isCur) ? `<button class="btn btn-primary btn-sm" data-gen-month="${ym}">สร้างรายการหัก ${pending.length} คน</button>` : ''}
  </div>

  <div class="grid grid-3" style="margin-bottom:16px;">
    <div class="stat tone-teal"><div class="stat-ic">${svg(TABS[2].ic,24)}</div><div class="label">ยอดหักเดือนนี้ (บาท)</div><div class="value">${baht(total)}</div><div class="foot">${rows.length} คน · อัตรา ${c.fundRate}%</div></div>
    <div class="stat tone-blue"><div class="stat-ic">${svg('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',24)}</div><div class="label">ยอดหักทั้งปีงบ ${fy} (บาท)</div><div class="value">${baht0((PR.data.contributions||[]).filter(x=>fyMs.includes(x.period)).reduce((a,x)=>a+n(x.amount),0))}</div><div class="foot">ต.ค. ${fy-1} – ก.ย. ${fy}</div></div>
    <div class="stat tone-violet"><div class="stat-ic">${svg('<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',24)}</div><div class="label">ยอดเงินสะสมรวมทุกคน (บาท)</div><div class="value">${baht0(Object.values(bal).reduce((a,v)=>a+n(v),0))}</div><div class="foot">รวมยอดยกมา</div></div>
  </div>

  <div class="panel">
    <h2>${hIc(TABS[2].ic)}รายการหักเงินสะสม ${ymLabel(ym)} <span class="h-count">${rows.length} รายการ</span></h2>
    <div class="table-wrap"><table class="reg pr-table">
      <thead><tr><th class="rownum">#</th><th>ชื่อ-นามสกุล</th><th>กลุ่มงาน</th><th class="num">เงินเดือน</th><th class="num">อัตรา</th><th class="num">หักเงินสะสม</th><th class="num">ยอดสะสม ณ สิ้นเดือน</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map((r,i)=>`<tr>
        <td class="rownum">${i+1}</td><td><button class="link-btn pr-person" data-ledger="${r.x.staffId}">${staffAvatar(r.s,30)}<span>${esc(r.s.name)}</span></button></td><td class="muted">${esc(r.s.department||'')}</td>
        <td class="num">${baht(r.x.salary)}</td><td class="num">${n(r.x.rate)}%</td><td class="num"><b>${baht(r.x.amount)}</b></td><td class="num">${baht(balAt(r.x.staffId))}</td>
        <td class="pr-actions"><button class="icon-del" title="ลบรายการนี้" data-del-contrib="${r.x.id}">${svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',15)}</button></td></tr>`).join('')
        : `<tr class="empty-row"><td colspan="8">${due ? `ยังไม่ถึงวันหัก — ระบบจะสร้างรายการให้อัตโนมัติวันที่ ${c.deductionDay} ${ymLabel(ym)}` : 'ยังไม่มีรายการหักในเดือนนี้'}</td></tr>`}</tbody>
      ${rows.length ? `<tfoot><tr><td colspan="3" class="pr-foot-label">รวม</td><td class="num"><b>${baht(rows.reduce((a,r)=>a+n(r.x.salary),0))}</b></td><td></td><td class="num"><b>${baht(total)}</b></td><td></td><td></td></tr></tfoot>` : ''}
    </table></div>
  </div>

  <div class="panel">
    <div class="pr-panel-head">
      <h2>${hIc('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/>')}สรุปเงินสะสมรายปีงบประมาณ</h2>
      <div class="pr-panel-tools">
        <select id="fundYearSel">${fyOptions().map(y=>`<option value="${y}" ${y===fy?'selected':''}>ปีงบประมาณ ${y}</option>`).join('')}</select>
        <button class="btn btn-sm" data-exp="fundYear" data-fmt="pdf">PDF</button><button class="btn btn-sm" data-exp="fundYear" data-fmt="xlsx">Excel</button>
      </div>
    </div>
    ${fundYearMatrixHtml(fy)}
  </div>`;
}
function fyOptions(){
  const set = new Set([fyOf(todayYm())]);
  (PR.data.contributions||[]).forEach(c=>set.add(fyOf(c.period)));
  return [...set].sort((a,b)=>b-a);
}
function fundYearMatrix(fy){
  const ms = fyMonths(fy);
  const by = {};
  (PR.data.contributions||[]).forEach(c=>{ if(!ms.includes(c.period)) return; (by[c.staffId] = by[c.staffId] || {})[c.period] = n(c.amount); });
  const staff = (PR.data.staff||[]).filter(s=>by[s.id]).sort((a,b)=>String(a.department).localeCompare(String(b.department),'th') || String(a.code).localeCompare(String(b.code)));
  const colTotals = ms.map(m=>staff.reduce((a,s)=>a+(by[s.id][m]||0),0));
  return { ms, staff, by, colTotals, grand: colTotals.reduce((a,v)=>a+v,0) };
}
function fundYearMatrixHtml(fy){
  const M = fundYearMatrix(fy);
  if(!M.staff.length) return '<div class="empty-note">ยังไม่มีรายการหักในปีงบประมาณนี้</div>';
  return `<div class="table-wrap pr-matrix"><table class="reg">
    <thead><tr><th>ชื่อ-นามสกุล</th>${M.ms.map(m=>`<th class="num">${ymLabel(m,true).replace(' 25','<br>25')}</th>`).join('')}<th class="num">รวม</th></tr></thead>
    <tbody>${M.staff.map(s=>{ const tot = M.ms.reduce((a,m)=>a+(M.by[s.id][m]||0),0); return `<tr><td><button class="link-btn" data-ledger="${s.id}">${esc(s.name)}</button></td>${M.ms.map(m=>`<td class="num">${M.by[s.id][m]!==undefined?baht0(M.by[s.id][m]):'<span class="muted">-</span>'}</td>`).join('')}<td class="num"><b>${baht(tot)}</b></td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td class="pr-foot-label">รวม</td>${M.colTotals.map(v=>`<td class="num"><b>${v?baht0(v):'-'}</b></td>`).join('')}<td class="num"><b>${baht(M.grand)}</b></td></tr></tfoot>
  </table></div>`;
}

/* ============================================================ ROUNDS */
function roundKeysForUi(){
  const keys = new Set((PR.data.rounds||[]).map(r=>r.key));
  keys.add(pr_nextRoundKey(new Date()));
  return [...keys].sort().reverse();
}
function viewRounds(){
  const keys = roundKeysForUi();
  if(!PR.roundKey || !keys.includes(PR.roundKey)){
    const draft = (PR.data.rounds||[]).find(r=>r.status==='draft');
    PR.roundKey = draft ? draft.key : keys[0];
  }
  const key = PR.roundKey, info = pr_roundInfo(key), c = cfg();
  const round = (PR.data.rounds||[]).find(r=>r.key===key);
  const dl = daysUntil(info.effectiveDate);
  const chips = keys.map(k=>{ const r = (PR.data.rounds||[]).find(x=>x.key===k); const st = r ? r.status : 'none';
    return `<button class="round-chip ${k===key?'on':''} st-${st}" data-round-key="${k}"><b>${pr_roundInfo(k).label.replace('รอบ ','')}</b><small>${st==='applied'?'ปรับแล้ว':st==='draft'?'ร่าง':'ยังไม่สร้าง'}</small></button>`; }).join('');

  let body;
  if(!round){
    const draftOn = new Date(pr_parse(info.effectiveDate)); draftOn.setDate(draftOn.getDate()-c.leadDays);
    body = `<div class="panel pr-empty">
      <div class="pe-ic">${svg(TABS[3].ic,30)}</div>
      <h3>${info.label} ยังไม่ได้สร้างร่าง</h3>
      <p>ระบบจะสร้างร่างให้อัตโนมัติวันที่ <b>${thDate(pr_ymd(draftOn))}</b> (ก่อนวันเลื่อน ${c.leadDays} วัน) พร้อมดึงคะแนน KPI ช่วง ${thDate(info.evalStart)} – ${thDate(info.evalEnd)} จากระบบ HR (ถ้ามี) — ถ้าไม่มีคะแนน กรอกคะแนนหรือ % เองในตารางได้
      <br>หรือกดสร้างตอนนี้เพื่อดูตัวเลขล่วงหน้า (คะแนนจะอัปเดตเองทุกวันจนถึงวันเลื่อน)</p>
      <button class="btn btn-primary" data-create-round="${key}">สร้างร่างตอนนี้</button>
    </div>`;
  } else {
    const S = pr_roundSummary(snapDb(), round.id);
    const items = (PR.data.roundItems||[]).filter(i=>i.roundId===round.id).sort((a,b)=> (pr_bool(b.eligible)-pr_bool(a.eligible)) || n(b.score)-n(a.score));
    const draft = round.status==='draft';
    const poolPct = S.pool ? Math.min(100, S.totalRaise / S.pool * 100) : 0;
    body = `
    <div class="grid grid-4" style="margin-bottom:16px;">
      <div class="stat tone-blue"><div class="stat-ic">${svg(TABS[1].ic,24)}</div><div class="label">ผู้มีสิทธิ์เลื่อน</div><div class="value">${S.eligible}<small class="v-of">/${S.count}</small></div><div class="foot">${S.count-S.eligible} คนทำงานไม่ครบ ${c.eligibilityMonths} เดือน</div></div>
      <div class="stat ${S.pending?'tone-amber':'tone-teal'}"><div class="stat-ic">${svg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',24)}</div><div class="label">กำหนด % แล้ว</div><div class="value">${S.eligible - S.pending}<small class="v-of">/${S.eligible}</small></div><div class="foot">${S.pending ? [S.noPercent?`ยังไม่กรอก % ${S.noPercent} คน`:'', S.noScore?`ไม่มีคะแนน ${S.noScore} คน`:''].filter(Boolean).join(' · ') : 'ครบทุกคนแล้ว'}</div></div>
      <div class="stat tone-violet"><div class="stat-ic">${svg('<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',24)}</div><div class="label">เงินเดือนเพิ่มรวม (บาท/เดือน)</div><div class="value">+${baht0(S.totalRaise)}</div><div class="foot">${S.raisePercentOfBase}% ของฐานเงินเดือน ${baht0(S.baseSalary)}</div></div>
      <div class="stat ${S.overPool?'tone-rose':'tone-sky'}"><div class="stat-ic">${svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',24)}</div><div class="label">${draft ? 'วันที่มีผล' : 'ปรับเมื่อ'}</div><div class="value">${draft ? (dl>0 ? `อีก ${dl} วัน` : dl===0 ? 'วันนี้' : `เลย ${-dl} วัน`) : thDate(round.appliedAt)}</div><div class="foot">${thDateLong(info.effectiveDate)}</div></div>
    </div>
    <div class="panel">
      <div class="pr-panel-head">
        <h2>${hIc(TABS[3].ic)}${info.label} <span class="tag ${draft?'tag-amber':'tag-green'}">${draft?'ร่าง — แก้ไขได้':'ปรับเงินเดือนแล้ว'}</span></h2>
        <div class="pr-panel-tools">
          ${draft ? `<button class="btn btn-sm" data-refresh-round="${round.id}">ดึงคะแนน KPI ใหม่</button><button class="btn btn-sm btn-danger" data-delete-round="${round.id}">ลบร่าง</button>` : ''}
          <button class="btn btn-sm" data-exp="round" data-fmt="pdf">PDF</button><button class="btn btn-sm" data-exp="round" data-fmt="xlsx">Excel</button>
          ${draft ? `<button class="btn btn-sm btn-primary" data-apply-round="${round.id}">ปรับเงินเดือนตอนนี้</button>` : ''}
        </div>
      </div>
      <div class="pr-pool ${S.overPool?'over':''}">
        <div class="pp-text">วงเงินเลื่อน ${c.raisePoolPercent}% = ${baht0(S.pool)} บาท · ใช้ไป <b>${baht0(S.totalRaise)}</b> บาท ${S.overPool?'<b class="neg">เกินวงเงิน</b>':''}</div>
        <div class="pbar"><div style="width:${poolPct.toFixed(1)}%"></div></div>
      </div>
      <div class="pr-note">ช่วงประเมิน ${thDate(info.evalStart)} – ${thDate(info.evalEnd)} · ${draft ? 'แก้คะแนนหรือ % ในตารางได้เลย ระบบบันทึกทันที (รายการที่แก้เองจะไม่ถูกทับเมื่อดึงคะแนนใหม่)' : esc(round.note||'')}</div>
      ${draft && S.noScore ? `<div class="pr-alert pr-alert-info">${svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v.01M12 11v5"/>',18)}<span>มี <b>${S.noScore} คน</b> ที่ยังไม่มีคะแนน KPI — พิมพ์คะแนน (0–100) ในช่อง <b>"คะแนน"</b> ได้เลย ระบบจะเลือกระดับและ % ให้อัตโนมัติ หรือข้ามไปกรอก % เองในช่อง "%" ก็ได้</span></div>` : ''}
      <div class="table-wrap"><table class="reg pr-table pr-round-table">
        <thead><tr><th class="rownum">#</th><th>ชื่อ-นามสกุล</th><th class="num">เงินเดือนเดิม</th><th class="num">คะแนน KPI</th><th>ระดับ</th><th class="num">% เลื่อน</th><th class="num">เพิ่มขึ้น</th><th class="num">เงินเดือนใหม่</th><th>หมายเหตุ</th></tr></thead>
        <tbody>${items.map((it,i)=>{ const el = pr_bool(it.eligible); return `<tr class="${el?'':'is-inactive'}">
          <td class="rownum">${i+1}</td><td><button class="link-btn pr-person" data-ledger="${it.staffId}">${staffAvatar(staffById(it.staffId)||{name:it.name},30)}<span>${esc(it.name)}</span></button></td>
          <td class="num">${baht(it.oldSalary)}</td>
          <td class="num">${draft && el ? `<input class="cell-in" type="number" min="0" max="100" step="0.1" value="${it.score===''?'':esc(it.score)}" data-item="${it.id}" data-field="score" placeholder="-">` : (it.score===''?'-':esc(it.score))}</td>
          <td>${it.tier ? `<span class="tier t-${tierClass(it.tier)}">${esc(it.tier)}</span>` : '<span class="muted">-</span>'}</td>
          <td class="num">${draft && el ? `<input class="cell-in${pr_blank(it.percent)?' is-empty':''}${pr_bool(it.percentManual)?'':' is-auto'}" type="number" min="0" max="15" step="0.5" value="${esc(it.percent)}" data-item="${it.id}" data-field="percent" placeholder="${it.tier?'รอเกณฑ์':'-'}" title="${pr_bool(it.percentManual)?'กำหนดเอง — ลบตัวเลขออกเพื่อกลับไปใช้ % อัตโนมัติ':'คำนวณอัตโนมัติจากระดับ — พิมพ์ทับได้ถ้าต้องการกำหนดเอง'}">` : (pr_blank(it.percent) ? '-' : esc(it.percent)+'%')}</td>
          <td class="num">${n(it.raise) ? '+'+baht(it.raise) : '-'}</td>
          <td class="num"><b>${baht(it.newSalary)}</b></td>
          <td class="pr-reason">${pr_bool(it.percentManual)?'<span class="tag tag-navy">% กำหนดเอง</span> ':(!pr_blank(it.percent)&&it.tier&&el?'<span class="tag tag-green">อัตโนมัติ</span> ':'')}${it.reason?`<span class="${el?'warn':'muted'}">${esc(it.reason)}</span>`:''}</td>
        </tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="2" class="pr-foot-label">รวม</td><td class="num"><b>${baht(items.reduce((a,i)=>a+n(i.oldSalary),0))}</b></td><td colspan="3"></td><td class="num"><b>+${baht(S.totalRaise)}</b></td><td class="num"><b>${baht(items.reduce((a,i)=>a+n(i.newSalary),0))}</b></td><td></td></tr></tfoot>
      </table></div>
    </div>`;
  }
  return `
  <div class="page-header">
    <div><h1>เลื่อนเงินเดือน</h1><div class="sub">ปีละ 2 รอบ — 1 เม.ย. (ประเมิน ต.ค.–มี.ค.) และ 1 ต.ค. (ประเมิน เม.ย.–ก.ย.) ต้องทำงานครบ ${c.eligibilityMonths} เดือน ณ วันที่เลื่อน</div></div>
  </div>
  <div class="round-chips">${chips}</div>
  <div class="panel pr-tier-panel ${tiersUnset()?'is-unset':''}">
    <div class="pr-panel-head">
      <h2>${hIc('<path d="M4 6h16M4 12h10M4 18h6"/>')}เกณฑ์ % เลื่อนเงินเดือนอัตโนมัติ <span class="h-count">คะแนน KPI → ระดับ → % ให้ทุกคนทันที</span></h2>
      <div class="pr-panel-tools">
        <button class="btn btn-sm" data-tier-preset title="ค่าแนะนำ ดีเยี่ยม 5% · ดีมาก 4% · ดี 3% · พอใช้ 2% · ควรปรับปรุง 0% (แก้ได้)">ใช้ค่าแนะนำ</button>
        <button class="btn btn-sm btn-primary" data-tier-save>บันทึกและคำนวณใหม่</button>
      </div>
    </div>
    ${tiersUnset() ? `<div class="pr-note warn">ยังไม่ได้กรอก % — กรอกในกล่องด้านล่าง (หรือกด "ใช้ค่าแนะนำ") แล้วกด "บันทึกและคำนวณใหม่" ระบบจะใส่ % ให้ทุกคนที่มีคะแนนอัตโนมัติ</div>` : ''}
    <div class="tier-grid">${c.tiers.map((t,i)=>`<label class="tier-card t-${tierClass(t.label)}${pr_blank(t.percent)?' unset':''}"><small>คะแนน ${t.min} ขึ้นไป</small><b>${esc(t.label)}</b>
      <span class="tier-in"><input type="number" min="0" max="15" step="0.5" data-tier-idx="${i}" value="${pr_blank(t.percent)?'':t.percent}" placeholder="-"><em>%</em></span></label>`).join('')}</div>
    <div class="pr-note">ปัดเงินที่เพิ่มขึ้น${c.raiseRounding==='ceil10'?'ขึ้นเป็นหลักสิบบาท (แบบราชการ)':'เป็นทศนิยม 2 ตำแหน่ง'} · ${c.autoApply?'ปรับเงินเดือนอัตโนมัติเมื่อถึงวันเลื่อนและทุกคนมี % ครบ':'ต้องกดอนุมัติเอง'} · ช่วงคะแนนและชื่อระดับแก้ได้ที่หน้าตั้งค่า</div>
  </div>
  ${body}`;
}
const TIER_PRESET = [5, 4, 3, 2, 0];
async function saveTierPercents(){
  const tiers = cfg().tiers.map((t,i)=>{ const el = document.querySelector(`[data-tier-idx="${i}"]`); const v = el ? el.value.trim() : '';
    return { min: t.min, label: t.label, percent: v === '' ? '' : n(v) }; });
  if(tiers.some(t => t.percent !== '' && (t.percent < 0 || t.percent > 15))){ toast('% ต้องอยู่ระหว่าง 0–15'); return; }
  await act('setConfig', { config: { tiers: JSON.stringify(tiers) } }, res => {
    const k = res && res.result && res.result.refreshed;
    return 'บันทึกเกณฑ์แล้ว' + (k ? ' — คำนวณ % ให้ทุกคนใหม่แล้ว' : '');
  });
}
function tiersUnset(){ return cfg().tiers.every(t=>pr_blank(t.percent)); }
function tierClass(label){ return ({'ดีเยี่ยม':'a','ดีเด่น':'a','ดีมาก':'b','ดี':'c','พอใช้':'d'})[label] || 'e'; }

/* ============================================================ EXPORT */
function viewExport(){
  const keys = (PR.data.rounds||[]).map(r=>r.key).sort().reverse();
  const staffOpts = (PR.data.staff||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'th')).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const months = []; for(let k=0;k<24;k++) months.push(ymAdd(todayYm(), -k));
  const hasMonth = new Set((PR.data.contributions||[]).map(c=>c.period));
  // default to the selected month if it has deductions, otherwise the latest month that does
  const expMonth = hasMonth.has(PR.fundMonth) ? PR.fundMonth : (months.find(m=>hasMonth.has(m)) || PR.fundMonth);
  const card = (id, title, desc, ic, params) => `
    <div class="exp-card">
      <div class="exp-ic">${svg(ic,22)}</div>
      <div class="exp-body"><b>${title}</b><p>${desc}</p>${params||''}</div>
      <div class="exp-btns"><button class="btn btn-sm" data-exp="${id}" data-fmt="pdf">${svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',15)}PDF</button><button class="btn btn-sm btn-xl" data-exp="${id}" data-fmt="xlsx">${svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8l8 8M16 8l-8 8"/>',15)}Excel</button></div>
    </div>`;
  return `
  <div class="page-header">
    <div><h1>ส่งออกรายงาน</h1><div class="sub">PDF สำหรับพิมพ์/เสนอลงนาม (ฟอนต์ Sarabun) และ Excel สำหรับนำไปคำนวณต่อ</div></div>
    <div class="actions"><button class="btn btn-primary" data-exp="all" data-fmt="xlsx">${svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',16)}Excel ทั้งหมด (หลายชีต)</button></div>
  </div>
  <div class="exp-grid">
    ${card('fundMonth','รายงานเงินสะสมประจำเดือน','รายชื่อ เงินเดือน ยอดหัก 5% และยอดรวม พร้อมช่องลงนาม', TABS[2].ic,
      `<select class="exp-param" id="ex_month">${months.map(m=>`<option value="${m}" ${m===expMonth?'selected':''}>${ymLabel(m)}${hasMonth.has(m)?'':' (ยังไม่มีรายการ)'}</option>`).join('')}</select>`)}
    ${card('fundYear','สรุปเงินสะสมรายปีงบประมาณ','ตารางรายคน × 12 เดือน (ต.ค.–ก.ย.) พร้อมยอดรวม — PDF เป็นแนวนอน', '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/>',
      `<select class="exp-param" id="ex_fy">${fyOptions().map(y=>`<option value="${y}" ${y===PR.fundYear?'selected':''}>ปีงบประมาณ ${y}</option>`).join('')}</select>`)}
    ${card('balances','ยอดเงินสะสมคงเหลือรายบุคคล','ยอดยกมา ยอดที่หักในระบบ และยอดสะสมรวมของทุกคน ณ วันนี้', '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>')}
    ${card('ledger','ทะเบียนเงินสะสมรายบุคคล','ทุกเดือนที่หัก พร้อมยอดสะสมต่อเนื่อง และประวัติเงินเดือน', TABS[1].ic,
      `<select class="exp-param" id="ex_staff">${staffOpts}</select>`)}
    ${card('round','ผลการเลื่อนเงินเดือน','คะแนน ระดับ % เงินเดือนเดิม/ใหม่ ของรอบที่เลือก พร้อมช่องลงนามอนุมัติ', TABS[3].ic,
      keys.length ? `<select class="exp-param" id="ex_round">${keys.map(k=>`<option value="${k}" ${k===PR.roundKey?'selected':''}>${pr_roundInfo(k).label}</option>`).join('')}</select>` : '<span class="muted">ยังไม่มีรอบ</span>')}
    ${card('salaries','ทะเบียนเงินเดือนปัจจุบัน','รายชื่อ ตำแหน่ง วันเริ่มงาน เงินเดือน และยอดหักเงินสะสมต่อเดือน', '<rect x="2" y="6" width="20" height="13" rx="3"/><circle cx="12" cy="12.5" r="2.5"/>')}
  </div>`;
}

/* ============================================================ SETTINGS */
function viewSettings(){
  const c = cfg(), auto = PR.data.automation || {};
  return `
  <div class="page-header"><div><h1>ตั้งค่า</h1><div class="sub">กติกาเงินสะสม การเลื่อนเงินเดือน งานอัตโนมัติ และความปลอดภัย</div></div></div>
  <div class="pr-row">
    <div class="panel">
      <h2>${hIc(TABS[2].ic)}เงินสะสม</h2>
      <div class="field-grid">
        <div class="field"><label>อัตราหักเงินสะสม (%)</label><input type="number" step="0.1" min="0" max="30" id="cf_fundRate" value="${c.fundRate}"></div>
        <div class="field"><label>วันที่หักของทุกเดือน</label><input type="number" min="1" max="28" id="cf_deductionDay" value="${c.deductionDay}"></div>
        <div class="field full"><label>การปัดเศษยอดหัก</label><select id="cf_fundRounding"><option value="satang" ${c.fundRounding!=='baht'?'selected':''}>ทศนิยม 2 ตำแหน่ง (สตางค์)</option><option value="baht" ${c.fundRounding==='baht'?'selected':''}>ปัดเป็นบาท</option></select></div>
      </div>
      <h2 style="margin-top:10px;">${hIc(TABS[3].ic)}เลื่อนเงินเดือน</h2>
      <div class="field-grid">
        <div class="field"><label>ต้องทำงานครบ (เดือน)</label><input type="number" min="0" max="24" id="cf_eligibilityMonths" value="${c.eligibilityMonths}"></div>
        <div class="field"><label>สร้างร่างล่วงหน้า (วัน)</label><input type="number" min="1" max="90" id="cf_leadDays" value="${c.leadDays}"></div>
        <div class="field"><label>วงเงินเลื่อนต่อรอบ (% ของฐาน)</label><input type="number" step="0.1" min="0" id="cf_raisePoolPercent" value="${c.raisePoolPercent}"></div>
        <div class="field"><label>การปัดเงินที่เพิ่ม</label><select id="cf_raiseRounding"><option value="ceil10" ${c.raiseRounding==='ceil10'?'selected':''}>ปัดขึ้นหลักสิบ (แบบราชการ)</option><option value="none" ${c.raiseRounding!=='ceil10'?'selected':''}>ไม่ปัด</option></select></div>
        <div class="field full"><label class="switch-row"><input type="checkbox" id="cf_autoApply" ${c.autoApply?'checked':''}><span class="switch"></span><span>ปรับเงินเดือนอัตโนมัติเมื่อถึง 1 เม.ย. / 1 ต.ค. (เฉพาะเมื่อทุกคนมี % ครบ)</span></label></div>
      </div>
      <label class="sub-label">เกณฑ์ % ตามคะแนน KPI</label>
      <div class="pr-note" style="margin-top:0;">กรอก % ที่จะเลื่อนของแต่ละระดับ ช่วงคะแนนตั้งไว้ตามการให้เกรด KPI ในระบบ HR (แก้ได้) — ระดับที่ยังเว้นว่าง ระบบจะไม่เลื่อนให้อัตโนมัติ</div>
      <table class="reg tier-edit"><thead><tr><th>คะแนนตั้งแต่</th><th>ระดับ</th><th>% ที่เลื่อน</th><th></th></tr></thead>
      <tbody id="tierRows">${c.tiers.map((t,i)=>tierRowHtml(t)).join('')}</tbody></table>
      <button type="button" class="btn btn-sm" data-add-tier style="margin-top:8px;">+ เพิ่มระดับ</button>
    </div>
    <div>
      <div class="panel">
        <h2>${hIc('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}งานอัตโนมัติ</h2>
        <div class="policy-strip"><span class="policy-dot" style="background:${auto.installed?'var(--green)':'var(--marigold)'}"></span>${auto.demo ? 'โหมดทดลอง — งานอัตโนมัติทำงานจริงเมื่อเชื่อม Apps Script' : auto.installed ? `เปิดใช้งาน · ทำงานทุกวันเวลา ${String(auto.hour||6).padStart(2,'0')}:00 น.` : 'ยังไม่ได้เปิดงานอัตโนมัติ'}</div>
        <ul class="pr-list">
          <li>ทุกวันที่ <b>${c.deductionDay}</b> หักเงินสะสม ${c.fundRate}% จากเงินเดือนล่าสุด</li>
          <li>ก่อน 1 เม.ย. / 1 ต.ค. <b>${c.leadDays} วัน</b> สร้างร่างรอบเลื่อนเงินเดือนพร้อมคะแนน KPI</li>
          <li>ถึงวันเลื่อน ${c.autoApply ? '<b>ปรับเงินเดือนให้เอง</b> (ถ้าทุกคนมี % ครบ)' : '<b>รอผู้ดูแลกดอนุมัติ</b>'} แล้วเดือนนั้นหักเงินสะสมจากเงินเดือนใหม่</li>
          <li>ส่งอีเมลแจ้งทุกครั้งที่มีงานเกิดขึ้น</li>
        </ul>
        <div class="field"><label>อีเมลรับแจ้งเตือน</label><input type="email" id="cf_notifyEmail" value="${esc(c.notifyEmail||'')}" placeholder="hr@example.org"></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-sm" data-install-trigger>${auto.installed?'ติดตั้งงานอัตโนมัติใหม่':'เปิดงานอัตโนมัติ'}</button>
          <button class="btn btn-sm" data-run-daily>รันงานอัตโนมัติตอนนี้</button>
        </div>
      </div>
      <div class="panel">
        <h2>${hIc('<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 4v16"/>')}เชื่อมกับระบบ HR เดิม</h2>
        <div class="field"><label>ID ของ Google Sheet ระบบบริหารงานบุคคล</label><input id="cf_mainSheetId" value="${esc(c.mainSheetId||'')}" placeholder="ส่วนที่อยู่ระหว่าง /d/ และ /edit ใน URL ของ Sheet"></div>
        <div class="pr-note">ไม่บังคับ — ใช้ดึงรายชื่อพนักงานและวันเริ่มงาน (แท็บ employees) ระบบนี้อ่านอย่างเดียว ไม่เขียนกลับ<br>คะแนน KPI: ถ้าแท็บ kpi ว่าง ให้กรอกคะแนนเองได้ในหน้า <b>รอบเลื่อนเงินเดือน</b> ช่อง "คะแนน" ของแต่ละคน</div>
        <div class="field"><label>ชื่อหน่วยงาน (หัวรายงาน)</label><input id="cf_orgName" value="${esc(c.orgName||'')}"></div>
        <div class="field"><label>URL โลโก้ (หัวรายงาน)</label><input id="cf_logoUrl" value="${esc(c.logoUrl||'')}"></div>
      </div>
      <div class="panel">
        <h2>${hIc('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>')}ความปลอดภัย</h2>
        <div class="pr-note">${isDemo() ? 'โหมดทดลอง: ข้อมูลอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น' : 'รหัสผ่านถูกตรวจที่ Google Apps Script เก็บแบบเข้ารหัส (SHA-256) และหมดอายุการเข้าระบบใน 6 ชั่วโมง'}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-sm" data-change-pw>เปลี่ยนรหัสผ่าน Admin</button>
          <button class="btn btn-sm" data-conn>${isDemo()?'เชื่อมต่อ Google Sheet':'เปลี่ยน URL การเชื่อมต่อ'}</button>
          ${isDemo() ? '<button class="btn btn-sm btn-danger" data-reset-demo>ล้างข้อมูลทดลอง</button>' : ''}
        </div>
      </div>
    </div>
  </div>
  <div class="pr-savebar"><span>การเปลี่ยนแปลงมีผลกับงานอัตโนมัติครั้งถัดไป</span><button class="btn btn-primary" data-save-config>บันทึกการตั้งค่า</button></div>`;
}
function tierRowHtml(t){
  return `<tr class="tier-row"><td><input type="number" class="cell-in" data-k="min" min="0" max="100" value="${t.min??''}"></td><td><input class="cell-in wide" data-k="label" value="${esc(t.label||'')}" placeholder="ชื่อระดับ"></td>
    <td><input type="number" step="0.5" min="0" max="15" class="cell-in${pr_blank(t.percent)?' is-empty':''}" data-k="percent" value="${pr_blank(t.percent)?'':t.percent}" placeholder="กรอก %"></td>
    <td><button type="button" class="icon-del" data-del-tier title="ลบระดับนี้">${svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',15)}</button></td></tr>`;
}
async function saveConfig(){
  const g = id => document.getElementById('cf_'+id);
  const tiers = [...document.querySelectorAll('#tierRows .tier-row')].map(tr=>{
    const v = k => tr.querySelector(`[data-k="${k}"]`).value.trim();
    return { min: n(v('min')), label: v('label'), percent: v('percent')==='' ? '' : n(v('percent')) };
  }).filter(t=>t.label);
  if(!tiers.length){ toast('ต้องมีอย่างน้อย 1 ระดับ'); return; }
  if(new Set(tiers.map(t=>t.min)).size !== tiers.length){ toast('คะแนนเริ่มต้นของแต่ละระดับต้องไม่ซ้ำกัน'); return; }
  const conf = { fundRate:n(g('fundRate').value), deductionDay:n(g('deductionDay').value), fundRounding:g('fundRounding').value,
    eligibilityMonths:n(g('eligibilityMonths').value), leadDays:n(g('leadDays').value), raisePoolPercent:n(g('raisePoolPercent').value),
    raiseRounding:g('raiseRounding').value, autoApply:g('autoApply').checked, notifyEmail:g('notifyEmail').value.trim(),
    mainSheetId:g('mainSheetId').value.trim().replace(/^.*\/d\/([^/]+).*$/,'$1'), orgName:g('orgName').value.trim(), logoUrl:g('logoUrl').value.trim(), tiers: JSON.stringify(tiers) };
  if(conf.deductionDay < 1 || conf.deductionDay > 28){ toast('วันที่หักต้องอยู่ระหว่าง 1–28'); return; }
  await act('setConfig', { config: conf }, 'บันทึกการตั้งค่าแล้ว');
}
function openPasswordModal(forced){
  openModal(`<h3>${forced?'กรุณาเปลี่ยนรหัสผ่านเริ่มต้น':'เปลี่ยนรหัสผ่าน Admin'}</h3>
    ${forced?'<p class="muted" style="margin-top:-8px;">ตอนนี้ยังใช้รหัสผ่านเริ่มต้นจากโค้ด ซึ่งคนที่เห็นโค้ดก็รู้ได้ ควรเปลี่ยนก่อนใช้งานจริง</p>':''}
    <div class="field"><label>รหัสผ่านเดิม</label><input type="password" id="pw_old"></div>
    <div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label><input type="password" id="pw_new"></div>
    <div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input type="password" id="pw_new2"></div>
    <div class="field-error" id="pw_err"></div>
    <div class="modal-actions"><button class="btn" data-close>${forced?'ไว้ภายหลัง':'ยกเลิก'}</button><button class="btn btn-primary" id="pw_go">เปลี่ยนรหัสผ่าน</button></div>`, 460);
  document.getElementById('pw_go').addEventListener('click', async ()=>{
    const o = document.getElementById('pw_old').value, a = document.getElementById('pw_new').value, b = document.getElementById('pw_new2').value;
    const err = document.getElementById('pw_err');
    if(a !== b){ err.textContent = 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'; err.style.display='block'; return; }
    try{ await api('changePassword', { oldPassword:o, newPassword:a }); closeModal(); toast('เปลี่ยนรหัสผ่านแล้ว'); }
    catch(e){ err.textContent = e.message; err.style.display='block'; }
  });
}
function openConnModal(){
  openModal(`<h3>เชื่อมต่อ Google Apps Script</h3>
    <p class="muted" style="margin-top:-8px;">วาง URL ของ Web App ที่ได้จากการ Deploy ไฟล์ <code class="inline">payroll/Code.gs</code> (ดูขั้นตอนใน README-payroll.md)</p>
    <div class="field"><label>URL ของ Web App</label><input id="cn_url" value="${esc(gasUrl())}" placeholder="https://script.google.com/macros/s/.../exec"></div>
    <div class="field-error" id="cn_err"></div>
    <div class="modal-actions">${!isDemo()?'<button class="btn" id="cn_demo" style="margin-right:auto;">กลับไปโหมดทดลอง</button>':''}<button class="btn" data-close>ยกเลิก</button><button class="btn btn-primary" id="cn_test">ทดสอบและบันทึก</button></div>`, 560);
  document.getElementById('cn_test').addEventListener('click', async ()=>{
    const url = document.getElementById('cn_url').value.trim(), err = document.getElementById('cn_err');
    try{
      const r = await fetch(url); const j = await r.json();
      if(j.app !== 'payroll') throw new Error('URL นี้ไม่ใช่ Web App ของระบบเงินเดือน');
      localStorage.setItem(PR_URL_KEY, url); setDemoSession(false); closeModal(); toast('เชื่อมต่อแล้ว — กรุณาเข้าสู่ระบบด้วยรหัสผ่านของ Apps Script'); logout(true);
    }catch(e){ err.textContent = 'เชื่อมต่อไม่สำเร็จ: ' + e.message; err.style.display='block'; }
  });
  document.getElementById('cn_demo')?.addEventListener('click', ()=>{ setDemoSession(true); closeModal(); logout(true); });
}

/* ============================================================ binding */
function bindView(){
  const v = document.getElementById('prView');
  const on = (sel, fn) => v.querySelectorAll(sel).forEach(el => el.addEventListener('click', e => fn(el, e)));
  on('[data-goto]', el => setTab(el.dataset.goto));
  on('[data-run-daily]', async () => {
    const r = await act('runDailyJob', {}, res => { const ev = (res.result && res.result.events) || []; return ev.length ? 'งานอัตโนมัติ: ' + ev.map(e=>({fund:'หักเงินสะสม',draft:'สร้างร่างรอบเลื่อน',applied:'ปรับเงินเดือน',waiting:'รอกำหนด % ให้ครบ'})[e.type]).join(', ') : 'งานอัตโนมัติทำงานแล้ว — วันนี้ไม่มีงานที่ต้องทำ'; });
  });
  on('[data-ledger]', el => openLedgerModal(el.dataset.ledger));
  on('[data-tier-preset]', () => { v.querySelectorAll('[data-tier-idx]').forEach(inp => { inp.value = TIER_PRESET[+inp.dataset.tierIdx] ?? 0; inp.closest('.tier-card')?.classList.remove('unset'); }); toast('ใส่ค่าแนะนำแล้ว — แก้ได้ แล้วกด "บันทึกและคำนวณใหม่"'); });
  on('[data-tier-save]', saveTierPercents);
  v.querySelectorAll('[data-row-staff]').forEach(tr => {
    tr.addEventListener('click', e => { if(e.target.closest('button, a, input, select')) return; openLedgerModal(tr.dataset.rowStaff); });
    tr.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target === tr) openLedgerModal(tr.dataset.rowStaff); });
  });
  on('[data-edit-staff]', el => openStaffModal(el.dataset.editStaff));
  on('[data-add-staff]', () => openStaffModal(null));
  on('[data-import]', pickImport);
  on('[data-template]', downloadTemplate);
  on('[data-sync-main]', async () => { await act('syncFromMain', {}, r => `ดึงรายชื่อแล้ว: เพิ่ม ${r.result.added} คน · อัปเดต ${r.result.updated} คน`); });
  on('[data-fm]', el => { const k = Number(el.dataset.fm); PR.fundMonth = k ? ymAdd(PR.fundMonth, k) : todayYm(); PR.fundYear = fyOf(PR.fundMonth); render(); });
  on('[data-gen-month]', async el => { await act('generateMonth', { period: el.dataset.genMonth }, r => `สร้างรายการหักแล้ว ${r.result.created} คน`); });
  on('[data-del-contrib]', async el => { if(confirm('ลบรายการหักเงินสะสมนี้?')) await act('deleteContribution', { id: el.dataset.delContrib }, 'ลบรายการแล้ว'); });
  on('[data-round-key]', el => { PR.roundKey = el.dataset.roundKey; render(); });
  on('[data-create-round]', async el => { await act('createRound', { key: el.dataset.createRound }, 'สร้างร่างรอบเลื่อนเงินเดือนแล้ว'); });
  on('[data-refresh-round]', async el => { await act('refreshRound', { id: el.dataset.refreshRound }, 'ดึงคะแนน KPI ล่าสุดแล้ว'); });
  on('[data-delete-round]', async el => { if(confirm('ลบร่างรอบนี้? (สร้างใหม่ได้ภายหลัง)')) await act('deleteRound', { id: el.dataset.deleteRound }, 'ลบร่างแล้ว'); });
  on('[data-apply-round]', el => confirmApply(el.dataset.applyRound));
  on('[data-exp]', el => runExport(el.dataset.exp, el.dataset.fmt));
  on('[data-save-config]', saveConfig);
  on('[data-add-tier]', () => { document.getElementById('tierRows').insertAdjacentHTML('beforeend', tierRowHtml({ min:'', label:'', percent:'' })); bindTierRows(); });
  bindTierRows();
  on('[data-install-trigger]', async () => { await act('installTrigger', {}, 'เปิดงานอัตโนมัติรายวันแล้ว'); });
  on('[data-change-pw]', () => openPasswordModal(false));
  on('[data-conn]', openConnModal);
  on('[data-reset-demo]', async () => { if(confirm('ล้างข้อมูลทดลองทั้งหมดแล้วสร้างข้อมูลตัวอย่างใหม่?')) await act('resetDemo', {}, 'สร้างข้อมูลทดลองใหม่แล้ว'); });
  v.querySelector('#staffSearch')?.addEventListener('input', e => { PR.staffQuery = e.target.value; const pos = e.target.selectionStart; render(); const s = document.getElementById('staffSearch'); s.focus(); s.setSelectionRange(pos,pos); });
  v.querySelector('#fundYearSel')?.addEventListener('change', e => { PR.fundYear = Number(e.target.value); render(); });
  v.querySelectorAll('.cell-in[data-item]').forEach(inp => inp.addEventListener('change', async () => {
    const patch = {}; patch[inp.dataset.field] = inp.value;
    try{ await api('updateRoundItem', { id: inp.dataset.item, patch }); render(); toast('บันทึกแล้ว'); }catch(e){ toast(e.message); }
  }));
  // stat spotlight
  v.querySelectorAll('.stat').forEach(s => s.addEventListener('pointermove', e => { const r = s.getBoundingClientRect(); s.style.setProperty('--mx', (e.clientX-r.left)+'px'); s.style.setProperty('--my', (e.clientY-r.top)+'px'); }));
}
function bindTierRows(){
  document.querySelectorAll('#tierRows [data-del-tier]').forEach(b=>{ if(b._b) return; b._b = 1; b.addEventListener('click', ()=>b.closest('tr').remove()); });
  document.querySelectorAll('#tierRows [data-k="percent"]').forEach(i=>{ if(i._b) return; i._b = 1; i.addEventListener('input', ()=>i.classList.toggle('is-empty', i.value.trim()==='')); });
}
function confirmApply(roundId){
  const round = PR.data.rounds.find(r=>r.id===roundId); const S = pr_roundSummary(snapDb(), roundId);
  openModal(`<h3>ปรับเงินเดือน${pr_roundInfo(round.key).label}?</h3>
    <div class="pr-confirm">
      <div><small>ผู้ได้เลื่อน</small><b>${(PR.data.roundItems||[]).filter(i=>i.roundId===roundId && pr_bool(i.eligible) && n(i.raise)>0).length} คน</b></div>
      <div><small>เงินเดือนเพิ่มรวม</small><b>+${baht(S.totalRaise)} บาท/เดือน</b></div>
      <div><small>ยังไม่กำหนด %</small><b class="${S.pending?'neg':''}">${S.pending} คน</b></div>
    </div>
    <p class="muted">เงินเดือนของทุกคนในรายการจะถูกปรับทันทีและบันทึกประวัติไว้ ${S.pending?'<b class="neg">คนที่ยังไม่กำหนด % จะไม่ได้เลื่อนในรอบนี้</b> ':''}การหักเงินสะสมเดือนถัดไปจะใช้เงินเดือนใหม่ — ทำแล้วย้อนกลับไม่ได้</p>
    <div class="modal-actions"><button class="btn" data-close>ยกเลิก</button><button class="btn btn-primary" id="ap_go">ยืนยันปรับเงินเดือน</button></div>`, 520);
  document.getElementById('ap_go').addEventListener('click', async ()=>{ closeModal(); await act('applyRound', { id: roundId }, r => `ปรับเงินเดือนแล้ว ${r.result.changed} คน`); });
}

/* ============================================================ theme + init */
function toggleTheme(ev){
  const next = document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
  const apply = ()=>{ document.documentElement.setAttribute('data-theme', next); try{ localStorage.setItem('hr_theme', next); }catch(e){} };
  if(!document.startViewTransition || reducedMotion()) return apply();
  const x = ev ? ev.clientX : innerWidth/2, y = ev ? ev.clientY : 0, r = Math.hypot(Math.max(x, innerWidth-x), Math.max(y, innerHeight-y));
  document.startViewTransition(apply).ready.then(()=>document.documentElement.animate({ clipPath:[`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration:520, easing:'cubic-bezier(.22,1,.36,1)', pseudoElement:'::view-transition-new(root)' })).catch(()=>{});
}
document.addEventListener('click', e => {
  if(e.target.closest('[data-theme-toggle]')) toggleTheme(e);
  const t = e.target.closest('[data-tab]'); if(t) setTab(t.dataset.tab);
  if(e.target.id === 'modalOverlay') closeModal();
});
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });
document.addEventListener('DOMContentLoaded', () => {
  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const tg = document.getElementById('prPwdToggle'); tg.innerHTML = EYE;
  tg.addEventListener('click', ()=>{ const p = document.getElementById('prPassword'); p.type = p.type==='password' ? 'text' : 'password'; });
  document.getElementById('prLoginForm').addEventListener('submit', login);
  document.getElementById('prLogout').addEventListener('click', ()=>logout(false));
  document.getElementById('prSaveUrl').addEventListener('click', async ()=>{
    const url = document.getElementById('prGasUrl').value.trim();
    if(!/^https:\/\/script\.google\.com\//.test(url)){ toast('URL ต้องขึ้นต้นด้วย https://script.google.com/'); return; }
    localStorage.setItem(PR_URL_KEY, url); setDemoSession(false); showLogin(); toast('บันทึก URL แล้ว — เข้าสู่ระบบด้วยรหัสผ่านของ Apps Script');
  });
  document.getElementById('prUseDemo').addEventListener('click', ()=>{ setDemoSession(true); showLogin(); });
  resumeSession();
});
