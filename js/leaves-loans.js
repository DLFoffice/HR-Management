/* ===== leaves-loans.js ===== */
/* ================= LEAVES ================= */
function viewLeaves(){
  return `
  <div class="page-header">
    <div><h1>บันทึกวันลา</h1><div class="sub">รวมทั้งหมด ${state.leaves.length} รายการ</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddLeave">+ บันทึกวันลา</button></div>
  </div>
  <div class="panel">
    <div class="searchbar">
      <input type="text" id="leaveSearch" placeholder="ค้นหาชื่อพนักงาน">
      <select id="leaveTypeFilter"><option value="">ทุกประเภท</option><option value="ป">ลาป่วย</option><option value="พ">ลาพักผ่อน</option><option value="ก">ลากิจ</option></select>
      <select id="leaveStatusFilter"><option value="">ทุกสถานะ</option><option value="pending">รออนุมัติ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ไม่อนุมัติ</option></select>
    </div>
    <div class="table-wrap"><table class="reg" id="leaveTable">
      <thead><tr>
        <th class="rownum">#</th><th class="num">วันที่ยื่น</th><th>ชื่อพนักงาน</th><th>ประเภท</th>
        <th class="num">ลาตั้งแต่</th><th class="num">ถึงวันที่</th><th class="num">จำนวนวัน</th><th>เหตุผล</th><th>สถานะอนุมัติ</th><th>จัดการ</th>
      </tr></thead>
      <tbody></tbody>
    </table></div>
  </div>`;
}

function leaveRows(){
  const q = (document.getElementById('leaveSearch')?.value||'').trim().toLowerCase();
  const type = document.getElementById('leaveTypeFilter')?.value||'';
  const status = document.getElementById('leaveStatusFilter')?.value||'';
  return [...state.leaves]
    .filter(l=>(!q || String(l.employeeName||'').toLowerCase().includes(q)) && (!type || l.leaveType===type) && (!status || (l.approvalStatus||'approved')===status))
    .sort((a,b)=> new Date(b.startDate||0) - new Date(a.startDate||0));
}

function renderLeaveTable(){
  const tbody = document.querySelector('#leaveTable tbody');
  if(!tbody) return;
  const rows = leaveRows();
  tbody.innerHTML = rows.length ? rows.map((l,i)=>`
    <tr class="row-clickable" data-leave-id="${l.id}">
      <td class="rownum">${i+1}</td>
      <td class="num">${buddhistDate(l.submitDate)}</td>
      <td>${esc(l.employeeName)}</td>
      <td><span class="tag tag-navy">${LEAVE_TYPES[l.leaveType]||esc(l.leaveType)}</span></td>
      <td class="num">${buddhistDate(l.startDate)}</td>
      <td class="num">${buddhistDate(l.endDate)}</td>
      <td class="num">${l.days}</td>
      <td>${esc(l.reason)}</td>
      <td>${approvalTag(l)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" data-edit-leave="${l.id}">แก้ไข</button>
        <button class="btn btn-sm btn-danger" data-del-leave="${l.id}">ลบ</button>
        ${approvalActionsHtml('leaves', l)}
      </td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="10">ยังไม่มีรายการลา</td></tr>`;
  tbody.querySelectorAll('tr[data-leave-id]').forEach(tr=>{
    tr.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      openLeaveDetailModal(tr.dataset.leaveId);
    });
  });
  tbody.querySelectorAll('[data-edit-leave]').forEach(b=>b.addEventListener('click', (e)=>{ e.stopPropagation(); openLeaveModal(b.dataset.editLeave); }));
  tbody.querySelectorAll('[data-del-leave]').forEach(b=>b.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(confirm('ยืนยันลบรายการลานี้?')) crudDelete('leaves', b.dataset.delLeave);
  }));
  bindApprovalButtons(tbody);
}

function empOptionsHtml(selectedId){
  return state.employees.map(e=>`<option value="${e.id}" ${e.id===selectedId?'selected':''}>${esc(e.name)}</option>`).join('');
}

/* For leave/loan/welfare forms: admin picks any employee from a dropdown;
   a self-service user is locked to their own record (no dropdown). */
function employeeFieldHtml(selectedId){
  if(isSelfUser()){
    const emp = currentEmployee();
    return `<input type="hidden" id="f_emp" value="${emp?emp.id:''}">
      <input type="text" value="${emp?esc(emp.name):''}" disabled style="background:var(--lav-bg); color:var(--lav-deep); font-weight:600;">`;
  }
  return `<select id="f_emp"><option value="">-- เลือกพนักงาน --</option>${empOptionsHtml(selectedId)}</select>`;
}

function leaveFormHtml(rec){
  const r = rec || {};
  return `
  <h3>${rec?'แก้ไขรายการลา':'บันทึกวันลาใหม่'}</h3>
  <div class="field-grid">
    <div class="field full"><label>พนักงาน *</label>${employeeFieldHtml(r.employeeId)}</div>
    <div class="field"><label>วันที่ยื่นใบลา</label>${thaiDateFieldHtml('f_submitDate', r.submitDate||todayStr())}</div>
    <div class="field"><label>ประเภทการลา *</label><select id="f_type">
      <option value="ป" ${r.leaveType==='ป'?'selected':''}>ลาป่วย</option>
      <option value="พ" ${r.leaveType==='พ'?'selected':''}>ลาพักผ่อน</option>
      <option value="ก" ${r.leaveType==='ก'?'selected':''}>ลากิจ</option>
    </select></div>
    <div class="field"><label>ลาตั้งแต่วันที่ *</label>${thaiDateFieldHtml('f_start', r.startDate)}</div>
    <div class="field"><label>ถึงวันที่ *</label>${thaiDateFieldHtml('f_end', r.endDate)}</div>
    <div class="field"><label>จำนวนวันลา</label><input type="number" step="0.5" id="f_days" value="${r.days??''}" placeholder="คำนวณอัตโนมัติถ้าเว้นว่าง"></div>
    <div class="field"><label>เหตุผลการลา</label><input id="f_reason" value="${esc(r.reason)}"></div>
    <div class="field full"><label>หมายเหตุ</label><textarea id="f_note">${esc(r.note)}</textarea></div>
  </div>
  <div class="field-error" id="f_error">กรุณาเลือกพนักงานและกรอกวันที่ให้ครบถ้วน</div>
  <div class="modal-actions">
    <button class="btn" id="btnCancelModal">ยกเลิก</button>
    <button class="btn btn-primary" id="btnSaveLeave">${rec?'บันทึกการแก้ไข':'บันทึกวันลา'}</button>
  </div>`;
}

function openLeaveModal(id){
  const rec = id ? state.leaves.find(l=>l.id===id) : null;
  openModal(leaveFormHtml(rec));
  document.getElementById('btnSaveLeave').addEventListener('click', ()=>{
    const empId = document.getElementById('f_emp').value;
    const start = document.getElementById('f_start').value;
    const end = document.getElementById('f_end').value;
    if(!empId || !start || !end){ document.getElementById('f_error').style.display='block'; return; }
    let days = Number(document.getElementById('f_days').value);
    if(!days){
      const d1 = new Date(start), d2 = new Date(end);
      days = Math.max(Math.round((d2-d1)/86400000)+1, 0.5);
    }
    const emp = employeeById(empId);
    const data = {
      id: rec? rec.id : undefined,
      submitDate: toDateOnly(document.getElementById('f_submitDate').value),
      employeeId: empId,
      employeeName: emp? emp.name : '',
      leaveType: document.getElementById('f_type').value,
      startDate: toDateOnly(start), endDate: toDateOnly(end), days,
      reason: document.getElementById('f_reason').value.trim(),
      note: document.getElementById('f_note').value.trim(),
      approvalStatus: rec ? (rec.approvalStatus||'approved') : (isAdminUser()?'approved':'pending')
    };
    closeModal();
    if(rec) crudUpdate('leaves', data); else crudAdd('leaves', data);
  });
}

function openLeaveDetailModal(id){
  const rec = state.leaves.find(l=>l.id===id);
  if(!rec) return;
  const emp = employeeById(rec.employeeId);
  openModal(`
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:14px;">
        ${avatarHtml(emp,54)}
        <div>
          <h3 style="margin:0 0 3px;">${esc(rec.employeeName)}</h3>
          <div class="muted" style="font-size:13px;">${emp?esc(emp.position):''}</div>
        </div>
      </div>
      ${approvalTag(rec)}
    </div>
    <div class="doc-meta" style="margin-bottom:4px;">
      <div><span class="k">ประเภทการลา: </span>${LEAVE_TYPES[rec.leaveType]||esc(rec.leaveType)}</div>
      <div><span class="k">วันที่ยื่นใบลา: </span>${buddhistDate(rec.submitDate)}</div>
      <div><span class="k">ลาตั้งแต่วันที่: </span>${buddhistDate(rec.startDate)}</div>
      <div><span class="k">ถึงวันที่: </span>${buddhistDate(rec.endDate)}</div>
      <div><span class="k">จำนวนวัน: </span>${rec.days} วัน</div>
      <div></div>
      <div class="field full"><span class="k">เหตุผลการลา: </span>${esc(rec.reason)||'-'}</div>
      <div class="field full"><span class="k">หมายเหตุ: </span>${esc(rec.note)||'-'}</div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="btnCancelModal">ปิด</button>
      ${approvalActionsHtml('leaves', rec)}
      <button class="btn btn-primary" id="btnEditFromDetail">แก้ไขรายการนี้</button>
    </div>
  `);
  bindApprovalButtons(document.getElementById('modalBox'));
  document.getElementById('btnEditFromDetail').addEventListener('click', ()=>{ closeModal(); openLeaveModal(id); });
}

/* ================= LOANS ================= */
function viewLoans(){
  return `
  <div class="page-header">
    <div><h1>บันทึกการกู้ยืม</h1><div class="sub">รวมทั้งหมด ${state.loans.length} สัญญา</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddLoan">+ บันทึกเงินกู้</button></div>
  </div>
  <div class="panel">
    <div class="searchbar">
      <input type="text" id="loanSearch" placeholder="ค้นหาชื่อพนักงาน / เลขที่คำร้อง">
      <select id="loanStatusFilter"><option value="">ทุกสถานะ</option><option value="active">กำลังผ่อน</option><option value="closed">ปิดบัญชีแล้ว</option></select>
      <select id="loanApprovalFilter"><option value="">ทุกการอนุมัติ</option><option value="pending">รออนุมัติ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ไม่อนุมัติ</option></select>
    </div>
    <div class="table-wrap"><table class="reg" id="loanTable">
      <thead><tr>
        <th class="rownum">#</th><th class="num">เลขที่คำร้อง</th><th>พนักงาน</th><th>ประเภท</th>
        <th class="num">วงเงินอนุมัติ</th><th class="num">ผ่อนแล้ว</th><th class="num">คงเหลือ</th><th>สถานะ</th><th>อนุมัติ</th><th>จัดการ</th>
      </tr></thead>
      <tbody></tbody>
    </table></div>
  </div>`;
}

function loanRemaining(l){
  const paid = safeNum(l.paidInstallments)*safeNum(l.installment);
  return Math.max(safeNum(l.approvedAmount)-paid, 0);
}

function loanRows(){
  const q = (document.getElementById('loanSearch')?.value||'').trim().toLowerCase();
  const status = document.getElementById('loanStatusFilter')?.value||'';
  const approval = document.getElementById('loanApprovalFilter')?.value||'';
  return [...state.loans]
    .filter(l=>(!q || [l.employeeName,l.requestNo].some(v=>String(v||'').toLowerCase().includes(q))) && (!status || (l.status||'active')===status) && (!approval || (l.approvalStatus||'approved')===approval))
    .sort((a,b)=> new Date(b.submitDate||0) - new Date(a.submitDate||0));
}

function renderLoanTable(){
  const tbody = document.querySelector('#loanTable tbody');
  if(!tbody) return;
  const rows = loanRows();
  tbody.innerHTML = rows.length ? rows.map((l,i)=>{
    const remaining = loanRemaining(l);
    const status = l.status||'active';
    return `
    <tr class="row-clickable" data-loan-id="${l.id}">
      <td class="rownum">${i+1}</td>
      <td class="num">${esc(l.requestNo)}</td>
      <td>${esc(l.employeeName)}</td>
      <td>${esc(l.loanType)}</td>
      <td class="num">${money(l.approvedAmount)}</td>
      <td class="num">${money(Number(l.paidInstallments||0)*Number(l.installment||0))}</td>
      <td class="num">${money(remaining)}</td>
      <td>${status==='closed'?'<span class="tag tag-green">ปิดบัญชีแล้ว</span>':'<span class="tag tag-amber">กำลังผ่อน</span>'}</td>
      <td>${approvalTag(l)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" data-edit-loan="${l.id}">แก้ไข</button>
        <button class="btn btn-sm btn-danger" data-del-loan="${l.id}">ลบ</button>
        ${approvalActionsHtml('loans', l)}
      </td>
    </tr>`;
  }).join('') : `<tr class="empty-row"><td colspan="10">ยังไม่มีรายการเงินกู้</td></tr>`;
  tbody.querySelectorAll('tr[data-loan-id]').forEach(tr=>{
    tr.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      openLoanDetailModal(tr.dataset.loanId);
    });
  });
  tbody.querySelectorAll('[data-edit-loan]').forEach(b=>b.addEventListener('click', (e)=>{ e.stopPropagation(); openLoanModal(b.dataset.editLoan); }));
  tbody.querySelectorAll('[data-del-loan]').forEach(b=>b.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(confirm('ยืนยันลบรายการเงินกู้นี้?')) crudDelete('loans', b.dataset.delLoan);
  }));
  bindApprovalButtons(tbody);
}

function loanFormHtml(rec){
  const r = rec || {};
  return `
  <h3>${rec?'แก้ไขรายการเงินกู้':'บันทึกเงินกู้ใหม่'}</h3>
  <div class="field-grid">
    <div class="field full"><label>พนักงาน *</label>${employeeFieldHtml(r.employeeId)}</div>
    <div class="field"><label>เลขที่คำร้อง</label><input id="f_reqno" value="${esc(r.requestNo)}"></div>
    <div class="field"><label>วันที่ยื่นคำขอ</label>${thaiDateFieldHtml('f_submitDate', r.submitDate||todayStr())}</div>
    <div class="field"><label>ประเภทเงินกู้</label><select id="f_loanType">${LOAN_TYPES.map(t=>`<option ${r.loanType===t?'selected':''}>${t}</option>`).join('')}</select></div>
    <div class="field"><label>จำนวนเงินที่อนุมัติ *</label><input type="number" id="f_amount" value="${r.approvedAmount??''}"></div>
    <div class="field"><label>ระยะเวลาผ่อน (เดือน)</label><input type="number" id="f_months" value="${r.months??12}"></div>
    <div class="field"><label>ชำระงวดละ (บาท)</label><input type="number" id="f_installment" value="${r.installment??''}"></div>
    <div class="field"><label>งวดที่ผ่อนแล้ว</label><input type="number" id="f_paid" value="${r.paidInstallments??0}"></div>
    <div class="field"><label>ผู้ค้ำประกัน</label><input id="f_guarantor" value="${esc(r.guarantor)}"></div>
    <div class="field"><label>สถานะ</label><select id="f_status">
      <option value="active" ${((r.status||'active')==='active')?'selected':''}>กำลังผ่อน</option>
      <option value="closed" ${r.status==='closed'?'selected':''}>ปิดบัญชีแล้ว</option>
    </select></div>
    <div class="field full"><label>หมายเหตุ</label><textarea id="f_note">${esc(r.note)}</textarea></div>
  </div>
  <div class="field-error" id="f_error">กรุณาเลือกพนักงานและกรอกจำนวนเงินอนุมัติ</div>
  <div class="modal-actions">
    <button class="btn" id="btnCancelModal">ยกเลิก</button>
    <button class="btn btn-primary" id="btnSaveLoan">${rec?'บันทึกการแก้ไข':'บันทึกเงินกู้'}</button>
  </div>`;
}

function openLoanModal(id){
  const rec = id ? state.loans.find(l=>l.id===id) : null;
  openModal(loanFormHtml(rec));
  document.getElementById('btnSaveLoan').addEventListener('click', ()=>{
    const empId = document.getElementById('f_emp').value;
    const amount = Number(document.getElementById('f_amount').value||0);
    if(!empId || !amount){ document.getElementById('f_error').style.display='block'; return; }
    const emp = employeeById(empId);
    const months = Number(document.getElementById('f_months').value||12);
    let installment = Number(document.getElementById('f_installment').value||0);
    if(!installment && months) installment = Math.round((amount/months)*100)/100;
    const data = {
      id: rec? rec.id : undefined,
      requestNo: document.getElementById('f_reqno').value.trim(),
      submitDate: toDateOnly(document.getElementById('f_submitDate').value),
      employeeId: empId, employeeName: emp? emp.name : '',
      loanType: document.getElementById('f_loanType').value,
      approvedAmount: amount, months, installment,
      paidInstallments: Number(document.getElementById('f_paid').value||0),
      guarantor: document.getElementById('f_guarantor').value.trim(),
      status: document.getElementById('f_status').value,
      note: document.getElementById('f_note').value.trim(),
      approvalStatus: rec ? (rec.approvalStatus||'approved') : (isAdminUser()?'approved':'pending')
    };
    closeModal();
    if(rec) crudUpdate('loans', data); else crudAdd('loans', data);
  });
}

function openLoanDetailModal(id){
  const rec = state.loans.find(l=>l.id===id);
  if(!rec) return;
  const emp = employeeById(rec.employeeId);
  const remaining = loanRemaining(rec);
  const status = rec.status||'active';
  openModal(`
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:14px;">
        ${avatarHtml(emp,54)}
        <div>
          <h3 style="margin:0 0 3px;">${esc(rec.employeeName)}</h3>
          <div class="muted" style="font-size:13px;">${emp?esc(emp.position):''}</div>
        </div>
      </div>
      <div style="display:flex; gap:6px;">${approvalTag(rec)}${status==='closed'?'<span class="tag tag-green">ปิดบัญชีแล้ว</span>':'<span class="tag tag-amber">กำลังผ่อน</span>'}</div>
    </div>
    <div class="doc-meta" style="margin-bottom:4px;">
      <div><span class="k">เลขที่คำร้อง: </span>${esc(rec.requestNo)||'-'}</div>
      <div><span class="k">วันที่ยื่นคำขอ: </span>${buddhistDate(rec.submitDate)}</div>
      <div><span class="k">ประเภทเงินกู้: </span>${esc(rec.loanType)}</div>
      <div><span class="k">ผู้ค้ำประกัน: </span>${esc(rec.guarantor)||'-'}</div>
      <div><span class="k">จำนวนเงินอนุมัติ: </span>${money(rec.approvedAmount)} บาท</div>
      <div><span class="k">ระยะเวลาผ่อน: </span>${rec.months||0} เดือน</div>
      <div><span class="k">ชำระงวดละ: </span>${money(rec.installment)} บาท</div>
      <div><span class="k">งวดที่ผ่อนแล้ว: </span>${rec.paidInstallments||0} งวด</div>
      <div><span class="k">คงเหลือ: </span>${money(remaining)} บาท</div>
      <div></div>
      <div class="field full"><span class="k">หมายเหตุ: </span>${esc(rec.note)||'-'}</div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="btnCancelModal">ปิด</button>
      ${approvalActionsHtml('loans', rec)}
      <button class="btn btn-primary" id="btnEditFromDetail">แก้ไขรายการนี้</button>
    </div>
  `);
  bindApprovalButtons(document.getElementById('modalBox'));
  document.getElementById('btnEditFromDetail').addEventListener('click', ()=>{ closeModal(); openLoanModal(id); });
}

