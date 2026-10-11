/* ===== leave-dashboard.js =====
   Monthly leave overview shown above the leave calendar (admin "บันทึกวันลา").
   Follows the same month as the calendar (adminLeaveCalState), so moving
   either one moves both. */

let leaveDashFilter = { dept:'', type:'' };
const LD_TYPE = {
  'ป': { cls:'sick',     label:'ลาป่วย' },
  'พ': { cls:'vac',      label:'ลาพักผ่อน' },
  'ก': { cls:'personal', label:'ลากิจ' }
};
const LD_WEEKDAY = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function ldYmd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function ldShortDate(d){ return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`; }
function ldRangeText(s, e){
  if(!e || +s===+e) return `${LD_WEEKDAY[s.getDay()]}. ${ldShortDate(s)}`;
  if(s.getMonth()===e.getMonth()) return `${s.getDate()}–${e.getDate()} ${THAI_MONTHS_SHORT[s.getMonth()]}`;
  return `${ldShortDate(s)} – ${ldShortDate(e)}`;
}

/* All non-rejected leaves overlapping the month, clipped to it, with filters applied */
function leaveMonthData(year, month){
  const mStart = new Date(year, month, 1);
  const mEnd = new Date(year, month+1, 0);
  const nDays = mEnd.getDate();
  const items = [];
  state.leaves.forEach(l=>{
    if((l.approvalStatus||'approved')==='rejected') return;
    const s = parseYMD(l.startDate); if(!s) return;
    let e = parseYMD(l.endDate); if(!e || e < s) e = new Date(s);
    if(e < mStart || s > mEnd) return;
    const emp = employeeById(l.employeeId);
    if(leaveDashFilter.dept && (emp?.department||'')!==leaveDashFilter.dept) return;
    if(leaveDashFilter.type && l.leaveType!==leaveDashFilter.type) return;
    const cs = s < mStart ? mStart : s;
    const ce = e > mEnd ? mEnd : e;
    const wk = workingDaysBetween(ldYmd(cs), ldYmd(ce));
    const days = wk ? wk.work : Math.round((ce - cs)/86400000) + 1;   // working days inside this month
    items.push({ l, emp, s, e, cs, ce, days, from:cs.getDate(), to:ce.getDate(), pending:(l.approvalStatus||'approved')==='pending' });
  });

  // per person
  const people = {};
  items.forEach(it=>{
    const id = it.l.employeeId;
    if(!people[id]) people[id] = { id, emp:it.emp, name:it.l.employeeName || it.emp?.name || '-', items:[], days:0, first:it.cs };
    const p = people[id];
    p.items.push(it); p.days += it.days;
    if(it.cs < p.first) p.first = it.cs;
  });
  const peopleList = Object.values(people).sort((a,b)=> a.first - b.first || a.name.localeCompare(b.name,'th'));

  // per day head-count
  const perDay = new Array(nDays+1).fill(0).map(()=>new Set());
  items.forEach(it=>{ for(let d=it.from; d<=it.to; d++) perDay[d].add(it.l.employeeId); });
  let peak = { day:0, count:0 };
  for(let d=1; d<=nDays; d++){
    if(!isWorkingDay(new Date(year, month, d))) continue;   // peak is about staffing on working days
    if(perDay[d].size > peak.count) peak = { day:d, count:perDay[d].size };
  }

  const byType = { 'ป':{days:0, people:new Set()}, 'พ':{days:0, people:new Set()}, 'ก':{days:0, people:new Set()} };
  items.forEach(it=>{ const t = byType[it.l.leaveType]; if(t){ t.days += it.days; t.people.add(it.l.employeeId); } });

  return { year, month, nDays, mStart, mEnd, items, peopleList, perDay, peak, byType,
           totalDays: items.reduce((s,i)=>s+i.days,0), pending: items.filter(i=>i.pending).length };
}

/* Leaves starting/continuing within the next `span` days, regardless of month */
function upcomingLeaves(span){
  const today = parseYMD(todayStr());
  const until = new Date(today); until.setDate(until.getDate()+span);
  const out = [];
  state.leaves.forEach(l=>{
    if((l.approvalStatus||'approved')==='rejected') return;
    const s = parseYMD(l.startDate); if(!s) return;
    let e = parseYMD(l.endDate); if(!e || e < s) e = new Date(s);
    if(e < today || s > until) return;
    const emp = employeeById(l.employeeId);
    if(leaveDashFilter.dept && (emp?.department||'')!==leaveDashFilter.dept) return;
    out.push({ l, emp, s, e, ongoing: s <= today });
  });
  return out.sort((a,b)=> a.s - b.s);
}

function ldStatHtml(tone, icon, value, label, foot, attrs){
  return `<div class="stat ${tone}"${attrs||''}>${statIc(icon)}<div class="label">${label}</div><div class="value">${value}</div><div class="foot">${foot}</div></div>`;
}

function leaveDashHtml(calState){
  const data = leaveMonthData(calState.year, calState.month);
  const today = parseYMD(todayStr());
  const isThisMonth = today.getFullYear()===calState.year && today.getMonth()===calState.month;
  const onToday = leavesActiveOn(today).filter(l=>!leaveDashFilter.dept || (employeeById(l.employeeId)?.department||'')===leaveDashFilter.dept);
  const pendingAll = state.leaves.filter(l=>(l.approvalStatus||'approved')==='pending').length;
  const depts = [...new Set(state.employees.map(e=>e.department).filter(Boolean))].sort((a,b)=>deptSortKey(a)-deptSortKey(b));
  const monthName = `${THAI_MONTHS_FULL[calState.month]} ${calState.year+543}`;
  const bt = data.byType;

  return `
  <div class="ld-head">
    <div class="ld-month">
      <button class="icon-btn" data-ld-nav="prev" aria-label="เดือนก่อน"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg></button>
      <div><div class="ld-kicker">สรุปการลาประจำเดือน</div><div class="ld-title">${monthName}</div></div>
      <button class="icon-btn" data-ld-nav="next" aria-label="เดือนถัดไป"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg></button>
      ${isThisMonth ? '' : `<button class="btn btn-sm" data-ld-nav="today">กลับมาเดือนนี้</button>`}
    </div>
    <div class="ld-filters">
      <div class="seg" role="group" aria-label="ประเภทการลา">
        ${[['','ทั้งหมด'],['ป','ป่วย'],['พ','พักผ่อน'],['ก','กิจ']].map(([k,t])=>`<button class="${leaveDashFilter.type===k?'on':''}" data-ld-type="${k}">${k?`<i class="lcal-dot lcal-${LD_TYPE[k].cls}"></i>`:''}${t}</button>`).join('')}
      </div>
      <select id="ldDept" aria-label="กลุ่มงาน"><option value="">ทุกกลุ่มงาน</option>${depts.map(d=>`<option ${leaveDashFilter.dept===d?'selected':''}>${esc(d)}</option>`).join('')}</select>
    </div>
  </div>

  <div class="grid grid-4 ld-stats">
    ${ldStatHtml('tone-blue','employees', data.peopleList.length, 'คนที่ลาในเดือนนี้', `${data.items.length} รายการ${data.pending?` · รออนุมัติ ${data.pending}`:''}`)}
    ${ldStatHtml('tone-sky','leaves', data.totalDays, 'วันลารวมของเดือน', `ป่วย ${bt['ป'].days} · พักผ่อน ${bt['พ'].days} · กิจ ${bt['ก'].days}`)}
    ${ldStatHtml('tone-rose','leaves', onToday.length, 'ลาวันนี้', onToday.length ? esc(onToday.slice(0,3).map(l=>(l.employeeName||'').split(/\s+/)[0]).join(', ')) + (onToday.length>3?` และอีก ${onToday.length-3} คน`:'') : 'ทุกคนมาทำงาน')}
    ${ldStatHtml('tone-amber','bell', pendingAll, 'รออนุมัติทั้งหมด', pendingAll ? 'คลิกเพื่อดูรายการ' : 'ไม่มีรายการค้าง', pendingAll ? ' data-ld-pending role="button" tabindex="0"' : '')}
  </div>

  <div class="ld-grid">
    <div class="panel ld-timeline-panel">
      <h2>${panelIc('employees')}ใครลาบ้างในเดือนนี้ <span class="h-count">${data.peopleList.length} คน</span></h2>
      ${leaveTimelineHtml(data, today)}
    </div>
    <div class="ld-side">
      <div class="panel">
        <h2>${panelIc('clock')}กำลังจะลา <span class="h-count">14 วันข้างหน้า</span></h2>
        ${upcomingHtml(upcomingLeaves(14), today)}
      </div>
      <div class="panel">
        <h2>${panelIc('kpi')}สัดส่วนวันลาของเดือน <span class="h-count">วันทำการ</span></h2>
        ${typeBreakdownHtml(data)}
      </div>
      <div class="panel">
        <h2>${panelIc('flag')}วันหยุดราชการเดือนนี้ <span class="h-count">${holidaysInMonth(calState.year, calState.month).length} วัน</span></h2>
        ${holidayListHtml(calState)}
      </div>
    </div>
  </div>`;
}

function leaveTimelineHtml(data, today){
  if(!data.peopleList.length){
    return `<div class="ld-empty"><div class="ld-empty-ic">${navIconSvg('leaves').replace('<svg','<svg stroke="currentColor"')}</div>
      <b>ไม่มีใครลาในเดือนนี้</b><span>ทุกคนมาทำงานครบ${leaveDashFilter.type||leaveDashFilter.dept ? ' (ตามตัวกรองที่เลือก)' : ''}</span></div>`;
  }
  const n = data.nDays;
  const todayDay = (today.getFullYear()===data.year && today.getMonth()===data.month) ? today.getDate() : 0;
  const dayMeta = [];
  for(let d=1; d<=n; d++){
    const wd = new Date(data.year, data.month, d).getDay();
    const hol = holidayName(`${data.year}-${String(data.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    dayMeta.push({ d, wd, weekend: wd===0 || wd===6, hol, off: wd===0 || wd===6 || !!hol });
  }
  const cols = `style="--n:${n}"`;
  const head = `<div class="tl-row tl-head" ${cols}>
    <div class="tl-name">พนักงาน</div>
    ${dayMeta.map(m=>`<div class="tl-day${m.weekend?' we':''}${m.hol?' hol':''}${m.d===todayDay?' today':''}"${m.hol?` title="${esc(m.hol)}"`:''}><small>${LD_WEEKDAY[m.wd]}</small>${m.d}</div>`).join('')}
  </div>`;
  const load = `<div class="tl-row tl-load" ${cols}>
    <div class="tl-name"><small>จำนวนคนลา</small></div>
    ${dayMeta.map(m=>{ const c = m.off ? 0 : data.perDay[m.d].size; return `<div class="tl-load-cell${m.weekend?' we':''}${m.hol?' hol':''}" title="${m.d} ${THAI_MONTHS_SHORT[data.month]}: ${c} คน">${c?`<span class="lv lv${Math.min(c,4)}">${c}</span>`:''}</div>`; }).join('')}
  </div>`;
  const rows = data.peopleList.map(p=>{
    const types = [...new Set(p.items.map(i=>i.l.leaveType))];
    return `<div class="tl-row" ${cols}>
      <button class="tl-name tl-person" data-ld-emp="${p.id}" title="ดูข้อมูลพนักงาน">
        ${avatarHtml(p.emp || {name:p.name}, 30)}
        <span class="tl-person-text"><b>${esc(p.name)}</b><small>${types.map(t=>LD_TYPE[t]?.label||t).join(' · ')} · ${p.days} วัน</small></span>
      </button>
      ${dayMeta.map(m=>`<div class="tl-cell${m.weekend?' we':''}${m.hol?' hol':''}${m.d===todayDay?' today':''}" style="grid-column:${m.d+1}"></div>`).join('')}
      ${p.items.map(it=>`<button class="tl-bar t-${LD_TYPE[it.l.leaveType]?.cls||'vac'}${it.pending?' pending':''}${it.s<data.mStart?' cut-l':''}${it.e>data.mEnd?' cut-r':''}"
          style="grid-column:${it.from+1} / ${it.to+2}" data-ld-leave="${it.l.id}"
          title="${esc(LD_TYPE[it.l.leaveType]?.label||'ลา')} ${esc(ldRangeText(it.s, it.e))} (${safeNum(it.l.days)} วัน)${it.pending?' · รออนุมัติ':''}${it.l.reason?' · '+esc(it.l.reason):''}">
          <span>${it.days>=2 ? `${it.days} วัน` : ''}</span></button>`).join('')}
    </div>`;
  }).join('');
  return `<div class="tl-scroll"><div class="tl" style="--n:${n}">${head}${rows}${load}</div></div>
    <div class="tl-legend">
      <span><i class="tl-key t-sick"></i>ลาป่วย</span><span><i class="tl-key t-vac"></i>ลาพักผ่อน</span><span><i class="tl-key t-personal"></i>ลากิจ</span>
      <span><i class="tl-key t-vac pending"></i>รออนุมัติ</span><span><i class="tl-key we"></i>เสาร์–อาทิตย์</span><span><i class="tl-key hol"></i>วันหยุดราชการ</span>
      ${data.peak.count ? `<span class="tl-peak">วันที่ลาพร้อมกันมากที่สุด: <b>${LD_WEEKDAY[new Date(data.year,data.month,data.peak.day).getDay()]}. ${data.peak.day} ${THAI_MONTHS_SHORT[data.month]}</b> (${data.peak.count} คน)</span>` : ''}
    </div>`;
}

function upcomingHtml(list, today){
  if(!list.length) return `<div class="empty-note">ไม่มีใครลาในอีก 14 วันข้างหน้า</div>`;
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const label = (it)=>{
    if(it.ongoing) return '<span class="up-when now">กำลังลา</span>';
    if(+it.s===+tomorrow) return '<span class="up-when soon">พรุ่งนี้</span>';
    const diff = Math.round((it.s - today)/86400000);
    return `<span class="up-when">อีก ${diff} วัน</span>`;
  };
  return `<div class="up-list">${list.slice(0,8).map(it=>`
    <button class="up-item" data-ld-leave="${it.l.id}">
      <span class="up-date"><b>${it.s.getDate()}</b><small>${THAI_MONTHS_SHORT[it.s.getMonth()]}</small></span>
      <span class="up-text"><b>${esc(it.l.employeeName||'')}</b><small><i class="lcal-dot lcal-${LD_TYPE[it.l.leaveType]?.cls||'vac'}"></i>${esc(LD_TYPE[it.l.leaveType]?.label||'ลา')} · ${esc(ldRangeText(it.s,it.e))}${(it.l.approvalStatus||'approved')==='pending'?' · รออนุมัติ':''}</small></span>
      ${label(it)}
    </button>`).join('')}</div>
    ${list.length>8 ? `<div class="up-more">และอีก ${list.length-8} รายการ</div>` : ''}`;
}

function typeBreakdownHtml(data){
  const total = data.totalDays;
  if(!total) return `<div class="empty-note">ยังไม่มีวันลาในเดือนนี้</div>`;
  const rows = ['ป','พ','ก'].map(k=>({ k, ...data.byType[k], pct: data.byType[k].days/total*100 }));
  return `<div class="tb-bar">${rows.filter(r=>r.days).map(r=>`<span class="t-${LD_TYPE[r.k].cls}" style="width:${r.pct.toFixed(2)}%" title="${LD_TYPE[r.k].label} ${r.days} วัน"></span>`).join('')}</div>
    <div class="tb-rows">${rows.map(r=>`
      <div class="tb-row"><span class="tb-label"><i class="lcal-dot lcal-${LD_TYPE[r.k].cls}"></i>${LD_TYPE[r.k].label}</span>
        <span class="tb-num"><b>${r.days}</b> วัน</span><span class="tb-sub">${r.people.size} คน · ${Math.round(r.pct)}%</span></div>`).join('')}
    </div>`;
}

function holidayListHtml(calState){
  const list = holidaysInMonth(calState.year, calState.month);
  const workDays = (()=>{ let n=0; const m=new Date(calState.year, calState.month+1, 0).getDate(); for(let d=1; d<=m; d++) if(isWorkingDay(new Date(calState.year, calState.month, d))) n++; return n; })();
  const src = holidayState.source==='google' ? 'จาก Google Calendar' : 'จากรายการสำรองในระบบ';
  return `${list.length ? `<div class="hol-list">${list.map(h=>{ const d = new Date(calState.year, calState.month, h.day); return `
    <div class="hol-item${h.date < todayStr() ? ' past' : ''}">
      <span class="hol-date"><b>${h.day}</b><small>${LD_WEEKDAY[d.getDay()]}.</small></span>
      <span class="hol-name">${esc(h.name)}${h.weekend?'<small>ตรงกับวันหยุดสุดสัปดาห์</small>':''}</span>
    </div>`; }).join('')}</div>` : `<div class="empty-note">ไม่มีวันหยุดราชการในเดือนนี้</div>`}
    <div class="hol-foot">เดือนนี้มี <b>${workDays}</b> วันทำการ · ข้อมูลวันหยุด${src}</div>`;
}

function refreshLeaveDash(){
  const box = document.getElementById('leaveDash');
  if(!box) return;
  box.innerHTML = leaveDashHtml(adminLeaveCalState);
  bindLeaveDash();
}
function bindLeaveDash(){
  const box = document.getElementById('leaveDash');
  if(!box) return;
  box.querySelectorAll('[data-ld-nav]').forEach(b=>b.addEventListener('click', ()=>{
    const s = adminLeaveCalState, k = b.dataset.ldNav;
    if(k==='prev'){ s.month--; if(s.month<0){ s.month=11; s.year--; } }
    else if(k==='next'){ s.month++; if(s.month>11){ s.month=0; s.year++; } }
    else { const t = new Date(); s.year=t.getFullYear(); s.month=t.getMonth(); }
    refreshAdminLeaveCalendar();
  }));
  box.querySelectorAll('[data-ld-type]').forEach(b=>b.addEventListener('click', ()=>{ leaveDashFilter.type = b.dataset.ldType; refreshLeaveDash(); }));
  box.querySelector('#ldDept')?.addEventListener('change', e=>{ leaveDashFilter.dept = e.target.value; refreshLeaveDash(); });
  box.querySelectorAll('[data-ld-leave]').forEach(b=>b.addEventListener('click', ()=>openLeaveDetailModal(b.dataset.ldLeave)));
  box.querySelectorAll('[data-ld-emp]').forEach(b=>b.addEventListener('click', ()=>openEmployeeDetailModal(b.dataset.ldEmp)));
  const pend = box.querySelector('[data-ld-pending]');
  if(pend){
    const go = ()=>{
      const sel = document.getElementById('leaveStatusFilter');
      if(sel){ sel.value = 'pending'; renderLeaveTable(); }
      document.getElementById('leaveTable')?.closest('.panel')?.scrollIntoView({behavior: prefersReducedMotion()?'auto':'smooth', block:'start'});
    };
    pend.addEventListener('click', go);
    pend.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); go(); } });
  }
  // keep today's column in view on narrow screens
  const sc = box.querySelector('.tl-scroll'), td = box.querySelector('.tl-head .today');
  if(sc && td && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, td.offsetLeft - sc.clientWidth/2);
}
