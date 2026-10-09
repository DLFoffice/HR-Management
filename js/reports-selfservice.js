/* ===== reports-selfservice.js ===== */
/* ================= REPORTS ================= */
function computeEmployeeSummary(empId, fyBE){
  const emp = employeeById(empId);
  if(!emp) return null;
  fyBE = Number(fyBE) || fiscalYearBE();
  const fy = fiscalRangeOfBE(fyBE);
  fy.be = fyBE;
  const leaves = state.leaves.filter(l=>l.employeeId===empId && l.startDate && inRange(l.startDate, fy.start, fy.end) && isApproved(l));
  const used = {'ป':0,'พ':0,'ก':0};
  leaves.forEach(l=>{ if(used[l.leaveType]!==undefined) used[l.leaveType]+=safeNum(l.days); });
  const vac = vacationBalance(emp, fyBE);
  const leaveSummary = [
    {key:'ป', label:'ลาป่วย', right:safeNum(emp.sickRight), carry:safeNum(emp.carrySick), used:used['ป']},
    {key:'พ', label:'ลาพักผ่อน', right:vac.right, carry:vac.carry, used:vac.used, auto:vac.auto, note:vacationCarryNote(vac), vacation:vac},
    {key:'ก', label:'ลากิจ', right:safeNum(emp.personalRight), carry:safeNum(emp.carryPersonal), used:used['ก']}
  ].map(r=>({...r, total:roundDays(r.right+r.carry), remaining:roundDays(r.right+r.carry-r.used)}));

  const loans = state.loans.filter(l=>l.employeeId===empId && isApproved(l));
  const loanSummary = LOAN_TYPES.map(type=>{
    const active = loans.filter(l=>l.loanType===type && (l.status||'active')==='active');
    const current = active.reduce((s,l)=>s+loanRemaining(l),0);
    const limit = type==='เงินกู้สามัญ' ? safeNum(emp.loanNormalLimit) : safeNum(emp.loanEmergencyLimit);
    return {label:type, limit, current};
  });

  const welfare = state.welfare.filter(w=>w.employeeId===empId && w.submitDate && inRange(w.submitDate, fy.start, fy.end) && isApproved(w));
  const welfareSummary = WELFARE_CATS.map(c=>{
    const usedAmt = welfare.filter(w=>w.category===c.label).reduce((s,w)=>s+Number(w.approvedAmount||0),0);
    const limit = safeNum(emp[c.limitField]);
    return {label:c.label, limit, used:usedAmt, remaining: Math.max(limit-usedAmt,0)};
  });

  return {emp, leaveSummary, loanSummary, welfareSummary, fy, vacation:vac};
}

function viewReports(){
  return `
  <div class="page-header">
    <div><h1>รายงาน</h1><div class="sub">ดูสรุปรายบุคคลหรือรายงานภาพรวม แล้วสั่งพิมพ์เป็น PDF ได้ทันที</div></div>
  </div>
  <div class="pill-nav">
    <button data-report="individual" class="active">สรุปรายบุคคล</button>
    <button data-report="overall">สรุปภาพรวมทุกคน</button>
    <button data-report="vacation">วันลาพักผ่อนสะสม</button>
  </div>
  <div id="reportBody"></div>
  `;
}

let reportSelectedEmpIds = new Set();

function reportEmpFiltered(){
  const q = (document.getElementById('reportEmpSearch')?.value||'').trim().toLowerCase();
  if(!q) return state.employees;
  return state.employees.filter(e=> [e.code,e.name,e.position].some(v=>String(v||'').toLowerCase().includes(q)));
}

function renderReportEmpGroups(){
  const root = document.getElementById('reportEmpGroups');
  if(!root) return;
  const groups = groupEmployeesByDept(reportEmpFiltered());
  root.innerHTML = groups.length ? groups.map(g=>{
    const allSelected = g.list.length>0 && g.list.every(e=>reportSelectedEmpIds.has(e.id));
    return `
    <div class="report-emp-dept">
      <div class="report-emp-dept-head">
        <span>${esc(g.dept)} <span class="muted">(${g.list.length} คน)</span></span>
        <button class="btn btn-sm" data-dept-select="${esc(g.dept)}">${allSelected?'ยกเลิกทั้งแผนก':'เลือกทั้งแผนก'}</button>
      </div>
      <div class="report-emp-list">
        ${g.list.map(e=>`
          <label class="report-emp-row">
            <input type="checkbox" data-emp-check="${e.id}" ${reportSelectedEmpIds.has(e.id)?'checked':''}>
            ${avatarHtml(e,26)}
            <span class="report-emp-name">${esc(e.name)}</span>
            <span class="muted report-emp-pos">${esc(e.position)}</span>
          </label>`).join('')}
      </div>
    </div>`;
  }).join('') : '<div class="muted" style="padding:14px;">ไม่พบพนักงานที่ตรงกับคำค้นหา</div>';

  root.querySelectorAll('[data-emp-check]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked) reportSelectedEmpIds.add(cb.dataset.empCheck);
      else reportSelectedEmpIds.delete(cb.dataset.empCheck);
      updateReportSelectionUI();
    });
  });
  root.querySelectorAll('[data-dept-select]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const g = groups.find(x=>x.dept===b.dataset.deptSelect);
      if(!g) return;
      const allSelected = g.list.every(e=>reportSelectedEmpIds.has(e.id));
      g.list.forEach(e=> allSelected ? reportSelectedEmpIds.delete(e.id) : reportSelectedEmpIds.add(e.id));
      renderReportEmpGroups();
      updateReportSelectionUI();
    });
  });
}

function updateReportSelectionUI(){
  const countEl = document.getElementById('reportEmpSelectedCount');
  if(countEl) countEl.textContent = `เลือกแล้ว ${reportSelectedEmpIds.size} คน`;
  const printBtn = document.getElementById('btnPrintIndividual');
  if(printBtn) printBtn.disabled = reportSelectedEmpIds.size===0;
  const preview = document.getElementById('individualPreview');
  if(preview){
    const summaries = [...reportSelectedEmpIds].map(id=>computeEmployeeSummary(id)).filter(Boolean);
    preview.innerHTML = summaries.map(s=>`<div class="panel" style="margin-top:16px;">${individualReportHtml(s)}</div>`).join('');
  }
}

function renderReportIndividual(){
  reportSelectedEmpIds = new Set();
  const body = document.getElementById('reportBody');
  body.innerHTML = `
  <div class="panel">
    <div class="searchbar">
      <input type="text" id="reportEmpSearch" placeholder="ค้นหาชื่อ / รหัส / ตำแหน่ง" style="flex:1;">
      <span class="muted" id="reportEmpSelectedCount" style="white-space:nowrap; align-self:center;">เลือกแล้ว 0 คน</span>
      <button class="btn btn-sm" id="btnReportClearAll">ล้างการเลือก</button>
      <button class="btn btn-gold" id="btnPrintIndividual" disabled>พิมพ์ / บันทึก PDF</button>
    </div>
    <div id="reportEmpGroups" class="report-emp-groups"></div>
  </div>
  <div id="individualPreview"></div>`;
  renderReportEmpGroups();
  document.getElementById('reportEmpSearch').addEventListener('input', renderReportEmpGroups);
  document.getElementById('btnReportClearAll').addEventListener('click', ()=>{
    reportSelectedEmpIds.clear();
    renderReportEmpGroups();
    updateReportSelectionUI();
  });
  document.getElementById('btnPrintIndividual').addEventListener('click', ()=>{
    const summaries = [...reportSelectedEmpIds].map(id=>computeEmployeeSummary(id)).filter(Boolean);
    if(!summaries.length) return;
    const html = summaries.map((s,i)=> `<div${i<summaries.length-1?' style="page-break-after:always;"':''}>${individualReportHtml(s, true)}</div>`).join('');
    printDocument(html, {title: summaries.length>1 ? `รายงานสรุปรายบุคคล (${summaries.length} คน)` : 'รายงานสรุปรายบุคคล'});
  });
}

/* Ring-style balance cards for the on-screen report / employee home */
function leaveBalanceCardsHtml(s){
  const tone = {'ป':'rose','พ':'accent','ก':'amber'};
  return `<div class="balance-cards">${s.leaveSummary.map(r=>{
    const pct = r.total>0 ? Math.max(0, Math.min(100, (r.remaining/r.total)*100)) : 0;
    return `<div class="balance-card tone-${tone[r.key]||'accent'}">
      <div class="ring" style="--p:${pct.toFixed(1)};"><div class="ring-inner"><b>${r.remaining}</b><span>คงเหลือ</span></div></div>
      <div class="balance-meta">
        <div class="balance-title">${r.label}</div>
        <div class="balance-line"><span>สิทธิ์ปีนี้</span><b>${r.right}</b></div>
        <div class="balance-line"><span>สะสมยกมา</span><b>${r.carry}</b></div>
        <div class="balance-line"><span>ใช้ไปแล้ว</span><b>${r.used}</b></div>
        ${r.auto ? `<div class="balance-chip" title="${esc(r.note)}">ยกยอดจากปีงบ ${r.vacation.prev ? r.vacation.prev.fy : s.fy.be-1}</div>` : ''}
      </div>
    </div>`;}).join('')}</div>`;
}

function individualReportHtml(s, forPrint, skipHeader){
  const e = s.emp;
  return `
  ${skipHeader ? '' : `
  <div class="doc-header">
    ${state.settings.logoUrl? `<img src="${esc(state.settings.logoUrl)}" style="height:44px; object-fit:contain; margin-bottom:8px;">` : ''}
    <div class="org">รายงานสรุปข้อมูลบุคลากรรายบุคคล</div>
    <div class="title" style="display:flex; align-items:center; justify-content:center; gap:10px;">${avatarHtml(e,36)}${esc(e.name)}</div>
  </div>`}
  <div class="doc-meta">
    <div><span class="k">รหัสพนักงาน: </span>${esc(e.code)}</div>
    <div><span class="k">วันเข้าทำงาน: </span>${buddhistDate(e.hireDate)}</div>
    <div><span class="k">ตำแหน่ง: </span>${esc(e.position)}</div>
    <div><span class="k">อายุงานปัจจุบัน: </span>${ageFromDate(e.hireDate)}</div>
    <div><span class="k">กลุ่มงาน: </span>${esc(e.department)}</div>
    <div><span class="k">วันเกิด: </span>${buddhistDate(e.birthDate)}</div>
    <div></div>
    <div><span class="k">วันเกษียณอายุ: </span>${buddhistDate(e.retireDate)}</div>
  </div>

  <div class="doc-section-title">สรุปวันลา ปีงบประมาณ ${s.fy.be}</div>
  ${forPrint ? '' : leaveBalanceCardsHtml(s)}
  <table class="reg${forPrint?'':' compact-table'}"><thead><tr><th>หมวดวันลา</th><th class="num">สิทธิ์ปีนี้</th><th class="num">สะสมยกมา</th><th class="num">รวมสิทธิ์</th><th class="num">ใช้ไปแล้ว</th><th class="num">คงเหลือ</th></tr></thead>
  <tbody>${s.leaveSummary.map(r=>`<tr><td>${r.label}${r.auto?' <span class="tag tag-navy" title="คำนวณอัตโนมัติจากยอดคงเหลือปีที่แล้ว">ยกยอดอัตโนมัติ</span>':''}</td><td class="num">${r.right}</td><td class="num">${r.carry}</td><td class="num">${r.total}</td><td class="num">${r.used}</td><td class="num"><b>${r.remaining}</b></td></tr>`).join('')}</tbody></table>
  ${(()=>{ const v=s.leaveSummary.find(r=>r.key==='พ'); return v && v.auto ? `<div class="carry-note">↳ ลาพักผ่อนสะสมยกมา ${v.carry} วัน — ${esc(v.note)}</div>` : ''; })()}

  <div class="doc-section-title">สรุปเงินกู้</div>
  <table class="reg"><thead><tr><th>หมวดเงินกู้</th><th class="num">วงเงินสิทธิ์สูงสุด</th><th class="num">ยอดคงค้างปัจจุบัน</th></tr></thead>
  <tbody>${s.loanSummary.map(r=>`<tr><td>${r.label}</td><td class="num">${money(r.limit)}</td><td class="num">${money(r.current)}</td></tr>`).join('')}</tbody></table>

  <div class="doc-section-title">สรุปสวัสดิการและประกันสังคม (ปีงบประมาณนี้)</div>
  <table class="reg"><thead><tr><th>รายการ</th><th class="num">วงเงินสิทธิ์</th><th class="num">เบิกใช้ไปแล้ว</th><th class="num">คงเหลือ</th></tr></thead>
  <tbody>${s.welfareSummary.map(r=>`<tr><td>${r.label}</td><td class="num">${money(r.limit)}</td><td class="num">${money(r.used)}</td><td class="num">${money(r.remaining)}</td></tr>`).join('')}</tbody></table>

  `;
}

/* ---------- Vacation carry-over report (all employees, chosen FY) ---------- */
let vacationReportFY = null;
function vacationReportRows(fyBE){
  const q = (document.getElementById('vacReportSearch')?.value||'').trim().toLowerCase();
  return groupEmployeesByDept(state.employees).flatMap(g=>g.list)
    .filter(e=>!q || [e.code,e.name,e.position,e.department].some(v=>String(v||'').toLowerCase().includes(q)))
    .map(e=>({ e, v: vacationBalance(e, fyBE) }));
}
function vacationReportTableHtml(rows, fyBE, forPrint){
  return `
  ${forPrint? `<div class="doc-header">${state.settings.logoUrl? `<img src="${esc(state.settings.logoUrl)}" style="height:44px; object-fit:contain; margin-bottom:8px;">` : ''}<div class="org">รายงานวันลาพักผ่อนสะสม</div><div class="title">ปีงบประมาณ ${fyBE}</div></div>` : ''}
  <table class="reg"><thead><tr>
    <th class="rownum">#</th><th>ชื่อ-นามสกุล</th><th>กลุ่มงาน</th>
    <th class="num">คงเหลือปีงบ ${fyBE-1}</th><th class="num">สะสมยกมา</th><th class="num">สิทธิ์ปีนี้</th><th class="num">รวมสิทธิ์</th><th class="num">ใช้ไป</th><th class="num">คงเหลือ</th>
  </tr></thead>
  <tbody>${rows.length ? rows.map((r,i)=>{
    const prev = r.v.prev;
    return `<tr${forPrint?'':` class="row-clickable" data-vac-emp="${r.e.id}"`}>
      <td class="rownum">${i+1}</td>
      <td>${forPrint?'':avatarHtml(r.e,24)+' '}<span${forPrint?'':' style="margin-left:6px;"'}>${esc(r.e.name)}</span></td>
      <td class="muted">${esc(r.e.department||'')}</td>
      <td class="num">${prev ? prev.remaining : '-'}</td>
      <td class="num">${r.v.carry}${prev && prev.lost>0 ? ` <span class="tag tag-amber" title="เกินเพดาน">−${prev.lost}</span>`:''}</td>
      <td class="num">${r.v.right}</td>
      <td class="num">${r.v.total}</td>
      <td class="num">${r.v.used}</td>
      <td class="num"><b class="${r.v.remaining<0?'neg':''}">${r.v.remaining}</b></td>
    </tr>`;}).join('') : `<tr class="empty-row"><td colspan="9">ไม่พบข้อมูลพนักงาน</td></tr>`}</tbody></table>`;
}
function vacationPolicyText(){
  const p = vacationPolicy();
  if(!p.enabled) return 'ปิดการยกยอดอัตโนมัติ — ใช้ค่าสะสมยกมาที่กรอกไว้';
  const cap = p.capMode==='fixed' ? `ยกยอดได้ไม่เกิน ${p.capDays} วัน`
    : p.capMode==='gov' ? `สิทธิ์ปีนี้ + สะสม รวมไม่เกิน ${p.govTotal} วัน (อายุงาน ${p.govSeniorYears} ปีขึ้นไป ไม่เกิน ${p.govTotalSenior} วัน)`
    : 'ยกยอดคงเหลือทั้งหมด ไม่จำกัดเพดาน';
  return `ปีงบฐาน ${p.baseFY} · ${cap}`;
}
function renderReportVacation(){
  const body = document.getElementById('reportBody');
  const cur = fiscalYearBE();
  if(!vacationReportFY) vacationReportFY = cur;
  const p = vacationPolicy();
  const years = []; for(let y = Math.min(p.baseFY, cur-1); y <= cur+1; y++) years.push(y);
  body.innerHTML = `
  <div class="panel">
    <div class="searchbar">
      <select id="vacReportFY">${years.map(y=>`<option value="${y}" ${y===vacationReportFY?'selected':''}>ปีงบประมาณ ${y}${y===cur?' (ปัจจุบัน)':''}</option>`).join('')}</select>
      <input type="text" id="vacReportSearch" placeholder="ค้นหาชื่อ / รหัส / กลุ่มงาน">
      <button class="btn btn-gold" id="btnPrintVacation">พิมพ์ / บันทึก PDF</button>
    </div>
    <div class="policy-strip"><span class="policy-dot"></span>${esc(vacationPolicyText())}<span class="muted"> · คลิกที่รายชื่อเพื่อดูที่มาของยอดสะสมย้อนหลัง</span></div>
    <div class="table-wrap" id="vacReportWrap"></div>
  </div>`;
  const draw = ()=>{
    const rows = vacationReportRows(vacationReportFY);
    document.getElementById('vacReportWrap').innerHTML = vacationReportTableHtml(rows, vacationReportFY);
    document.querySelectorAll('[data-vac-emp]').forEach(tr=>tr.addEventListener('click', ()=>openVacationHistoryModal(tr.dataset.vacEmp, vacationReportFY)));
  };
  document.getElementById('vacReportFY').addEventListener('change', e=>{ vacationReportFY = Number(e.target.value); draw(); });
  document.getElementById('vacReportSearch').addEventListener('input', draw);
  document.getElementById('btnPrintVacation').addEventListener('click', ()=>{
    printDocument(vacationReportTableHtml(vacationReportRows(vacationReportFY), vacationReportFY, true), {title:'รายงานวันลาพักผ่อนสะสม ปีงบประมาณ '+vacationReportFY});
  });
  draw();
}
function openVacationHistoryModal(empId, fyBE){
  const emp = employeeById(empId); if(!emp) return;
  const v = vacationBalance(emp, fyBE);
  const rows = [...v.history, { fy:v.fy, right:v.right, carry:v.carry, used:v.used, remaining:v.remaining, current:true }];
  openModal(`
    <div class="modal-head-person">${avatarHtml(emp,48)}<div><h3>${esc(emp.name)}</h3><div class="muted">ที่มาของยอดวันลาพักผ่อนสะสม</div></div></div>
    <div class="table-wrap"><table class="reg">
      <thead><tr><th>ปีงบประมาณ</th><th class="num">สะสมยกมา</th><th class="num">สิทธิ์</th><th class="num">ใช้ไป</th><th class="num">คงเหลือ</th><th class="num">ยกไปปีถัดไป</th></tr></thead>
      <tbody>${rows.map(r=>`<tr${r.current?' class="row-current"':''}><td>${r.fy}${r.current?' <span class="tag tag-navy">ปีที่เลือก</span>':''}</td><td class="num">${r.carry}</td><td class="num">${r.right}</td><td class="num">${r.used}</td><td class="num"><b>${r.remaining}</b></td><td class="num">${r.current?'-':r.carriedOut+(r.lost>0?` <span class="tag tag-amber">ตัด ${r.lost}</span>`:'')}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="muted" style="font-size:12.5px; margin-top:10px;">${v.auto ? 'ยอดตั้งต้น ณ ปีงบฐาน มาจากช่อง "ลาพักผ่อนสะสมยกมา" ในข้อมูลพนักงาน · นับเฉพาะใบลาที่อนุมัติแล้ว' : 'ปีนี้ใช้ยอดสะสมยกมาตามที่บันทึกไว้ในข้อมูลพนักงาน'}</div>
    <div class="modal-actions"><button class="btn" id="btnCancelModal">ปิด</button></div>
  `, 720);
}

function renderReportOverall(){
  const body = document.getElementById('reportBody');
  const fy = fiscalYearRange();
  const rows = state.employees.map(e=>{
    const s = computeEmployeeSummary(e.id);
    const totalUsed = s.leaveSummary.reduce((a,r)=>a+r.used,0);
    const totalRemaining = s.leaveSummary.reduce((a,r)=>a+r.remaining,0);
    const loanCurrent = s.loanSummary.reduce((a,r)=>a+r.current,0);
    const welfareUsed = s.welfareSummary.reduce((a,r)=>a+r.used,0);
    return {e, totalUsed, totalRemaining, loanCurrent, welfareUsed};
  });
  body.innerHTML = `
  <div class="panel">
    <div class="searchbar"><div class="muted" style="flex:1; font-size:13.5px;">ปีงบประมาณ ${fy.start.getFullYear()+543}-${fy.end.getFullYear()+543}</div>
      <button class="btn btn-gold" id="btnPrintOverall">พิมพ์ / บันทึก PDF</button>
    </div>
    <div class="table-wrap" id="overallTableWrap">${overallReportHtml(rows, fy)}</div>
  </div>`;
  document.getElementById('btnPrintOverall').addEventListener('click', ()=> printDocument(overallReportHtml(rows, fy, true), {title: 'รายงานสรุปภาพรวมพนักงาน'}));
}

function overallReportHtml(rows, fy, forPrint){
  return `
  ${forPrint? `<div class="doc-header">${state.settings.logoUrl? `<img src="${esc(state.settings.logoUrl)}" style="height:44px; object-fit:contain; margin-bottom:8px;">` : ''}<div class="org">รายงานสรุปภาพรวมบุคลากร</div><div class="title">ปีงบประมาณ ${fy.start.getFullYear()+543}-${fy.end.getFullYear()+543}</div></div>` : ''}
  <table class="reg"><thead><tr>
    <th class="rownum">#</th><th>ชื่อ-นามสกุล</th><th>กลุ่มงาน</th>
    <th class="num">วันลาใช้ไป</th><th class="num">วันลาคงเหลือ</th><th class="num">เงินกู้คงค้าง</th><th class="num">สวัสดิการที่เบิกแล้ว</th>
  </tr></thead>
  <tbody>${rows.length? rows.map((r,i)=>`
    <tr><td class="rownum">${i+1}</td><td>${esc(r.e.name)}</td><td>${esc(r.e.department)}</td>
    <td class="num">${r.totalUsed}</td><td class="num">${r.totalRemaining}</td><td class="num">${money(r.loanCurrent)}</td><td class="num">${money(r.welfareUsed)}</td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="7">ยังไม่มีข้อมูลพนักงาน</td></tr>'}</tbody></table>

  `;
}

/* ================= PRINT ENGINE ==================
   Opens a dedicated preview window instead of printing the current page —
   gives a clean isolated layout with a repeating page header (via a real
   <thead>, which browsers repeat automatically on every printed page),
   a visible "print / save as PDF" toolbar, and a live on-screen paper
   preview. Avoids fighting the app's own CSS/sidebar during print. */
const PRINT_DOC_CSS = `
:root{
  --ink:#1A1F1D; --ink-soft:#4E5753; --ink-faint:#8A938F;
  --rule:#C9CFCC; --rule-soft:#E2E6E4; --tint:#F3F6F5;
  --accent:#17735F; --accent-soft:#E6F2EE;
  --green:#1F8A5B; --green-bg:#E2F4EA; --red:#C9424F; --red-bg:#FBE6E8;
  --amber:#B97A12; --amber-bg:#FBF0D9;
  /* legacy names used by report markup */
  --lav:var(--accent); --lav-2:var(--accent); --lav-deep:var(--accent); --lav-bg:var(--accent-soft);
  --line:var(--rule-soft); --line-strong:var(--rule);
}
/* ---------- report tables ---------- */
table.reg{width:100%; border-collapse:collapse; font-size:13.5px; margin:4px 0 6px;}
table.reg th{ text-align:left; font-weight:600; color:var(--ink); padding:7px 10px; background:var(--tint);
  border-top:1px solid var(--rule); border-bottom:1px solid var(--rule); white-space:nowrap; }
table.reg td{ padding:6px 10px; border-bottom:1px solid var(--rule-soft); vertical-align:middle; }
table.reg tbody tr:last-child td{border-bottom:1px solid var(--rule);}
table.reg th.num, table.reg td.num{font-variant-numeric:tabular-nums; text-align:right;}
table.reg th.rownum, table.reg td.rownum{color:var(--ink-faint); width:30px; text-align:left;}
.tag{display:inline-block; padding:0 8px; border-radius:20px; font-size:11.5px; font-weight:600; line-height:1.7;}
.tag-green{background:var(--green-bg); color:var(--green);}
.tag-red{background:var(--red-bg); color:var(--red);}
.tag-amber{background:var(--amber-bg); color:var(--amber);}
.tag-navy{background:var(--accent-soft); color:var(--accent);}
.neg{color:var(--red);}
.muted{color:var(--ink-soft);}
.carry-note{font-size:12.5px; color:var(--ink-soft); margin:4px 0 0;}
.doc-header{text-align:center; margin:2px 0 16px;}
.doc-header img{display:none;}
.doc-header .org{font-size:13.5px; color:var(--ink-soft);}
.doc-header .title{font-size:19px; font-weight:700; color:var(--ink); margin-top:2px;}
.doc-meta{display:grid; grid-template-columns:1fr 1fr; gap:3px 28px; font-size:14px; margin-bottom:12px;
  padding:10px 14px; border:1px solid var(--rule-soft); border-radius:6px;}
.doc-meta div span.k{color:var(--ink-soft);}
.doc-section-title{font-size:15px; font-weight:700; color:var(--ink); margin:18px 0 6px; padding-left:9px; border-left:3px solid var(--accent); line-height:1.3;}
.avatar-thumb{display:none !important;}

/* ---------- official leave form (แบบฟอร์มราชการ) ---------- */
.lf{ font-size:15px; line-height:1.95; color:var(--ink); }
.lf-head{ text-align:center; margin-bottom:6px; }
.lf-head img{ height:62px; width:auto; object-fit:contain; display:block; margin:0 auto 4px; }
.lf-title{ font-size:20px; font-weight:700; letter-spacing:.2px; line-height:1.4; }
.lf-org{ font-size:14px; color:var(--ink-soft); line-height:1.4; }
.lf-place{ text-align:right; margin-top:10px; }
.lf-place > div{ display:inline-block; text-align:left; }
.lf-row{ margin:0; }
.lf-indent{ text-indent:2.5em; }
.lf-label{ display:inline-block; min-width:3.2em; font-weight:700; }
.f{ display:inline-block; min-width:var(--w,4em); padding:0 .35em; text-align:center; line-height:1.35;
  border-bottom:1px dotted #6B7470; font-weight:500; color:#0F2A6B; text-indent:0; }
.f.l{ text-align:left; }
.f.grow{ min-width:0; flex:1; }
.lf-line{ display:flex; align-items:baseline; gap:.4em; }
.cb{ display:inline-block; width:.9em; height:.9em; border:1.2px solid var(--ink); border-radius:2px;
  vertical-align:-.08em; margin-right:.3em; position:relative; }
.cb.on::after{ content:''; position:absolute; left:.26em; top:.02em; width:.26em; height:.52em;
  border:solid #0F2A6B; border-width:0 .14em .14em 0; transform:rotate(45deg); }
.lf-opts{ display:inline; }
.opt{ display:inline-block; white-space:nowrap; margin-right:1.3em; }
.opt, .f, .sig, .cb{ text-indent:0; }
.lf-sign{ display:flex; justify-content:flex-end; margin-top:10px; }
.lf-sign > div{ text-align:center; line-height:2.1; }
.sig{ display:inline-grid; grid-template-columns:auto auto; column-gap:.4em; align-items:end; text-align:left; }
.sig .k{ text-align:right; white-space:nowrap; }
.sig .v{ display:inline-block; min-width:12em; border-bottom:1px dotted #6B7470; text-align:center; line-height:1.4; color:#0F2A6B; font-weight:500; }
.sig .v.plain{ color:inherit; font-weight:400; }
.sig .full{ grid-column:1 / -1; text-align:center; }
.lf-bottom{ display:grid; grid-template-columns:1.05fr 1fr; gap:22px; margin-top:16px; padding-top:12px;
  border-top:1px solid var(--rule); font-size:14px; line-height:1.85; }
.lf-col-title{ font-weight:700; margin-bottom:4px; }
.lf-stats{ width:100%; border-collapse:collapse; font-size:13.5px; margin:2px 0 8px; }
.lf-stats th, .lf-stats td{ border:1px solid #9AA39F; padding:3px 6px; text-align:center; line-height:1.45; }
.lf-stats th{ font-weight:600; background:var(--tint); font-size:12.5px; white-space:nowrap; }
.lf-stats th small{ display:block; font-weight:400; font-size:11px; color:var(--ink-soft); }
.lf-stats td:first-child{ text-align:left; }
.lf-stats .muted{ color:var(--ink-faint); }
.lf-stamp{ text-align:center; line-height:2; margin-top:4px; }
.lf-stamp .sig .v{ min-width:10.5em; }
.lf-lines .ln{ border-bottom:1px dotted #6B7470; height:1.85em; }
.lf-order{ margin-top:10px; padding-top:8px; border-top:1px dashed var(--rule); }
.lf-note{ font-size:12px; color:var(--ink-faint); margin-top:2px; line-height:1.5; }

/* ---------- org chart (print) ---------- */
.orgchart-wrap{padding:6px 0;}
.org-head-wrap{display:flex; flex-direction:column; align-items:center;}
.org-head-box{ display:inline-flex; align-items:center; gap:10px; border:1.5px solid var(--accent); color:var(--ink); padding:8px 18px; border-radius:10px; }
.org-head-name{font-size:15px; font-weight:700;}
.org-head-title{font-size:12px; color:var(--ink-soft); margin-top:1px;}
.org-head-stem{width:1.5px; height:20px; background:var(--rule); margin:0 auto;}
.org-branch{display:flex; justify-content:center; gap:10px; position:relative; padding-top:20px; flex-wrap:wrap;}
.org-col{position:relative; flex:1; min-width:110px; max-width:170px;}
.org-col-head{ background:var(--tint); color:var(--ink); border:1px solid var(--rule); border-top:3px solid var(--accent); font-size:12px; font-weight:700; text-align:center; padding:6px; border-radius:6px; margin-bottom:6px; min-height:32px; display:flex; align-items:center; justify-content:center; }
.org-col-list{display:flex; flex-direction:column; gap:4px;}
.org-person{ display:flex; align-items:center; gap:6px; background:#fff; border:1px solid var(--rule-soft); border-radius:6px; padding:4px 6px; }
.org-person-info{min-width:0;}
.org-person-name{font-size:11.5px; color:var(--ink); line-height:1.3;}
.org-person-pos{font-size:10px; color:var(--ink-faint); line-height:1.3;}
.org-leader{background:var(--accent-soft); border-color:var(--accent);}
.org-leader .org-person-name{font-weight:700;}
.avatar{border-radius:50%; object-fit:cover; flex-shrink:0;}
.avatar-fallback{border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--accent-soft); color:var(--accent); font-weight:700; flex-shrink:0;}
`;

function printDocument(html, opts){
  opts = opts || {};
  // open the window synchronously (before any await) so the browser doesn't
  // treat it as an unrequested popup and block it
  const printWin = window.open('', '_blank');
  if(!printWin){
    toast('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต popup ของเว็บนี้แล้วลองใหม่');
    return;
  }

  // official forms carry their own centred letterhead; reports get a running header
  const formal = opts.formal || /class="lf"/.test(html);
  const title = esc(opts.title || 'เอกสาร');
  const logoImg = state.settings.logoUrl
    ? `<img src="${esc(state.settings.logoUrl)}" class="pph-logo" alt="">` : '';
  const headerHtml = formal ? '' : `
    <div class="pph-wrap">
      <div class="pph-row">
        ${logoImg}
        <div class="pph-text">
          <div class="pph-title">${title}</div>
          <div class="pph-sub">${esc(ORG_FULL_NAME)}</div>
        </div>
        <div class="pph-date">พิมพ์เมื่อ ${esc(thaiLongDate(todayStr()))}</div>
      </div>
    </div>`;

  const docHtml = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: ${formal ? '14mm 18mm 12mm 22mm' : '12mm 14mm 14mm'}; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin:0; padding:0; background:#DADFDD; font-family:'Sarabun','TH Sarabun New','TH SarabunPSK',sans-serif; color:#1A1F1D; }
  table.pdf-print-table { width:100%; border-collapse:collapse; background:#fff; }
  table.pdf-print-table > thead { display: table-header-group; }
  table.pdf-print-table > thead > tr > td, table.pdf-print-table > tbody > tr > td { padding:0; }
  tr, .pdf-noBreak, .lf-bottom { page-break-inside: avoid; break-inside: avoid; }
  .pph-wrap { padding:0 0 10px; margin-bottom:14px; border-bottom:1.5px solid #1A1F1D; }
  .pph-row { display:flex; align-items:center; gap:14px; }
  .pph-logo { height:46px; width:auto; object-fit:contain; flex-shrink:0; }
  .pph-text { flex:1; }
  .pph-title { font-size:18px; font-weight:700; line-height:1.3; }
  .pph-sub { font-size:13px; color:#4E5753; line-height:1.4; }
  .pph-date { font-size:12px; color:#8A938F; white-space:nowrap; align-self:flex-end; }
  .pdf-print-toolbar { position:sticky; top:0; z-index:10; background:#14201C; color:#fff; padding:10px 18px;
    display:flex; align-items:center; justify-content:space-between; font-size:14px; gap:12px; }
  .pdf-print-toolbar button { font-family:inherit; font-size:14px; font-weight:600; padding:8px 18px;
    border:none; border-radius:8px; background:#17735F; color:#fff; cursor:pointer; }
  .pdf-print-toolbar button:hover { background:#1F8A72; }
  .pdf-print-toolbar span { opacity:.8; }
  .sheet-pad { padding:${formal ? '0' : '0'}; }
  @media print {
    html, body { background:#fff; }
    .pdf-print-toolbar { display:none !important; }
    table.pdf-print-table { box-shadow:none !important; margin:0 !important; }
  }
  @media screen {
    table.pdf-print-table { width:210mm; margin:18px auto 30px; box-shadow:0 6px 30px rgba(0,0,0,.14); }
    table.pdf-print-table > thead > tr > td { padding:${formal ? '0' : '12mm 14mm 0'}; }
    table.pdf-print-table > tbody > tr > td { padding:${formal ? '14mm 18mm 12mm 22mm' : '0 14mm 14mm'}; }
  }
  ${PRINT_DOC_CSS}
</style>
</head><body>
  <div class="pdf-print-toolbar">
    <span>ตรวจดูตัวอย่างก่อนพิมพ์ แล้วกดปุ่มด้านขวา เลือกปลายทาง <b>Save as PDF</b> เพื่อบันทึกเป็นไฟล์</span>
    <button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button>
  </div>
  <table class="pdf-print-table">
    ${formal ? '' : `<thead><tr><td>${headerHtml}</td></tr></thead>`}
    <tbody><tr><td><div class="sheet-pad">${html}</div></td></tr></tbody>
  </table>
  <script>
    // wait for Sarabun before the user prints so line breaks don't shift
    if(document.fonts && document.fonts.ready){ document.fonts.ready.then(function(){ document.body.classList.add('fonts-ready'); }); }
  <\/script>
</body></html>`;

  printWin.document.open();
  printWin.document.write(docHtml);
  printWin.document.close();
}

/* ---------------- Official leave request form (printable) ----------------
   Matches the organization's paper form: "ใบลาป่วย ลาคลอด และลากิจ" for
   sick/personal leave, and "แบบใบลาพักผ่อน" for vacation leave. */
const ORG_FULL_NAME = 'มูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์';
const THAI_MONTHS_LONG = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

function thaiLongDateParts(dstr){
  const d = localDate(dstr);
  if(!d) return {day:'', month:'', year:''};
  return { day:d.getDate(), month:THAI_MONTHS_LONG[d.getMonth()], year:d.getFullYear()+543 };
}
function thaiLongDate(dstr){
  const p = thaiLongDateParts(dstr);
  return p.day ? `${p.day} ${p.month} ${p.year}` : '';
}
function checkbox(on){ return `<span class="cb${on?' on':''}"></span>`; }
function opt(on, label){ return `<span class="opt">${checkbox(on)}${label}</span>`; }
function sigBlock(lines){
  return `<div class="sig">${lines.map(l=> l.full ? `<div class="full">${l.full}</div>` :
    `<span class="k">${l.k}</span><span class="v${l.plain?' plain':''}">${l.v===undefined||l.v===null||l.v===''?'&nbsp;':esc(l.v)}</span>`).join('')}</div>`;
}
/* a value typed onto a dotted line, like a filled-in paper form */
function fillIn(v, w, left){
  const txt = (v===undefined || v===null || v==='') ? '&nbsp;' : esc(v);
  return `<span class="f${left?' l':''}" style="--w:${w||4}em">${txt}</span>`;
}
function blankOr(v){ return fillIn(v); }

function findPreviousLeaveOfType(rec){
  const prior = state.leaves.filter(l=>
    l.employeeId===rec.employeeId && l.leaveType===rec.leaveType && l.id!==rec.id && isApproved(l) &&
    l.startDate && rec.startDate && l.startDate < rec.startDate
  ).sort((a,b)=> String(b.startDate).localeCompare(String(a.startDate)));
  return prior[0] || null;
}

/* "ลามาแล้ว / ลาครั้งนี้ / รวมเป็น" — days already taken this fiscal year
   (approved, excluding this request) + this request = running total. */
function leaveStatsFor(rec){
  const fyBE = rec.startDate ? fiscalYearBE(localDate(rec.startDate)||new Date()) : fiscalYearBE();
  const s = computeEmployeeSummary(rec.employeeId, fyBE);
  const thisDays = safeNum(rec.days);
  const rows = s.leaveSummary.map(r=>{
    let before = r.used;
    if(r.key===rec.leaveType && isApproved(rec) && rec.startDate && inRange(rec.startDate, s.fy.start, s.fy.end)) before -= thisDays;
    const now = r.key===rec.leaveType ? thisDays : 0;
    return { key:r.key, label:r.label, total:r.total, before:roundDays(before), now, sum:roundDays(before+now), left:roundDays(r.total-before-now), carry:r.carry, right:r.right };
  });
  return { fyBE, rows, s };
}
function leaveStatsTableHtml(rec, keys){
  const st = leaveStatsFor(rec);
  const rows = st.rows.filter(r=>keys.includes(r.key));
  const labels = {'ป':'ป่วย','ก':'กิจส่วนตัว','พ':'พักผ่อน'};
  return `
  <table class="lf-stats">
    <thead><tr><th>ประเภท</th><th>ลามาแล้ว<small>วัน</small></th><th>ลาครั้งนี้<small>วัน</small></th><th>รวมเป็น<small>วัน</small></th><th>คงเหลือ<small>วัน</small></th></tr></thead>
    <tbody>
      ${rows.map(r=>`<tr><td>${labels[r.key]||r.label}</td><td>${r.before||'-'}</td><td>${r.now||'-'}</td><td>${r.sum||'-'}</td><td>${r.left}</td></tr>`).join('')}
      ${keys.includes('ป') ? `<tr><td>คลอดบุตร</td><td class="muted">-</td><td class="muted">-</td><td class="muted">-</td><td class="muted">-</td></tr>` : ''}
    </tbody>
  </table>
  <div class="lf-note">ปีงบประมาณ ${st.fyBE} (1 ต.ค. ${st.fyBE-1} – 30 ก.ย. ${st.fyBE})</div>`;
}

function leaveFormPrintHtml(rec){
  const emp = employeeById(rec.employeeId) || {};
  const submit = thaiLongDateParts(rec.submitDate);
  if(rec.leaveType==='พ') return vacationFormPrintHtml(rec, emp, submit);
  return sickPersonalFormPrintHtml(rec, emp, submit);
}
function leaveFormTitle(rec){
  return rec.leaveType==='พ' ? 'แบบใบลาพักผ่อน' : 'แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว';
}

function leaveFormHeadHtml(title){
  const logo = state.settings.logoUrl ? `<img src="${esc(state.settings.logoUrl)}" alt="">` : '';
  return `<div class="lf-head">${logo}<div class="lf-title">${title}</div><div class="lf-org">${esc(ORG_FULL_NAME)}</div></div>`;
}
function leaveFormPlaceDateHtml(emp, submit){
  return `<div class="lf-place"><div>
    <div>เขียนที่ ${fillIn(emp.department || 'สำนักงานฯ', 9)}</div>
    <div>วันที่ ${fillIn(submit.day, 2.5)} เดือน ${fillIn(submit.month, 6)} พ.ศ. ${fillIn(submit.year, 3.5)}</div>
  </div></div>`;
}
function leaveContactLine(rec){
  const parts = [
    rec.contactAddress ? 'บ้านเลขที่ '+rec.contactAddress : '',
    rec.contactSoi ? 'ซอย '+rec.contactSoi : '',
    rec.contactTambon ? 'ต.'+rec.contactTambon : '',
    rec.contactAmphoe ? 'อ.'+rec.contactAmphoe : '',
    rec.contactProvince ? 'จ.'+rec.contactProvince : ''
  ].filter(Boolean).join(' ');
  return `<div class="lf-row lf-indent">ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่ ${fillIn(parts, 15, true)}</div>
    <div class="lf-row">โทรศัพท์ ${fillIn(rec.contactPhone, 8)}</div>`;
}
function leaveSignerHtml(emp){
  return `<div class="lf-sign"><div>
    <div>ขอแสดงความนับถือ</div>
    ${sigBlock([{k:'(ลงชื่อ)', v:''}, {k:'(', v:emp.name}, {k:'ตำแหน่ง', v:emp.position}])}
  </div></div>`;
}
function approverBlockHtml(){
  return `
    <div class="lf-col-title">ความเห็นผู้บังคับบัญชา</div>
    <div class="lf-lines"><div class="ln"></div><div class="ln"></div></div>
    <div class="lf-stamp">${sigBlock([{k:'(ลงชื่อ)'},{k:'ตำแหน่ง'},{k:'วันที่'}])}</div>
    <div class="lf-order">
      <div class="lf-col-title">คำสั่ง</div>
      <div>${opt(false,'อนุญาต')}${opt(false,'ไม่อนุญาต')}</div>
      <div class="lf-lines"><div class="ln"></div></div>
    <div class="lf-stamp">${sigBlock([{k:'(ลงชื่อ)'},{k:'ตำแหน่ง'},{k:'วันที่'}])}</div>
    </div>`;
}
function checkerBlockHtml(){
  return `<div class="lf-stamp">${sigBlock([{k:'(ลงชื่อ)'},{full:'ผู้ตรวจสอบ'},{k:'ตำแหน่ง'},{k:'วันที่'}])}</div>`;
}

function sickPersonalFormPrintHtml(rec, emp, submit){
  const prev = findPreviousLeaveOfType(rec);
  const isSick = rec.leaveType==='ป';
  const isPersonal = rec.leaveType==='ก';
  const kind = isSick ? 'ลาป่วย' : isPersonal ? 'ลากิจส่วนตัว' : 'ลา';
  return `
  <div class="lf">
    ${leaveFormHeadHtml('แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว')}
    ${leaveFormPlaceDateHtml(emp, submit)}

    <div class="lf-row"><span class="lf-label">เรื่อง</span>ขออนุญาต${kind}</div>
    <div class="lf-row"><span class="lf-label">เรียน</span>หัวหน้าสำนักงาน</div>

    <div class="lf-row lf-indent">ข้าพเจ้า ${fillIn(emp.name, 13)} ตำแหน่ง ${fillIn(emp.position, 11)}</div>
    <div class="lf-row">สังกัด ${fillIn(emp.department, 8)} ${esc(ORG_FULL_NAME)}</div>
    <div class="lf-row">ขอลา&ensp;${opt(isSick,'ป่วย')}${opt(isPersonal,'กิจส่วนตัว')}${opt(false,'คลอดบุตร')}</div>
    <div class="lf-row">เนื่องจาก ${fillIn(rec.reason, 26, true)}</div>
    <div class="lf-row">ตั้งแต่วันที่ ${fillIn(thaiLongDate(rec.startDate), 9)} ถึงวันที่ ${fillIn(thaiLongDate(rec.endDate), 9)} มีกำหนด ${fillIn(rec.days, 2.5)} วัน</div>
    <div class="lf-row lf-indent">ข้าพเจ้าได้ลา&ensp;${opt(isSick,'ป่วย')}${opt(isPersonal,'กิจส่วนตัว')}${opt(false,'คลอดบุตร')}ครั้งสุดท้าย</div>
    <div class="lf-row">ตั้งแต่วันที่ ${fillIn(prev?thaiLongDate(prev.startDate):'', 8)} ถึงวันที่ ${fillIn(prev?thaiLongDate(prev.endDate):'', 8)} มีกำหนด ${fillIn(prev?prev.days:'', 2.5)} วัน</div>
    ${leaveContactLine(rec)}

    ${leaveSignerHtml(emp)}

    <div class="lf-bottom">
      <div>
        <div class="lf-col-title">สถิติการลาในปีงบประมาณนี้</div>
        ${leaveStatsTableHtml(rec, ['ป','ก'])}
        ${checkerBlockHtml()}
      </div>
      <div>${approverBlockHtml()}</div>
    </div>
  </div>`;
}

function vacationFormPrintHtml(rec, emp, submit){
  const st = leaveStatsFor(rec);
  const vac = st.rows.find(r=>r.key==='พ') || {right:0, carry:0, total:0};
  return `
  <div class="lf">
    ${leaveFormHeadHtml('แบบใบลาพักผ่อน')}
    ${leaveFormPlaceDateHtml(emp, submit)}

    <div class="lf-row"><span class="lf-label">เรื่อง</span>ขออนุญาตลาพักผ่อน</div>
    <div class="lf-row"><span class="lf-label">เรียน</span>หัวหน้าสำนักงานมูลนิธิฯ</div>

    <div class="lf-row lf-indent">ข้าพเจ้า ${fillIn(emp.name, 13)} ตำแหน่ง ${fillIn(emp.position, 11)}</div>
    <div class="lf-row">สังกัด ${fillIn(emp.department, 8)} ${esc(ORG_FULL_NAME)}</div>
    <div class="lf-row">มีวันลาพักผ่อนสะสม ${fillIn(vac.carry, 2.5)} วันทำการ มีสิทธิลาพักผ่อนประจำปีนี้อีก ${fillIn(vac.right, 2.5)} วันทำการ</div>
    <div class="lf-row">รวมเป็น ${fillIn(vac.total, 2.5)} วันทำการ</div>
    <div class="lf-row">ขอลาพักผ่อนตั้งแต่วันที่ ${fillIn(thaiLongDate(rec.startDate), 9)} ถึงวันที่ ${fillIn(thaiLongDate(rec.endDate), 9)} มีกำหนด ${fillIn(rec.days, 2.5)} วัน</div>
    ${leaveContactLine(rec)}

    ${leaveSignerHtml(emp)}

    <div class="lf-bottom">
      <div>
        <div class="lf-col-title">สถิติการลาในปีงบประมาณนี้</div>
        ${leaveStatsTableHtml(rec, ['พ'])}
        ${checkerBlockHtml()}
      </div>
      <div>${approverBlockHtml()}</div>
    </div>
  </div>`;
}

/* ================= SELF-SERVICE (employee portal) ================= */
function viewMyHome(){
  const emp = currentEmployee();
  if(!emp) return `<div class="panel">ไม่พบข้อมูลพนักงานของคุณ กรุณาติดต่อผู้ดูแลระบบ</div>`;
  const summary = computeEmployeeSummary(emp.id);
  return `
  <div class="page-header">
    <div><h1>ข้อมูลของฉัน</h1><div class="sub">สวัสดี ${esc(emp.name)}</div></div>
  </div>
  <div class="panel">
    <div style="display:flex; align-items:center; gap:16px; margin-bottom:6px;">
      ${avatarHtml(emp,64)}
      <div>
        <h3 style="margin:0 0 3px;">${esc(emp.name)}</h3>
        <div class="muted" style="font-size:13px;">${esc(emp.position)} · ${esc(emp.department)}</div>
      </div>
    </div>
  </div>
  <div class="panel">${individualReportHtml(summary, false, true)}</div>
  <div class="grid grid-3">
    <div class="panel" style="text-align:center;">
      <div class="muted" style="font-size:12.5px; margin-bottom:10px;">ต้องการยื่นขอลา?</div>
      <button class="btn btn-primary" id="btnQuickLeave" style="width:100%; justify-content:center;">+ ยื่นขอลา</button>
    </div>
    <div class="panel" style="text-align:center;">
      <div class="muted" style="font-size:12.5px; margin-bottom:10px;">ต้องการยื่นขอกู้เงิน?</div>
      <button class="btn btn-primary" id="btnQuickLoan" style="width:100%; justify-content:center;">+ ยื่นขอกู้เงิน</button>
    </div>
    <div class="panel" style="text-align:center;">
      <div class="muted" style="font-size:12.5px; margin-bottom:10px;">ต้องการเบิกสวัสดิการ?</div>
      <button class="btn btn-primary" id="btnQuickWelfare" style="width:100%; justify-content:center;">+ ยื่นเบิกสวัสดิการ</button>
    </div>
  </div>
  `;
}

function selfRecordActionsHtml(sheet, rec){
  if((rec.approvalStatus||'approved') !== 'pending') return '';
  return `<button class="btn btn-sm" data-self-edit="${sheet}:${rec.id}">แก้ไข</button>
    <button class="btn btn-sm btn-danger" data-self-del="${sheet}:${rec.id}">ลบ</button>`;
}
function bindSelfRecordActions(container, editFns){
  container.querySelectorAll('[data-self-edit]').forEach(b=>b.addEventListener('click', ()=>{
    const [sheet,id] = b.dataset.selfEdit.split(':');
    editFns[sheet](id);
  }));
  container.querySelectorAll('[data-self-del]').forEach(b=>b.addEventListener('click', ()=>{
    const [sheet,id] = b.dataset.selfDel.split(':');
    if(confirm('ยืนยันลบรายการนี้?')) crudDelete(sheet, id);
  }));
}

let selfLeaveCalState = { year: new Date().getFullYear(), month: new Date().getMonth() };

function viewMyLeaves(){
  const empId = currentEmployeeId();
  const rows = state.leaves.filter(l=>l.employeeId===empId).sort((a,b)=> new Date(b.startDate||0)-new Date(a.startDate||0));
  return `
  <div class="page-header">
    <div><h1>วันลาของฉัน</h1><div class="sub">รวม ${rows.length} รายการ</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddLeave">+ ยื่นขอลา</button></div>
  </div>
  <div class="panel" id="myLeaveCalendarPanel">${leaveCalendarHtml(selfLeaveCalState, rows)}</div>
  <div class="panel">
    <div class="table-wrap"><table class="reg" id="myLeaveTable">
      <thead><tr><th class="rownum">#</th><th class="num">วันที่ยื่น</th><th>ประเภท</th><th class="num">ลาตั้งแต่</th><th class="num">ถึงวันที่</th><th class="num">จำนวนวัน</th><th>เหตุผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((l,i)=>`
        <tr class="row-clickable" data-leave-id="${l.id}">
          <td class="rownum">${i+1}</td><td class="num">${buddhistDate(l.submitDate)}</td>
          <td>${leaveTypeTag(l.leaveType)}</td>
          <td class="num">${buddhistDate(l.startDate)}</td><td class="num">${buddhistDate(l.endDate)}</td>
          <td class="num">${l.days}</td><td>${esc(l.reason)}</td><td>${approvalTag(l)}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-sm btn-gold" data-print-leave="${l.id}">พิมพ์ใบลา</button>
            ${selfRecordActionsHtml('leaves', l)}
          </td>
        </tr>`).join('') : `<tr class="empty-row"><td colspan="9">ยังไม่มีรายการลา</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

function refreshSelfLeaveCalendar(){
  const empId = currentEmployeeId();
  const rows = state.leaves.filter(l=>l.employeeId===empId);
  const panel = document.getElementById('myLeaveCalendarPanel');
  if(!panel) return;
  panel.innerHTML = leaveCalendarHtml(selfLeaveCalState, rows);
  bindLeaveCalendarEvents(panel, selfLeaveCalState, rows, refreshSelfLeaveCalendar);
}

function viewMyLoans(){
  const empId = currentEmployeeId();
  const rows = state.loans.filter(l=>l.employeeId===empId).sort((a,b)=> new Date(b.submitDate||0)-new Date(a.submitDate||0));
  return `
  <div class="page-header">
    <div><h1>เงินกู้ของฉัน</h1><div class="sub">รวม ${rows.length} รายการ</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddLoan">+ ยื่นขอกู้เงิน</button></div>
  </div>
  <div class="panel">
    <div class="table-wrap"><table class="reg" id="myLoanTable">
      <thead><tr><th class="rownum">#</th><th>ประเภท</th><th class="num">วงเงินอนุมัติ</th><th class="num">คงเหลือ</th><th>สถานะ</th><th>อนุมัติ</th><th>จัดการ</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((l,i)=>{
          const remaining = loanRemaining(l);
          const status = l.status||'active';
          return `<tr class="row-clickable" data-loan-id="${l.id}">
          <td class="rownum">${i+1}</td><td>${esc(l.loanType)}</td>
          <td class="num">${money(l.approvedAmount)}</td><td class="num">${money(remaining)}</td>
          <td>${status==='closed'?'<span class="tag tag-green">ปิดบัญชีแล้ว</span>':'<span class="tag tag-amber">กำลังผ่อน</span>'}</td>
          <td>${approvalTag(l)}</td>
          <td style="white-space:nowrap;">${selfRecordActionsHtml('loans', l)}</td>
        </tr>`;
        }).join('') : `<tr class="empty-row"><td colspan="7">ยังไม่มีรายการเงินกู้</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

function viewMyWelfare(){
  const empId = currentEmployeeId();
  const rows = state.welfare.filter(w=>w.employeeId===empId).sort((a,b)=> new Date(b.submitDate||0)-new Date(a.submitDate||0));
  return `
  <div class="page-header">
    <div><h1>สวัสดิการของฉัน</h1><div class="sub">รวม ${rows.length} รายการ</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddWelfare">+ ยื่นเบิกสวัสดิการ</button></div>
  </div>
  <div class="panel">
    <div class="table-wrap"><table class="reg" id="myWelfTable">
      <thead><tr><th class="rownum">#</th><th class="num">วันที่ยื่น</th><th>หมวดหมู่</th><th class="num">ยอดใบเสร็จ</th><th class="num">อนุมัติเบิก</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((w,i)=>`
        <tr class="row-clickable" data-welf-id="${w.id}">
          <td class="rownum">${i+1}</td><td class="num">${buddhistDate(w.submitDate)}</td>
          <td><span class="tag tag-navy">${esc(w.category)}</span></td>
          <td class="num">${money(w.receiptAmount)}</td><td class="num">${money(w.approvedAmount)}</td>
          <td>${approvalTag(w)}</td>
          <td style="white-space:nowrap;">${selfRecordActionsHtml('welfare', w)}</td>
        </tr>`).join('') : `<tr class="empty-row"><td colspan="7">ยังไม่มีรายการเบิกสวัสดิการ</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

function gradeFromScore(score){
  if(score>=90) return 'ดีเยี่ยม';
  if(score>=80) return 'ดีมาก';
  if(score>=70) return 'ดี';
  if(score>=60) return 'พอใช้';
  return 'ควรปรับปรุง';
}

function viewMyKpi(){
  const empId = currentEmployeeId();
  const rows = state.kpi.filter(k=>k.employeeId===empId).sort((a,b)=> (b.year||'').localeCompare(a.year||''));
  return `
  <div class="page-header"><div><h1>ผลประเมิน KPI</h1><div class="sub">ประวัติผลประเมินการปฏิบัติงานของฉัน</div></div></div>
  ${rows.length ? rows.map(k=>kpiCardHtml(k)).join('') : `<div class="panel"><div class="muted" style="text-align:center; padding:20px;">ยังไม่มีผลการประเมิน</div></div>`}
  `;
}

function kpiCardHtml(k){
  const grade = k.grade || gradeFromScore(safeNum(k.overallScore));
  return `
  <div class="panel">
    <h2>${esc(k.year)} — ${esc(k.period)}</h2>
    <div class="grid grid-2" style="margin-bottom:14px;">
      <div class="stat" style="--tone:var(--accent);"><div class="label">คะแนนรวม</div><div class="value">${safeNum(k.overallScore).toFixed(1)}</div><div class="foot">จาก 100 คะแนน</div></div>
      <div class="stat" style="--tone:var(--marigold);"><div class="label">ระดับผลงาน</div><div class="value" style="font-size:20px;">${esc(grade)}</div></div>
    </div>
    <table class="reg">
      <thead><tr><th>หัวข้อประเมิน</th><th class="num">คะแนน (เต็ม 100)</th></tr></thead>
      <tbody>
        <tr><td>คุณภาพงาน</td><td class="num">${safeNum(k.scoreQuality)}</td></tr>
        <tr><td>ปริมาณงาน</td><td class="num">${safeNum(k.scoreQuantity)}</td></tr>
        <tr><td>ความรับผิดชอบ</td><td class="num">${safeNum(k.scoreResponsibility)}</td></tr>
        <tr><td>การทำงานร่วมกับผู้อื่น</td><td class="num">${safeNum(k.scoreTeamwork)}</td></tr>
        <tr><td>ระเบียบวินัย</td><td class="num">${safeNum(k.scoreDiscipline)}</td></tr>
      </tbody>
    </table>
    <div class="doc-meta" style="margin-top:14px;">
      <div><span class="k">ผู้ประเมิน: </span>${esc(k.evaluator)||'-'}</div>
      <div><span class="k">วันที่ประเมิน: </span>${buddhistDate(k.evaluatedDate)}</div>
      <div class="field full"><span class="k">ความคิดเห็น: </span>${esc(k.comments)||'-'}</div>
    </div>
  </div>`;
}

function viewMyTraining(){
  const empId = currentEmployeeId();
  const rows = state.training.filter(t=>t.employeeId===empId).sort((a,b)=> new Date(b.startDate||0)-new Date(a.startDate||0));
  const totalHours = rows.reduce((s,t)=>s+safeNum(t.hours),0);
  return `
  <div class="page-header"><div><h1>ประวัติการอบรม</h1><div class="sub">รวม ${rows.length} หลักสูตร · ${totalHours} ชั่วโมง</div></div></div>
  <div class="panel">
    <div class="table-wrap"><table class="reg">
      <thead><tr><th class="rownum">#</th><th>หลักสูตร</th><th>หน่วยงานจัดอบรม</th><th>ประเภท</th><th class="num">วันที่</th><th class="num">ชั่วโมง</th><th>ใบประกาศ</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((t,i)=>`
        <tr>
          <td class="rownum">${i+1}</td><td>${esc(t.courseName)}</td><td>${esc(t.organizer)}</td><td>${esc(t.trainingType)}</td>
          <td class="num">${buddhistDate(t.startDate)}${t.endDate && t.endDate!==t.startDate ? ' - '+buddhistDate(t.endDate):''}</td>
          <td class="num">${safeNum(t.hours)}</td>
          <td>${t.certificateUrl? `<a href="${esc(t.certificateUrl)}" target="_blank" rel="noopener">ดูใบประกาศ</a>` : '-'}</td>
        </tr>`).join('') : `<tr class="empty-row"><td colspan="7">ยังไม่มีประวัติการอบรม</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

