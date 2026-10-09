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
  const d = (dstr instanceof Date) ? dstr : (localDate(dstr) || new Date(dstr));
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
const MONTH_ABBR = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const THAI_MONTH_LOOKUP = (()=>{
  const full = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const abbr = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const map = {};
  full.forEach((n,i)=>{ map[n]=i+1; });
  abbr.forEach((n,i)=>{ map[n]=i+1; map[n.replace(/\./g,'')]=i+1; });
  return map;
})();

/* Builds a validated YYYY-MM-DD string. Years written in the Buddhist era
   (พ.ศ. — anything past 2400) are converted to ค.ศ. so a sheet that stores
   "04/09/2507" or a date cell typed as year 2507 still lands on 1964. */
function ymdString(y, m, d){
  y = Number(y); m = Number(m); d = Number(d);
  if(!y || !m || !d) return '';
  if(y > 2400) y -= 543;
  if(m<1 || m>12 || d<1 || d>31) return '';
  const probe = new Date(y, m-1, d);
  if(probe.getFullYear()!==y || probe.getMonth()!==m-1 || probe.getDate()!==d) return '';
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

/* Converts any date-like value coming from Google Sheet / cache / form into a
   plain calendar date "YYYY-MM-DD".

   ROOT CAUSE of the "wrong birthday" bug: Apps Script serializes a date cell
   as an ISO timestamp in UTC. A sheet in Asia/Bangkok that holds 4 Sep 1964
   arrives as "1964-09-03T17:00:00.000Z" — the old code just cut off the
   first 10 characters and got 3 Sep, one day early (and on the 1st of a
   month, the wrong MONTH, so people vanished from "birthdays this month").
   A calendar date stored at local midnight in any sheet timezone between
   UTC−12 and UTC+12 lands within 12 hours of the right UTC midnight, so we
   round to the nearest UTC day instead of truncating. */
function toDateOnly(v){
  if(v===undefined || v===null || v==='') return '';
  if(v instanceof Date){
    if(isNaN(v)) return '';
    return ymdString(v.getFullYear(), v.getMonth()+1, v.getDate());
  }
  // a raw spreadsheet serial number (days since 1899-12-30), e.g. 23624
  if(typeof v==='number' && v>0 && v<200000){
    const ms = Math.round(v)*86400000 + Date.UTC(1899,11,30);
    const d = new Date(ms);
    return ymdString(d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate());
  }
  const s = String(v).trim();
  if(!s) return '';
  let m;

  // ISO timestamp with a time part (what Apps Script sends for date cells)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if(m){
    if(m[7]){
      let off = 0;
      if(m[7].toUpperCase()!=='Z'){
        const sign = m[7][0]==='-' ? -1 : 1;
        const hh = Number(m[7].slice(1,3)), mm = Number(m[7].replace(':','').slice(3,5)||0);
        off = sign*(hh*60+mm);
      }
      let y = Number(m[1]);
      const beShift = y>2400 ? 543 : 0;
      y -= beShift;
      const utcMs = Date.UTC(y, Number(m[2])-1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]||0)) - off*60000;
      const rounded = new Date(Math.round(utcMs/86400000)*86400000);
      return ymdString(rounded.getUTCFullYear(), rounded.getUTCMonth()+1, rounded.getUTCDate());
    }
    // no timezone marker → the digits already are the local calendar date
    return ymdString(m[1], m[2], m[3]) || s;
  }
  // plain YYYY-MM-DD / YYYY/MM/DD
  m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if(m) return ymdString(m[1], m[2], m[3]) || s;
  // compact yyyymmdd (e.g. Google Sheets stored it as a plain number: 19640903)
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(m) return ymdString(m[1], m[2], m[3]) || s;
  // Thai convention dd/mm/yyyy (ค.ศ. or พ.ศ.), also dd-mm-yyyy and dd.mm.yyyy
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if(m) return ymdString(m[3], m[2], m[1]) || s;
  // Thai month name: "4 ก.ย. 2507", "4 กันยายน 2507", "4 กันยายน พ.ศ. 2507"
  m = s.match(/^(\d{1,2})\s*([ก-๙.]+)\s*(?:พ\.?ศ\.?|ค\.?ศ\.?)?\s*(\d{4})$/);
  if(m){
    const mo = THAI_MONTH_LOOKUP[m[2]] || THAI_MONTH_LOOKUP[m[2].replace(/\./g,'')];
    if(mo) return ymdString(m[3], mo, m[1]) || s;
  }
  // JS Date.toString() output: "Mon Sep 14 2026 00:00:00 GMT+0700 (...)". Read the
  // month name + day + year straight out of the text so it can't shift by a day.
  m = s.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);
  if(m){
    const mo = MONTH_ABBR[m[1].toLowerCase()];
    if(mo) return ymdString(m[3], mo, m[2]) || s;
  }
  // a numeric string that's really a sheet serial ("23624")
  if(/^\d{4,6}(\.\d+)?$/.test(s)) return toDateOnly(Number(s));
  return s;
}

/* Parse a stored date as a LOCAL calendar date (never via new Date("YYYY-MM-DD"),
   which is UTC midnight and shows the previous day west of Greenwich). */
function localDate(v){
  const s = toDateOnly(v);
  const m = s && String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
}
function todayStr(){
  const t = new Date();
  return ymdString(t.getFullYear(), t.getMonth()+1, t.getDate());
}

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
  const d = localDate(dateStr);
  return !!d && d>=start && d<=end;
}

function employeeById(id){ return state.employees.find(e=>e.id===id); }
function employeeName(emp){ return emp ? emp.name : ''; }

function ageFromDate(dstr, refDate){
  if(!dstr) return '-';
  const b = localDate(dstr); const r = refDate || new Date();
  if(!b) return '-';
  let years = r.getFullYear()-b.getFullYear();
  let months = r.getMonth()-b.getMonth();
  if(r.getDate() < b.getDate()) months--;
  if(months<0){ years--; months+=12; }
  return years + ' ปี ' + months + ' เดือน';
}

/* Numeric years of service/age, for sorting and for picking a tenure-tier color —
   ageFromDate() above returns a display string, this returns a plain number. */
function yearsOfServiceNum(dstr){
  if(!dstr) return -1;
  const b = localDate(dstr);
  if(!b) return -1;
  return (new Date() - b) / (1000*60*60*24*365.25);
}

const TENURE_TIERS = [
  { min: 20, cls: 'tenure-5' },
  { min: 10, cls: 'tenure-4' },
  { min: 5,  cls: 'tenure-3' },
  { min: 2,  cls: 'tenure-2' },
  { min: 0,  cls: 'tenure-1' }
];
function tenureBadgeHtml(hireDate){
  const yrs = yearsOfServiceNum(hireDate);
  if(yrs < 0) return '<span class="tenure-badge tenure-0">-</span>';
  const tier = TENURE_TIERS.find(t=>yrs>=t.min) || TENURE_TIERS[TENURE_TIERS.length-1];
  return `<span class="tenure-badge ${tier.cls}">${esc(ageFromDate(hireDate))}</span>`;
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

/* Employees whose birthday falls in the given month (0-based), sorted by day,
   with the age they turn this year. Reads the calendar date with localDate()
   so the day/month match what's typed in the Google Sheet exactly. */
function birthdaysInMonth(year, month){
  const today = new Date(); today.setHours(0,0,0,0);
  return state.employees
    .map(e=>({ e, b: localDate(e.birthDate) }))
    .filter(x=>x.b && x.b.getMonth()===month)
    .map(x=>{
      const day = x.b.getDate();
      const thisYear = new Date(year, month, day);
      return { emp:x.e, day, month, turning: year - x.b.getFullYear(),
               isToday: thisYear.getTime()===today.getTime(), isPast: thisYear < today };
    })
    .sort((a,b)=> a.day-b.day || String(a.emp.name).localeCompare(String(b.emp.name),'th'));
}
