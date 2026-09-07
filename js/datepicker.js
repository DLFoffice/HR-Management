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

function expandLeaveDates(leaves){
  const map = {};
  leaves.forEach(l=>{
    if(!l.startDate || !l.endDate) return;
    if((l.approvalStatus||'approved')==='rejected') return;
    let d = new Date(l.startDate+'T00:00:00');
    const end = new Date(l.endDate+'T00:00:00');
    if(isNaN(d) || isNaN(end)) return;
    let guard = 0;
    while(d <= end && guard < 370){
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if(!map[key]) map[key] = [];
      map[key].push({ name:l.employeeName, type:l.leaveType, id:l.id, pending:(l.approvalStatus||'approved')==='pending' });
      d.setDate(d.getDate()+1);
      guard++;
    }
  });
  return map;
}

function buildLeaveCalendarGrid(year, month, leaveMap){
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  let cells = '';
  for(let i=0;i<firstDay;i++) cells += `<div class="lcal-cell lcal-muted"></div>`;
  const todayIso = todayStr();
  for(let d=1; d<=daysInMonth; d++){
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const events = leaveMap[iso] || [];
    const isToday = iso === todayIso;
    const shown = events.slice(0,3);
    const overflow = events.length - shown.length;
    cells += `<div class="lcal-cell ${isToday?'lcal-today':''} ${events.length?'lcal-has-events':''}" data-cal-date="${iso}">
      <div class="lcal-daynum">${d}</div>
      <div class="lcal-events">
        ${shown.map(e=>`<div class="lcal-event lcal-${LEAVE_TYPE_CSS[e.type]||'personal'}" title="${esc(e.name)}">${esc((e.name||'').replace(/^(นาย|นางสาว|นาง)/,''))}${e.pending?' (รอ)':''}</div>`).join('')}
        ${overflow>0?`<div class="lcal-more">+${overflow} เพิ่มเติม</div>`:''}
      </div>
    </div>`;
  }
  const totalCells = firstDay + daysInMonth;
  const trailing = (7-(totalCells%7))%7;
  for(let i=0;i<trailing;i++) cells += `<div class="lcal-cell lcal-muted"></div>`;
  return cells;
}

function leaveCalendarHtml(calState, leaves){
  const map = expandLeaveDates(leaves);
  const monthLabel = THAI_MONTHS_FULL[calState.month] + ' ' + (calState.year+543);
  return `
  <div class="lcal-wrap">
    <div class="lcal-header">
      <button class="btn btn-sm" data-cal-nav="prev">‹ เดือนก่อน</button>
      <div class="lcal-title">${monthLabel}</div>
      <button class="btn btn-sm" data-cal-nav="next">เดือนถัดไป ›</button>
    </div>
    <div class="lcal-grid lcal-grid-head">
      ${['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=>`<div class="lcal-dayname">${d}</div>`).join('')}
    </div>
    <div class="lcal-grid">${buildLeaveCalendarGrid(calState.year, calState.month, map)}</div>
    <div class="lcal-legend">
      <span class="lcal-legend-item"><span class="lcal-dot lcal-sick"></span> ลาป่วย</span>
      <span class="lcal-legend-item"><span class="lcal-dot lcal-vac"></span> ลาพักผ่อน</span>
      <span class="lcal-legend-item"><span class="lcal-dot lcal-personal"></span> ลากิจ</span>
    </div>
  </div>`;
}

function bindLeaveCalendarEvents(container, calState, leaves, rerenderFn){
  container.querySelectorAll('[data-cal-nav]').forEach(b=>b.addEventListener('click', ()=>{
    if(b.dataset.calNav==='prev'){ calState.month--; if(calState.month<0){calState.month=11; calState.year--;} }
    else { calState.month++; if(calState.month>11){calState.month=0; calState.year++;} }
    rerenderFn();
  }));
  const map = expandLeaveDates(leaves);
  container.querySelectorAll('.lcal-cell.lcal-has-events').forEach(cell=>{
    cell.addEventListener('click', ()=>{
      const date = cell.dataset.calDate;
      const events = map[date] || [];
      openModal(`
        <h3>วันลาวันที่ ${buddhistDate(date)}</h3>
        <div class="table-wrap"><table class="reg">
          <thead><tr><th>ชื่อพนักงาน</th><th>ประเภท</th><th>สถานะ</th></tr></thead>
          <tbody>
            ${events.map(e=>`<tr class="row-clickable" data-open-leave="${e.id}"><td>${esc(e.name)}</td><td>${leaveTypeTag(e.type)}</td><td>${e.pending?'<span class="tag tag-amber">รออนุมัติ</span>':'<span class="tag tag-green">อนุมัติแล้ว</span>'}</td></tr>`).join('')}
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
