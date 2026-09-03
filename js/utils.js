/* ===== utils.js ===== */
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('show'); void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>{ t.classList.remove('show'); }, 3200);
}
function animateValue(el, to, decimals, suffix){
  if(!el) return;
  const from = 0;
  const dur = 700;
  const t0 = performance.now();
  function step(t){
    const p = Math.min((t-t0)/dur, 1);
    const eased = 1 - Math.pow(1-p, 3);
    const val = from + (to-from)*eased;
    el.textContent = (decimals? val.toFixed(decimals) : Math.round(val)).toLocaleString('th-TH') + (suffix||'');
    if(p<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function esc(s){ return (s===undefined||s===null)? '' : String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function buddhistDate(dstr){
  if(!dstr) return '-';
  const d = new Date(dstr);
  if(isNaN(d)) return dstr;
  try{
    return new Intl.DateTimeFormat('th-TH-u-ca-buddhist',{day:'2-digit',month:'short',year:'numeric'}).format(d);
  }catch(e){ return dstr; }
}
function fmtDateTime(iso){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'2-digit'}) + ' ' + d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
}
function money(n){
  n = Number(n)||0;
  return n.toLocaleString('th-TH',{maximumFractionDigits:2});
}
function safeNum(v){
  if(v===undefined || v===null || v==='') return 0;
  if(typeof v==='number') return isNaN(v) ? 0 : v;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}
function toDateOnly(v){
  if(v===undefined || v===null || v==='') return '';
  if(v instanceof Date){
    if(isNaN(v)) return '';
    const y=v.getFullYear(), m=String(v.getMonth()+1).padStart(2,'0'), d=String(v.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  // compact yyyymmdd (e.g. Google Sheets stored it as a plain number: 19640903)
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  return s;
}
function todayStr(){ return new Date().toISOString().slice(0,10); }

/* Normalizes date-like fields on records right after they're loaded (from
   Google Sheet or local cache), so a malformed source value — e.g. Google
   Sheets storing "1964-09-03" as the plain number 19640903 — never leaks
   into date math or display anywhere else in the app. */
const RECORD_DATE_FIELDS = {
  employees: ['birthDate','hireDate','retireDate'],
  leaves: ['submitDate','startDate','endDate'],
  loans: ['submitDate'],
  welfare: ['submitDate'],
  kpi: ['evaluatedDate'],
  training: ['startDate','endDate']
};
function normalizeRecordDates(sheetKey, list){
  const fields = RECORD_DATE_FIELDS[sheetKey];
  if(!fields || !Array.isArray(list)) return list;
  list.forEach(rec=>{
    fields.forEach(f=>{
      if(rec[f]!==undefined && rec[f]!==null && rec[f]!=='') rec[f] = toDateOnly(rec[f]);
    });
  });
  return list;
}
function normalizeAllDates(){
  DATA_KEYS.forEach(k=> normalizeRecordDates(k, state[k]));
}

function fiscalYearRange(ref){
  const d = ref ? new Date(ref) : new Date();
  const y = d.getFullYear();
  let start, end;
  if(d.getMonth() >= 9){ start = new Date(y,9,1); end = new Date(y+1,8,30); }
  else { start = new Date(y-1,9,1); end = new Date(y,8,30); }
  return {start, end};
}
function inRange(dateStr, start, end){
  const d = new Date(dateStr);
  return d>=start && d<=end;
}

function employeeById(id){ return state.employees.find(e=>e.id===id); }
function employeeName(emp){ return emp ? emp.name : ''; }

function ageFromDate(dstr, refDate){
  if(!dstr) return '-';
  const b = new Date(dstr); const r = refDate || new Date();
  let years = r.getFullYear()-b.getFullYear();
  let months = r.getMonth()-b.getMonth();
  if(r.getDate() < b.getDate()) months--;
  if(months<0){ years--; months+=12; }
  return years + ' ปี ' + months + ' เดือน';
}

function renderBrand(){
  const html = state.settings.logoUrl
    ? `<img src="${esc(state.settings.logoUrl)}" alt="โลโก้องค์กร" onerror="this.parentElement.textContent='บค';">`
    : 'บค';
  const seal = document.getElementById('brandSeal');
  if(seal) seal.innerHTML = html;
  const loginLogo = document.getElementById('loginLogo');
  if(loginLogo) loginLogo.innerHTML = html;
}

/* ---------------- Thai date picker component ---------------- */
