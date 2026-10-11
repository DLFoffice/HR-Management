/* ===== datepicker.js ===== */
const THAI_MONTHS_FULL = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const THAI_DAYS_SHORT = ["อา","จ","อ","พ","พฤ","ศ","ส"];
let __tdateOpenPanel = null;
let __tdateOpenField = null;

function thaiDateFieldHtml(id, isoValue, placeholder){
  const label = isoValue ? buddhistDate(isoValue) : '';
  return `<div class="tdate-field" data-field-for="${id}">
    <input type="hidden" id="${id}" value="${esc(isoValue||'')}">
    <input type="text" class="tdate-display" readonly placeholder="${esc(placeholder||'เลือกวันที่')}" value="${esc(label)}">
    <span class="tdate-icon">📅</span>
  </div>`;
}

function initThaiDatePickers(root){
  (root||document).querySelectorAll('.tdate-field').forEach(field=>{
    const hidden = field.querySelector('input[type=hidden]');
    const display = field.querySelector('.tdate-display');
    const openFn = (e)=>{ e.stopPropagation(); toggleDatePickerPanel(field, hidden, display); };
    display.addEventListener('click', openFn);
    field.querySelector('.tdate-icon').addEventListener('click', openFn);
  });
}

function toggleDatePickerPanel(field, hidden, display){
  if(__tdateOpenField === field){ closeAnyDatePicker(); return; }
  closeAnyDatePicker();
  const current = hidden.value ? new Date(hidden.value+'T00:00:00') : new Date();
  let viewYear = current.getFullYear();
  let viewMonth = current.getMonth();

  const panel = document.createElement('div');
  panel.className = 'tdate-panel';
  panel.style.position = 'fixed';
  panel.style.zIndex = 400;
  document.body.appendChild(panel);
  field.classList.add('open');

  function render(){
    panel.innerHTML = buildCalendarHtml(viewYear, viewMonth, hidden.value);
    panel.querySelector('.tdate-prev').onclick=(e)=>{e.stopPropagation(); viewMonth--; if(viewMonth<0){viewMonth=11; viewYear--;} render();};
    panel.querySelector('.tdate-next').onclick=(e)=>{e.stopPropagation(); viewMonth++; if(viewMonth>11){viewMonth=0; viewYear++;} render();};
    panel.querySelector('.tdate-month-select').onchange=(e)=>{ e.stopPropagation(); viewMonth=Number(e.target.value); render();};
    panel.querySelector('.tdate-year-select').onchange=(e)=>{ e.stopPropagation(); viewYear=Number(e.target.value); render();};
    panel.querySelectorAll('.tdate-day[data-date]').forEach(d=>{
      d.onclick=(e)=>{
        e.stopPropagation();
        hidden.value = d.dataset.date;
        display.value = buddhistDate(d.dataset.date);
        hidden.dispatchEvent(new Event('change', {bubbles:true}));
        closeAnyDatePicker();
      };
    });
    panel.querySelector('.tdate-today').onclick=(e)=>{
      e.stopPropagation();
      const t = todayStr();
      hidden.value = t; display.value = buddhistDate(t);
      hidden.dispatchEvent(new Event('change', {bubbles:true}));
      closeAnyDatePicker();
    };
    panel.querySelector('.tdate-clear').onclick=(e)=>{
      e.stopPropagation();
      hidden.value = ''; display.value = '';
      hidden.dispatchEvent(new Event('change', {bubbles:true}));
      closeAnyDatePicker();
    };
    panel.querySelectorAll('select').forEach(s=>s.addEventListener('click', e=>e.stopPropagation()));
  }
  render();

  const rect = field.getBoundingClientRect();
  const panelW = 280;
  let left = rect.left;
  if(left + panelW > window.innerWidth - 10) left = window.innerWidth - panelW - 10;
  let top = rect.bottom + 6;
  if(top + 340 > window.innerHeight){ top = Math.max(rect.top - 346, 10); }
  panel.style.left = left+'px';
  panel.style.top = top+'px';

  __tdateOpenPanel = panel;
  __tdateOpenField = field;
  setTimeout(()=> document.addEventListener('mousedown', tdateOutsideClick), 0);
}

function tdateOutsideClick(e){
  if(__tdateOpenPanel && !__tdateOpenPanel.contains(e.target) && !(__tdateOpenField && __tdateOpenField.contains(e.target))){
    closeAnyDatePicker();
  }
}
function closeAnyDatePicker(){
  if(__tdateOpenPanel){ __tdateOpenPanel.remove(); __tdateOpenPanel=null; }
  if(__tdateOpenField){ __tdateOpenField.classList.remove('open'); __tdateOpenField=null; }
  document.removeEventListener('mousedown', tdateOutsideClick);
}

function buildCalendarHtml(year, month, selectedIso){
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  let cells = '';
  for(let i=0;i<firstDay;i++){
    const d = daysInPrevMonth - firstDay + 1 + i;
    cells += `<div class="tdate-day tdate-muted">${d}</div>`;
  }
  const todayIso = todayStr();
  for(let d=1; d<=daysInMonth; d++){
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = ['tdate-day'];
    if(iso===selectedIso) cls.push('tdate-selected');
    else if(iso===todayIso) cls.push('tdate-today-mark');
    cells += `<div class="${cls.join(' ')}" data-date="${iso}">${d}</div>`;
  }
  const totalCells = firstDay+daysInMonth;
  const trailing = (7-(totalCells%7))%7;
  for(let i=1;i<=trailing;i++) cells += `<div class="tdate-day tdate-muted">${i}</div>`;

  const nowY = new Date().getFullYear();
  let yearOptions = '';
  for(let y=nowY+5; y>=nowY-95; y--){
    yearOptions += `<option value="${y}" ${y===year?'selected':''}>${y+543}</option>`;
  }
  const monthOptions = THAI_MONTHS_FULL.map((m,i)=>`<option value="${i}" ${i===month?'selected':''}>${m}</option>`).join('');
  return `
  <div class="tdate-header">
    <button type="button" class="tdate-nav tdate-prev">‹</button>
    <select class="tdate-month-select">${monthOptions}</select>
    <select class="tdate-year-select">${yearOptions}</select>
    <button type="button" class="tdate-nav tdate-next">›</button>
  </div>
  <div class="tdate-grid tdate-grid-head">${THAI_DAYS_SHORT.map(d=>`<div class="tdate-dayname">${d}</div>`).join('')}</div>
  <div class="tdate-grid">${cells}</div>
  <div class="tdate-footer">
    <button type="button" class="tdate-link tdate-clear">ล้าง</button>
    <button type="button" class="tdate-link tdate-today">วันนี้</button>
  </div>`;
}

/* ---------------- Leave calendar (month view with events) ---------------- */
const LEAVE_TYPE_CSS = { 'ป':'sick', 'พ':'vac', 'ก':'personal' };

function parseYMD(dateStr){
  // extracts the Y/M/D digits explicitly via regex and builds the Date from
  // numeric parts — avoids any ambiguity/inconsistency from browser string-based
  // Date parsing (e.g. stray whitespace, timezone letters, or odd separators)
  const s = toDateOnly(dateStr);
  if(!s) return null;
  const m = String(s).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if(!m) return null;
  const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  return isNaN(d) ? null : d;
}

/* After an admin approves/rejects/resets a leave, jump whichever leave-calendar
   views exist (admin + self-service) to the month of that leave's start date.
   Without this, the calendar silently stays on today's real-world month, so an
   approval for a past/future month never appears to "show up" even though the
   data is correct — the admin is just looking at the wrong month. */
function jumpLeaveCalendarsToDate(dateStr){
  const d = parseYMD(dateStr);
  if(!d) return;
  if(typeof adminLeaveCalState !== 'undefined' && adminLeaveCalState){
    adminLeaveCalState.year = d.getFullYear();
    adminLeaveCalState.month = d.getMonth();
  }
  if(typeof selfLeaveCalState !== 'undefined' && selfLeaveCalState){
    selfLeaveCalState.year = d.getFullYear();
    selfLeaveCalState.month = d.getMonth();
  }
}

function expandLeaveDates(leaves){
  const map = {};
  leaves.forEach(l=>{
    if((l.approvalStatus||'approved')==='rejected') return;
    let d = parseYMD(l.startDate);
    if(!d) return;
    let end = parseYMD(l.endDate);
    if(!end || end < d) end = new Date(d.getTime()); // fall back so at least the start day still shows up
    let guard = 0;
    while(d <= end && guard < 370){
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if(!map[key]) map[key] = [];
      map[key].push({ name:l.employeeName, type:l.leaveType, id:l.id, empId:l.employeeId, pending:(l.approvalStatus||'approved')==='pending',
                      start: toDateOnly(l.startDate), end: toDateOnly(l.endDate || l.startDate), reason: l.reason||'' });
      d.setDate(d.getDate()+1);
      guard++;
    }
  });
  return map;
}

const THAI_DAYS_FULL = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
function calShortName(n){ return String(n||'').replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|ดร\.)\s*/,'').trim(); }

function buildLeaveCalendarGrid(year, month, leaveMap){
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const todayIso = todayStr();
  let cells = '';
  for(let i=firstDay-1; i>=0; i--) cells += `<div class="lcal-cell lcal-muted"><span class="c2-num">${prevDays-i}</span></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const wd = new Date(year, month, d).getDay();
    // stable order: earlier-starting leave first, so multi-day bars tend to stay on the same line
    const events = (leaveMap[iso] || []).slice().sort((x,y)=> String(x.start).localeCompare(String(y.start)) || String(x.id).localeCompare(String(y.id)));
    const people = new Set(events.map(e=>e.empId)).size;
    const hol = typeof holidayName==='function' ? holidayName(iso) : '';
    const isToday = iso === todayIso;
    const shown = events.slice(0,3);
    const overflow = events.length - shown.length;
    const cls = ['lcal-cell', isToday?'lcal-today':'', events.length?'lcal-has-events':'', (wd===0||wd===6)?'lcal-weekend':'', hol?'lcal-holiday':'', iso < todayIso ? 'lcal-past':''].filter(Boolean).join(' ');
    cells += `<div class="${cls}" data-cal-date="${iso}" style="--i:${d}">
      <div class="c2-top">
        <span class="c2-num">${d}</span>
        ${people ? `<span class="c2-count" title="ลา ${people} คน">${people} คน</span>` : ''}
        <button type="button" class="c2-add" data-cal-add="${iso}" title="บันทึกลาวันที่ ${d} ${THAI_MONTHS_FULL[month]}" aria-label="บันทึกลาวันนี้">+</button>
      </div>
      ${hol ? `<div class="c2-hol" title="${esc(hol)}">${esc(hol)}</div>` : ''}
      <div class="lcal-events">
        ${shown.map(e=>{
          const startHere = e.start===iso || wd===0;
          const endHere = e.end===iso || wd===6;
          const pos = startHere && endHere ? 'one' : startHere ? 'start' : endHere ? 'end' : 'mid';
          const nm = calShortName(e.name);
          const off = (wd===0 || wd===6 || !!hol);   // day inside the leave range that isn't counted as a leave day
          return `<div class="lcal-event c2-ev lcal-${LEAVE_TYPE_CSS[e.type]||'personal'} pos-${pos}${e.pending?' is-pending':''}${off?' is-off':''}" title="${esc(e.name)} · ${esc(LEAVE_TYPES[e.type]||'ลา')}${e.pending?' (รออนุมัติ)':''}${off?' · วันหยุด ไม่นับเป็นวันลา':''}${e.reason?' · '+esc(e.reason):''}">
            ${startHere ? `<span class="c2-ini">${esc(nm.slice(0,1))}</span>` : ''}<span class="c2-name">${esc(nm)}</span>${e.pending && startHere?'<span class="c2-wait">รอ</span>':''}
          </div>`;
        }).join('')}
        ${overflow>0?`<div class="lcal-more">+ อีก ${overflow} คน</div>`:''}
      </div>
    </div>`;
  }
  const totalCells = firstDay + daysInMonth;
  const trailing = (7-(totalCells%7))%7;
  for(let i=1;i<=trailing;i++) cells += `<div class="lcal-cell lcal-muted"><span class="c2-num">${i}</span></div>`;
  return cells;
}

function leaveCalendarHtml(calState, leaves){
  const map = expandLeaveDates(leaves);
  const nowY = new Date().getFullYear();
  let yearOptions = '';
  for(let y=nowY+3; y>=nowY-8; y--) yearOptions += `<option value="${y}" ${y===calState.year?'selected':''}>${y+543}</option>`;
  const monthOptions = THAI_MONTHS_FULL.map((m,i)=>`<option value="${i}" ${i===calState.month?'selected':''}>${m}</option>`).join('');
  // month summary
  const prefix = `${calState.year}-${String(calState.month+1).padStart(2,'0')}-`;
  const ids = new Set(), ppl = new Set();
  Object.keys(map).forEach(k=>{ if(k.startsWith(prefix)) map[k].forEach(e=>{ ids.add(e.id); ppl.add(e.empId); }); });
  const hols = typeof holidaysInMonth==='function' ? holidaysInMonth(calState.year, calState.month) : [];
  let work = 0; const nd = new Date(calState.year, calState.month+1, 0).getDate();
  for(let d=1; d<=nd; d++){ const dt = new Date(calState.year, calState.month, d); if(typeof isWorkingDay==='function' ? isWorkingDay(dt) : (dt.getDay()%6!==0)) work++; }
  const t = new Date(); const isThisMonth = t.getFullYear()===calState.year && t.getMonth()===calState.month;
  const dir = calState.dir || ''; calState.dir = '';
  return `
  <div class="lcal-wrap cal2">
    <div class="cal2-head">
      <div class="cal2-titlebox">
        <div class="cal2-title"><span>${THAI_MONTHS_FULL[calState.month]}</span> <em>${calState.year+543}</em></div>
        <div class="cal2-meta">
          <span class="cm"><b>${ids.size}</b> รายการลา</span>
          <span class="cm"><b>${ppl.size}</b> คน</span>
          <span class="cm cm-hol"><b>${hols.length}</b> วันหยุดราชการ</span>
          <span class="cm cm-work"><b>${work}</b> วันทำการ</span>
        </div>
      </div>
      <div class="cal2-nav">
        <button class="cal2-btn" data-cal-nav="prev" aria-label="เดือนก่อน"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <select class="lcal-month-select" data-cal-month aria-label="เดือน">${monthOptions}</select>
        <select class="lcal-year-select" data-cal-year aria-label="ปี">${yearOptions}</select>
        <button class="cal2-btn" data-cal-nav="next" aria-label="เดือนถัดไป"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg></button>
        <button class="cal2-today${isThisMonth?' on':''}" data-cal-today>วันนี้</button>
      </div>
    </div>
    <div class="lcal-grid lcal-grid-head">
      ${THAI_DAYS_FULL.map((d,i)=>`<div class="lcal-dayname${i===0||i===6?' we':''}"><span class="dn-full">${d}</span><span class="dn-short">${THAI_DAYS_SHORT[i]}</span></div>`).join('')}
    </div>
    <div class="lcal-grid cal2-grid${dir?' slide-'+dir:''}">${buildLeaveCalendarGrid(calState.year, calState.month, map)}</div>
    <div class="lcal-legend">
      <span class="lcal-legend-item"><span class="lg lg-sick"></span>ลาป่วย</span>
      <span class="lcal-legend-item"><span class="lg lg-vac"></span>ลาพักผ่อน</span>
      <span class="lcal-legend-item"><span class="lg lg-personal"></span>ลากิจ</span>
      <span class="lcal-legend-item"><span class="lg lg-pending"></span>รออนุมัติ</span>
      <span class="lcal-legend-item"><span class="lg lg-hol"></span>วันหยุดราชการ</span>
      <span class="lcal-legend-item"><span class="lg lg-we"></span>เสาร์–อาทิตย์</span>
      <span class="lcal-legend-hint">คลิกวันเพื่อดูรายชื่อ · กด + เพื่อบันทึกลาวันนั้น</span>
    </div>
  </div>`;
}

/* Fill a Thai date field (hidden ISO input + visible label) and fire change */
function setThaiDateField(id, iso){
  const hidden = document.getElementById(id);
  if(!hidden) return;
  hidden.value = iso || '';
  const disp = hidden.closest('.tdate-field')?.querySelector('.tdate-display');
  if(disp) disp.value = iso ? buddhistDate(iso) : '';
  hidden.dispatchEvent(new Event('change', {bubbles:true}));
}

function bindLeaveCalendarEvents(container, calState, leaves, rerenderFn){
  container.querySelectorAll('[data-cal-nav]').forEach(b=>b.addEventListener('click', ()=>{
    if(b.dataset.calNav==='prev'){ calState.month--; if(calState.month<0){calState.month=11; calState.year--;} calState.dir='prev'; }
    else { calState.month++; if(calState.month>11){calState.month=0; calState.year++;} calState.dir='next'; }
    rerenderFn();
  }));
  const monthSel = container.querySelector('[data-cal-month]');
  if(monthSel) monthSel.addEventListener('change', ()=>{ calState.month = Number(monthSel.value); rerenderFn(); });
  const yearSel = container.querySelector('[data-cal-year]');
  if(yearSel) yearSel.addEventListener('change', ()=>{ calState.year = Number(yearSel.value); rerenderFn(); });
  const todayBtn = container.querySelector('[data-cal-today]');
  if(todayBtn) todayBtn.addEventListener('click', ()=>{
    const t = new Date();
    calState.year = t.getFullYear(); calState.month = t.getMonth();
    rerenderFn();
  });
  container.querySelectorAll('[data-cal-add]').forEach(btn=>btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const iso = btn.dataset.calAdd;
    openLeaveModal(null);
    setTimeout(()=>{ setThaiDateField('f_start', iso); setThaiDateField('f_end', iso); }, 30);
  }));
  const map = expandLeaveDates(leaves);
  container.querySelectorAll('.lcal-cell.lcal-has-events').forEach(cell=>{
    cell.addEventListener('click', ()=>{
      const date = cell.dataset.calDate;
      const events = map[date] || [];
      openModal(`
        <h3>วันลาวันที่ ${buddhistDate(date)}</h3>
        <div class="table-wrap"><table class="reg">
          <thead><tr><th></th><th>ชื่อพนักงาน</th><th>ประเภท</th><th>สถานะ</th></tr></thead>
          <tbody>
            ${events.map(e=>`<tr class="row-clickable" data-open-leave="${e.id}"><td style="width:40px;">${avatarHtml(employeeById(e.empId),32)}</td><td>${esc(e.name)}</td><td>${leaveTypeTag(e.type)}</td><td>${e.pending?'<span class="tag tag-amber">รออนุมัติ</span>':'<span class="tag tag-green">อนุมัติแล้ว</span>'}</td></tr>`).join('')}
          </tbody>
        </table></div>
        <div class="modal-actions"><button class="btn" id="btnCancelModal">ปิด</button></div>
      `);
      document.querySelectorAll('[data-open-leave]').forEach(tr=>tr.addEventListener('click', ()=>{
        closeModal();
        setTimeout(()=>openLeaveDetailModal(tr.dataset.openLeave), 200);
      }));
    });
  });
}

/* ---------------- Navigation ---------------- */
