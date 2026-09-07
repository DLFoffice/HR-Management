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

/* ---------------- Navigation ---------------- */
