/* ===== reports-selfservice.js ===== */
/* ================= REPORTS ================= */
function computeEmployeeSummary(empId){
  const emp = employeeById(empId);
  if(!emp) return null;
  const fy = fiscalYearRange();
  const leaves = state.leaves.filter(l=>l.employeeId===empId && l.startDate && inRange(l.startDate, fy.start, fy.end) && isApproved(l));
  const used = {'ป':0,'พ':0,'ก':0};
  leaves.forEach(l=>{ if(used[l.leaveType]!==undefined) used[l.leaveType]+=Number(l.days||0); });
  const leaveSummary = [
    {label:'ลาป่วย', right:safeNum(emp.sickRight), carry:safeNum(emp.carrySick), used:used['ป']},
    {label:'ลาพักผ่อน', right:safeNum(emp.vacationRight), carry:safeNum(emp.carryVacation), used:used['พ']},
    {label:'ลากิจ', right:safeNum(emp.personalRight), carry:safeNum(emp.carryPersonal), used:used['ก']}
  ].map(r=>({...r, total:r.right+r.carry, remaining:r.right+r.carry-r.used}));

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

  return {emp, leaveSummary, loanSummary, welfareSummary, fy};
}

function viewReports(){
  return `
  <div class="page-header">
    <div><h1>รายงาน</h1><div class="sub">ดูสรุปรายบุคคลหรือรายงานภาพรวม แล้วสั่งพิมพ์เป็น PDF ได้ทันที</div></div>
  </div>
  <div class="pill-nav">
    <button data-report="individual" class="active">สรุปรายบุคคล</button>
    <button data-report="overall">สรุปภาพรวมทุกคน</button>
  </div>
  <div id="reportBody"></div>
  `;
}

function renderReportIndividual(){
  const body = document.getElementById('reportBody');
  body.innerHTML = `
  <div class="panel">
    <div class="searchbar">
      <select id="reportEmpSelect" style="flex:1;"><option value="">-- เลือกพนักงาน --</option>${empOptionsHtml('')}</select>
      <button class="btn btn-gold" id="btnPrintIndividual" disabled>พิมพ์ / บันทึก PDF</button>
    </div>
    <div id="individualPreview"></div>
  </div>`;
  document.getElementById('reportEmpSelect').addEventListener('change', (e)=>{
    const id = e.target.value;
    const printBtn = document.getElementById('btnPrintIndividual');
    if(!id){ document.getElementById('individualPreview').innerHTML=''; printBtn.disabled=true; return; }
    const summary = computeEmployeeSummary(id);
    document.getElementById('individualPreview').innerHTML = individualReportHtml(summary);
    printBtn.disabled = false;
    printBtn.onclick = ()=> printDocument(individualReportHtml(summary, true));
  });
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

  <div class="doc-section-title">สรุปวันลา ปีงบประมาณ ${s.fy.start.getFullYear()+543}-${s.fy.end.getFullYear()+543}</div>
  <table class="reg"><thead><tr><th>หมวดวันลา</th><th class="num">สิทธิ์ตั้งต้น</th><th class="num">สะสมยกมา</th><th class="num">รวมสิทธิ์</th><th class="num">ใช้ไปแล้ว</th><th class="num">คงเหลือ</th></tr></thead>
  <tbody>${s.leaveSummary.map(r=>`<tr><td>${r.label}</td><td class="num">${r.right}</td><td class="num">${r.carry}</td><td class="num">${r.total}</td><td class="num">${r.used}</td><td class="num">${r.remaining}</td></tr>`).join('')}</tbody></table>

  <div class="doc-section-title">สรุปเงินกู้</div>
  <table class="reg"><thead><tr><th>หมวดเงินกู้</th><th class="num">วงเงินสิทธิ์สูงสุด</th><th class="num">ยอดคงค้างปัจจุบัน</th></tr></thead>
  <tbody>${s.loanSummary.map(r=>`<tr><td>${r.label}</td><td class="num">${money(r.limit)}</td><td class="num">${money(r.current)}</td></tr>`).join('')}</tbody></table>

  <div class="doc-section-title">สรุปสวัสดิการและประกันสังคม (ปีงบประมาณนี้)</div>
  <table class="reg"><thead><tr><th>รายการ</th><th class="num">วงเงินสิทธิ์</th><th class="num">เบิกใช้ไปแล้ว</th><th class="num">คงเหลือ</th></tr></thead>
  <tbody>${s.welfareSummary.map(r=>`<tr><td>${r.label}</td><td class="num">${money(r.limit)}</td><td class="num">${money(r.used)}</td><td class="num">${money(r.remaining)}</td></tr>`).join('')}</tbody></table>
  ${forPrint? `<div style="margin-top:26px; font-size:12px; color:var(--ink-soft);">พิมพ์เมื่อ ${buddhistDate(todayStr())}</div>` : ''}
  `;
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
  document.getElementById('btnPrintOverall').addEventListener('click', ()=> printDocument(overallReportHtml(rows, fy, true)));
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
  ${forPrint? `<div style="margin-top:20px; font-size:12px; color:var(--ink-soft);">พิมพ์เมื่อ ${buddhistDate(todayStr())}</div>` : ''}
  `;
}

function printDocument(html){
  document.getElementById('printArea').innerHTML = html;
  window.print();
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

function viewMyLeaves(){
  const empId = currentEmployeeId();
  const rows = state.leaves.filter(l=>l.employeeId===empId).sort((a,b)=> new Date(b.startDate||0)-new Date(a.startDate||0));
  return `
  <div class="page-header">
    <div><h1>วันลาของฉัน</h1><div class="sub">รวม ${rows.length} รายการ</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddLeave">+ ยื่นขอลา</button></div>
  </div>
  <div class="panel">
    <div class="table-wrap"><table class="reg" id="myLeaveTable">
      <thead><tr><th class="rownum">#</th><th class="num">วันที่ยื่น</th><th>ประเภท</th><th class="num">ลาตั้งแต่</th><th class="num">ถึงวันที่</th><th class="num">จำนวนวัน</th><th>เหตุผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((l,i)=>`
        <tr class="row-clickable" data-leave-id="${l.id}">
          <td class="rownum">${i+1}</td><td class="num">${buddhistDate(l.submitDate)}</td>
          <td><span class="tag tag-navy">${LEAVE_TYPES[l.leaveType]||esc(l.leaveType)}</span></td>
          <td class="num">${buddhistDate(l.startDate)}</td><td class="num">${buddhistDate(l.endDate)}</td>
          <td class="num">${l.days}</td><td>${esc(l.reason)}</td><td>${approvalTag(l)}</td>
          <td style="white-space:nowrap;">${selfRecordActionsHtml('leaves', l)}</td>
        </tr>`).join('') : `<tr class="empty-row"><td colspan="9">ยังไม่มีรายการลา</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
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
      <div class="stat" style="--stat-accent:linear-gradient(90deg,#8B7FF0,#A79BFF);"><div class="label">คะแนนรวม</div><div class="value">${safeNum(k.overallScore).toFixed(1)}</div><div class="foot">จาก 100 คะแนน</div></div>
      <div class="stat" style="--stat-accent:linear-gradient(90deg,#4FD1B5,#7EE8D0);"><div class="label">ระดับผลงาน</div><div class="value" style="font-size:20px;">${esc(grade)}</div></div>
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

/* ================= SETTINGS ================= */
