/* ===== holidays.js =====
   วันหยุดราชการ / วันหยุดนักขัตฤกษ์

   แหล่งข้อมูลหลัก: ปฏิทิน "วันหยุดในประเทศไทย" ของ Google Calendar ซึ่งดึงผ่าน
   Google Apps Script ตัวเดิมของระบบ (action=holidays — ดูโค้ดที่ต้องเพิ่มในหน้า "ตั้งค่า")
   ถ้ายังไม่ได้เพิ่มโค้ดหรือดึงไม่สำเร็จ ระบบจะใช้รายการสำรองด้านล่างแทน

   วันหยุดเฉพาะของมูลนิธิ (ถ้ามี) เพิ่มได้ที่ ORG_EXTRA_HOLIDAYS หรือสร้างปฏิทิน Google
   ของหน่วยงานแล้วใส่ ID ไว้ในโค้ด Apps Script (ORG_CALENDAR_ID)
   ================================================================== */

/* รายการสำรอง (ตามประกาศ ครม. / ธปท.) — ใช้เมื่อดึงจาก Google ไม่ได้ */
const FALLBACK_HOLIDAYS = {
  // พ.ศ. 2569
  '2026-01-01':'วันขึ้นปีใหม่', '2026-01-02':'วันหยุดพิเศษ (ครม.)',
  '2026-03-03':'วันมาฆบูชา', '2026-04-06':'วันจักรี',
  '2026-04-13':'วันสงกรานต์', '2026-04-14':'วันสงกรานต์', '2026-04-15':'วันสงกรานต์',
  '2026-05-01':'วันแรงงานแห่งชาติ', '2026-05-04':'วันฉัตรมงคล', '2026-05-13':'วันพืชมงคล',
  '2026-05-31':'วันวิสาขบูชา', '2026-06-01':'ชดเชยวันวิสาขบูชา',
  '2026-06-03':'วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี',
  '2026-07-28':'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว',
  '2026-07-29':'วันอาสาฬหบูชา', '2026-07-30':'วันเข้าพรรษา',
  '2026-08-12':'วันแม่แห่งชาติ', '2026-10-13':'วันนวมินทรมหาราช',
  '2026-10-16':'วันหยุดพิเศษ (ครม.)', '2026-10-23':'วันปิยมหาราช',
  '2026-12-05':'วันพ่อแห่งชาติ', '2026-12-07':'ชดเชยวันพ่อแห่งชาติ',
  '2026-12-10':'วันรัฐธรรมนูญ', '2026-12-31':'วันสิ้นปี',
  // พ.ศ. 2570
  '2027-01-01':'วันขึ้นปีใหม่', '2027-02-21':'วันมาฆบูชา', '2027-02-22':'ชดเชยวันมาฆบูชา',
  '2027-04-06':'วันจักรี', '2027-04-13':'วันสงกรานต์', '2027-04-14':'วันสงกรานต์', '2027-04-15':'วันสงกรานต์',
  '2027-05-01':'วันแรงงานแห่งชาติ', '2027-05-03':'ชดเชยวันแรงงานแห่งชาติ', '2027-05-04':'วันฉัตรมงคล',
  '2027-05-20':'วันวิสาขบูชา', '2027-06-03':'วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี',
  '2027-07-18':'วันอาสาฬหบูชา', '2027-07-19':'ชดเชยวันอาสาฬหบูชา',
  '2027-07-28':'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว',
  '2027-08-12':'วันแม่แห่งชาติ', '2027-10-13':'วันนวมินทรมหาราช',
  '2027-10-23':'วันปิยมหาราช', '2027-10-25':'ชดเชยวันปิยมหาราช',
  '2027-12-05':'วันพ่อแห่งชาติ', '2027-12-06':'ชดเชยวันพ่อแห่งชาติ',
  '2027-12-10':'วันรัฐธรรมนูญ', '2027-12-31':'วันสิ้นปี'
};

/* วันหยุดเฉพาะของหน่วยงาน — เพิ่มได้ตามต้องการ เช่น '2026-11-15':'วันสถาปนามูลนิธิ' */
const ORG_EXTRA_HOLIDAYS = {};

const HOLIDAY_CACHE_KEY = 'hr_holidays_v1';
let holidayState = { map: Object.assign({}, FALLBACK_HOLIDAYS, ORG_EXTRA_HOLIDAYS), source: 'fallback', fetchedAt: null, error: '' };

(function loadHolidayCache(){
  try{
    const c = JSON.parse(localStorage.getItem(HOLIDAY_CACHE_KEY) || 'null');
    if(c && c.map && Object.keys(c.map).length){
      holidayState = { map: Object.assign({}, c.map, ORG_EXTRA_HOLIDAYS), source:'google', fetchedAt:c.fetchedAt, error:'' };
    }
  }catch(e){}
})();

/* Fetch from Apps Script (Google Calendar). Silent on failure: keeps cache/fallback. */
async function loadHolidaysFromGoogle(force){
  if(typeof gasReady!=='function' || !gasReady()) return false;
  const fresh = holidayState.source==='google' && holidayState.fetchedAt && (Date.now() - new Date(holidayState.fetchedAt)) < 12*3600e3;
  if(fresh && !force) return true;
  try{
    const y = new Date().getFullYear();
    const data = await gasGet(`holidays&from=${y-1}-01-01&to=${y+1}-12-31`);
    if(!data || data.error || !Array.isArray(data.holidays)) throw new Error((data && data.error) || 'Apps Script ยังไม่รองรับ action=holidays');
    const map = {};
    data.holidays.forEach(h=>{ const d = toDateOnly(h.date); if(d && h.name) map[d] = map[d] ? map[d] + ' / ' + h.name : String(h.name); });
    if(!Object.keys(map).length) throw new Error('ไม่พบวันหยุดจาก Google Calendar');
    // Google covers last year → next year, so it replaces the built-in list entirely
    holidayState = { map: Object.assign({}, map, ORG_EXTRA_HOLIDAYS), source:'google', fetchedAt:new Date().toISOString(), error:'' };
    try{ localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify({ map, fetchedAt: holidayState.fetchedAt })); }catch(e){}
    if(document.getElementById('app') && document.getElementById('app').style.display!=='none'
       && ['leaves','myleaves','settings','dashboard'].includes(state.currentView)) renderView();
    return true;
  }catch(e){
    holidayState.error = e.message;
    if(holidayState.source!=='google') holidayState.source = 'fallback';
    return false;
  }
}

function holidayName(ymd){ return holidayState.map[ymd] || ''; }
function isWeekendDate(d){ const w = d.getDay(); return w===0 || w===6; }
function isWorkingDay(d){ return !isWeekendDate(d) && !holidayName(ldYmdSafe(d)); }
function ldYmdSafe(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

/* Working days between two dates (inclusive) + what was skipped, for the leave form */
function workingDaysBetween(start, end){
  const s = parseYMD(start), e = parseYMD(end);
  if(!s || !e || e < s) return null;
  let work = 0, weekend = 0; const hol = [];
  for(let d = new Date(s), g = 0; d <= e && g < 400; d.setDate(d.getDate()+1), g++){
    if(isWeekendDate(d)) weekend++;
    else if(holidayName(ldYmdSafe(d))) hol.push({ date: ldYmdSafe(d), name: holidayName(ldYmdSafe(d)) });
    else work++;
  }
  return { work, weekend, holidays: hol, calendar: Math.round((e-s)/86400000)+1 };
}

function holidaysInMonth(year, month){
  const out = [];
  const n = new Date(year, month+1, 0).getDate();
  for(let d=1; d<=n; d++){
    const k = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(holidayState.map[k]) out.push({ date:k, day:d, name:holidayState.map[k], weekend:isWeekendDate(new Date(year,month,d)) });
  }
  return out;
}
function nextHolidays(count){
  const t = todayStr();
  return Object.keys(holidayState.map).filter(k=>k>=t).sort().slice(0, count).map(k=>({ date:k, name:holidayState.map[k] }));
}

/* Code the admin pastes into the existing Apps Script project (shown in Settings) */
const HOLIDAY_GAS_SNIPPET = `/* ===== วางต่อท้ายไฟล์ Code.gs เดิม ===== */
const TH_HOLIDAY_CAL = 'th.th#holiday@group.v.calendar.google.com';
const EN_HOLIDAY_CAL = 'en.th#holiday@group.v.calendar.google.com';
const ORG_CALENDAR_ID = ''; // (ไม่บังคับ) ID ปฏิทิน Google ของหน่วยงาน สำหรับวันหยุดเพิ่มเติม

function getCal_(id){ return CalendarApp.getCalendarById(id) || CalendarApp.subscribeToCalendar(id); }

function handleHolidays_(e){
  const tz = 'Asia/Bangkok';
  const p = (e && e.parameter) || {};
  const y = new Date().getFullYear();
  const from = p.from ? new Date(p.from + 'T00:00:00+07:00') : new Date(y - 1, 0, 1);
  const to   = p.to   ? new Date(p.to   + 'T23:59:59+07:00') : new Date(y + 1, 11, 31);
  const fmt = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  // ปฏิทินภาษาอังกฤษบอกได้ว่าวันไหนเป็น "Public holiday" (ไม่ใช่แค่วันสำคัญ)
  const publicDays = {};
  getCal_(EN_HOLIDAY_CAL).getEvents(from, to).forEach(ev => {
    if (/public holiday/i.test(ev.getDescription() || '')) publicDays[fmt(ev.getAllDayStartDate())] = true;
  });
  const hasFlags = Object.keys(publicDays).length > 0;
  const out = [];
  const push = (ev, force) => {
    const s = ev.getAllDayStartDate(), end = ev.getAllDayEndDate(); // end = วันถัดจากวันสุดท้าย
    for (let d = new Date(s); d < end; d.setDate(d.getDate() + 1)) {
      const k = fmt(d);
      if (force || !hasFlags || publicDays[k]) out.push({ date: k, name: ev.getTitle() });
    }
  };
  getCal_(TH_HOLIDAY_CAL).getEvents(from, to).forEach(ev => push(ev, false));
  if (ORG_CALENDAR_ID) getCal_(ORG_CALENDAR_ID).getEvents(from, to).forEach(ev => { if (ev.isAllDayEvent()) push(ev, true); });
  return ContentService.createTextOutput(JSON.stringify({ holidays: out }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* แล้วเพิ่ม 1 บรรทัดนี้เป็นบรรทัดแรกในฟังก์ชัน doGet(e) เดิม:
   if (e && e.parameter && e.parameter.action === 'holidays') return handleHolidays_(e);
*/`;
