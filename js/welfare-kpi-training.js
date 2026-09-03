/* ===== welfare-kpi-training.js ===== */
/* ================= WELFARE / SOCIAL SECURITY ================= */
function viewWelfare(){
  return `
  <div class="page-header">
    <div><h1>สวัสดิการและประกันสังคม</h1><div class="sub">รวมทั้งหมด ${state.welfare.length} รายการเบิก</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddWelfare">+ บันทึกการเบิก</button></div>
  </div>
  <div class="panel">
    <div class="searchbar">
      <input type="text" id="welfSearch" placeholder="ค้นหาชื่อพนักงาน">
      <select id="welfCatFilter"><option value="">ทุกหมวด</option>${WELFARE_CATS.map(c=>`<option value="${esc(c.label)}">${esc(c.label)}</option>`).join('')}</select>
      <select id="welfApprovalFilter"><option value="">ทุกการอนุมัติ</option><option value="pending">รออนุมัติ</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ไม่อนุมัติ</option></select>
    </div>
    <div class="table-wrap"><table class="reg" id="welfTable">
      <thead><tr>
        <th class="rownum">#</th><th class="num">วันที่ยื่นเบิก</th><th>พนักงาน</th><th>หมวดหมู่</th>
        <th>สถานพยาบาล</th><th class="num">ยอดใบเสร็จ</th><th class="num">ปกส.จ่าย</th><th class="num">อนุมัติเบิก</th><th>สถานะอนุมัติ</th><th>จัดการ</th>
      </tr></thead>
      <tbody></tbody>
    </table></div>
  </div>`;
}

function welfareRows(){
  const q = (document.getElementById('welfSearch')?.value||'').trim().toLowerCase();
  const cat = document.getElementById('welfCatFilter')?.value||'';
  const approval = document.getElementById('welfApprovalFilter')?.value||'';
  return [...state.welfare]
    .filter(w=>(!q || String(w.employeeName||'').toLowerCase().includes(q)) && (!cat || w.category===cat) && (!approval || (w.approvalStatus||'approved')===approval))
    .sort((a,b)=> new Date(b.submitDate||0) - new Date(a.submitDate||0));
}

function renderWelfareTable(){
  const tbody = document.querySelector('#welfTable tbody');
  if(!tbody) return;
  const rows = welfareRows();
  tbody.innerHTML = rows.length ? rows.map((w,i)=>`
    <tr class="row-clickable" data-welf-id="${w.id}">
      <td class="rownum">${i+1}</td>
      <td class="num">${buddhistDate(w.submitDate)}</td>
      <td>${esc(w.employeeName)}</td>
      <td><span class="tag tag-navy">${esc(w.category)}</span></td>
      <td>${esc(w.hospital)}</td>
      <td class="num">${money(w.receiptAmount)}</td>
      <td class="num">${money(w.ssoPaid)}</td>
      <td class="num">${money(w.approvedAmount)}</td>
      <td>${approvalTag(w)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" data-edit-welf="${w.id}">แก้ไข</button>
        <button class="btn btn-sm btn-danger" data-del-welf="${w.id}">ลบ</button>
        ${approvalActionsHtml('welfare', w)}
      </td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="10">ยังไม่มีรายการเบิกสวัสดิการ</td></tr>`;
  tbody.querySelectorAll('tr[data-welf-id]').forEach(tr=>{
    tr.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      openWelfareDetailModal(tr.dataset.welfId);
    });
  });
  tbody.querySelectorAll('[data-edit-welf]').forEach(b=>b.addEventListener('click', (e)=>{ e.stopPropagation(); openWelfareModal(b.dataset.editWelf); }));
  tbody.querySelectorAll('[data-del-welf]').forEach(b=>b.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(confirm('ยืนยันลบรายการนี้?')) crudDelete('welfare', b.dataset.delWelf);
  }));
  bindApprovalButtons(tbody);
}

function welfareFormHtml(rec){
  const r = rec || {};
  return `
  <h3>${rec?'แก้ไขรายการเบิกสวัสดิการ':'บันทึกการเบิกสวัสดิการใหม่'}</h3>
  <div class="field-grid">
    <div class="field full"><label>พนักงาน *</label>${employeeFieldHtml(r.employeeId)}</div>
    <div class="field"><label>วันที่ยื่นเบิก</label>${thaiDateFieldHtml('f_submitDate', r.submitDate||todayStr())}</div>
    <div class="field"><label>หมวดหมู่ *</label><select id="f_cat">${WELFARE_CATS.map(c=>`<option value="${esc(c.label)}" ${r.category===c.label?'selected':''}>${esc(c.label)}</option>`).join('')}</select></div>
    <div class="field"><label>สถานพยาบาล/คลินิก</label><input id="f_hospital" value="${esc(r.hospital)}"></div>
    <div class="field"><label>รายการ/หัตถการ</label><input id="f_procedure" value="${esc(r.procedure)}"></div>
    <div class="field"><label>จำนวนเงินตามใบเสร็จ *</label><input type="number" id="f_receipt" value="${r.receiptAmount??''}"></div>
    <div class="field"><label>ประกันสังคมจ่าย</label><input type="number" id="f_sso" value="${r.ssoPaid??0}"></div>
    <div class="field"><label>อนุมัติให้เบิก (จากสวัสดิการ)</label><input type="number" id="f_approved" value="${r.approvedAmount??''}" placeholder="คำนวณอัตโนมัติถ้าเว้นว่าง"></div>
    <div class="field"><label>เลขที่คำร้อง</label><input id="f_reqno" value="${esc(r.requestNo)}"></div>
    <div class="field full"><label>หมายเหตุ</label><textarea id="f_note">${esc(r.note)}</textarea></div>
  </div>
  <div class="field-error" id="f_error">กรุณาเลือกพนักงานและกรอกยอดใบเสร็จ</div>
  <div class="modal-actions">
    <button class="btn" id="btnCancelModal">ยกเลิก</button>
    <button class="btn btn-primary" id="btnSaveWelfare">${rec?'บันทึกการแก้ไข':'บันทึกการเบิก'}</button>
  </div>`;
}

function openWelfareModal(id){
  const rec = id ? state.welfare.find(w=>w.id===id) : null;
  openModal(welfareFormHtml(rec));
  document.getElementById('btnSaveWelfare').addEventListener('click', ()=>{
    const empId = document.getElementById('f_emp').value;
    const receipt = Number(document.getElementById('f_receipt').value||0);
    if(!empId || !receipt){ document.getElementById('f_error').style.display='block'; return; }
    const emp = employeeById(empId);
    const sso = Number(document.getElementById('f_sso').value||0);
    let approved = Number(document.getElementById('f_approved').value);
    if(!approved) approved = Math.max(receipt - sso, 0);
    const data = {
      id: rec? rec.id : undefined,
      submitDate: toDateOnly(document.getElementById('f_submitDate').value),
      employeeId: empId, employeeName: emp? emp.name : '',
      category: document.getElementById('f_cat').value,
      hospital: document.getElementById('f_hospital').value.trim(),
      procedure: document.getElementById('f_procedure').value.trim(),
      receiptAmount: receipt, ssoPaid: sso, approvedAmount: approved,
      beneficiaryName: emp? emp.name : '', relation: 'ตนเอง',
      requestNo: document.getElementById('f_reqno').value.trim(),
      note: document.getElementById('f_note').value.trim(),
      approvalStatus: rec ? (rec.approvalStatus||'approved') : (isAdminUser()?'approved':'pending')
    };
    closeModal();
    if(rec) crudUpdate('welfare', data); else crudAdd('welfare', data);
  });
}

function openWelfareDetailModal(id){
  const rec = state.welfare.find(w=>w.id===id);
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
      <div><span class="k">หมวดหมู่: </span>${esc(rec.category)}</div>
      <div><span class="k">วันที่ยื่นเบิก: </span>${buddhistDate(rec.submitDate)}</div>
      <div><span class="k">สถานพยาบาล: </span>${esc(rec.hospital)||'-'}</div>
      <div><span class="k">เลขที่คำร้อง: </span>${esc(rec.requestNo)||'-'}</div>
      <div><span class="k">รายการ/หัตถการ: </span>${esc(rec.procedure)||'-'}</div>
      <div></div>
      <div><span class="k">ยอดใบเสร็จ: </span>${money(rec.receiptAmount)} บาท</div>
      <div><span class="k">ประกันสังคมจ่าย: </span>${money(rec.ssoPaid)} บาท</div>
      <div><span class="k">อนุมัติให้เบิก: </span>${money(rec.approvedAmount)} บาท</div>
      <div></div>
      <div class="field full"><span class="k">หมายเหตุ: </span>${esc(rec.note)||'-'}</div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="btnCancelModal">ปิด</button>
      ${approvalActionsHtml('welfare', rec)}
      <button class="btn btn-primary" id="btnEditFromDetail">แก้ไขรายการนี้</button>
    </div>
  `);
  bindApprovalButtons(document.getElementById('modalBox'));
  document.getElementById('btnEditFromDetail').addEventListener('click', ()=>{ closeModal(); openWelfareModal(id); });
}

/* ================= KPI (admin management) ================= */
const KPI_PERIODS = ['ประจำปี','รอบที่ 1 (ต.ค.-มี.ค.)','รอบที่ 2 (เม.ย.-ก.ย.)'];

function viewKpi(){
  return `
  <div class="page-header">
    <div><h1>ประเมินผลงาน KPI</h1><div class="sub">รวมทั้งหมด ${state.kpi.length} รายการประเมิน</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddKpi">+ บันทึกผลประเมิน</button></div>
  </div>
  <div class="panel">
    <div class="searchbar">
      <input type="text" id="kpiSearch" placeholder="ค้นหาชื่อพนักงาน">
      <select id="kpiYearFilter"><option value="">ทุกปี</option>${[...new Set(state.kpi.map(k=>k.year))].filter(Boolean).sort().reverse().map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('')}</select>
    </div>
    <div class="table-wrap"><table class="reg" id="kpiTable">
      <thead><tr><th class="rownum">#</th><th>พนักงาน</th><th>ปี</th><th>รอบ</th><th class="num">คะแนนรวม</th><th>ระดับ</th><th>ผู้ประเมิน</th><th>จัดการ</th></tr></thead>
      <tbody></tbody>
    </table></div>
  </div>`;
}

function kpiRows(){
  const q = (document.getElementById('kpiSearch')?.value||'').trim().toLowerCase();
  const year = document.getElementById('kpiYearFilter')?.value||'';
  return [...state.kpi]
    .filter(k=>(!q || String(k.employeeName||'').toLowerCase().includes(q)) && (!year || k.year===year))
    .sort((a,b)=> (b.year||'').localeCompare(a.year||''));
}

function renderKpiTable(){
  const tbody = document.querySelector('#kpiTable tbody');
  if(!tbody) return;
  const rows = kpiRows();
  tbody.innerHTML = rows.length ? rows.map((k,i)=>{
    const grade = k.grade || gradeFromScore(safeNum(k.overallScore));
    return `<tr class="row-clickable" data-kpi-id="${k.id}">
      <td class="rownum">${i+1}</td><td>${esc(k.employeeName)}</td><td>${esc(k.year)}</td><td>${esc(k.period)}</td>
      <td class="num">${safeNum(k.overallScore).toFixed(1)}</td><td><span class="tag tag-navy">${esc(grade)}</span></td>
      <td>${esc(k.evaluator)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" data-edit-kpi="${k.id}">แก้ไข</button>
        <button class="btn btn-sm btn-danger" data-del-kpi="${k.id}">ลบ</button>
      </td>
    </tr>`;
  }).join('') : `<tr class="empty-row"><td colspan="8">ยังไม่มีผลการประเมิน</td></tr>`;
  tbody.querySelectorAll('tr[data-kpi-id]').forEach(tr=>tr.addEventListener('click', (e)=>{
    if(e.target.closest('button')) return;
    openKpiModal(tr.dataset.kpiId, true);
  }));
  tbody.querySelectorAll('[data-edit-kpi]').forEach(b=>b.addEventListener('click', (e)=>{ e.stopPropagation(); openKpiModal(b.dataset.editKpi); }));
  tbody.querySelectorAll('[data-del-kpi]').forEach(b=>b.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(confirm('ยืนยันลบผลการประเมินนี้?')) crudDelete('kpi', b.dataset.delKpi);
  }));
}

function kpiFormHtml(rec){
  const r = rec || {};
  return `
  <h3>${rec?'แก้ไขผลประเมิน KPI':'บันทึกผลประเมิน KPI ใหม่'}</h3>
  <div class="field-grid">
    <div class="field full"><label>พนักงาน *</label><select id="f_emp"><option value="">-- เลือกพนักงาน --</option>${empOptionsHtml(r.employeeId)}</select></div>
    <div class="field"><label>ปีงบประมาณ (พ.ศ.)</label><input id="f_year" placeholder="เช่น 2569" value="${esc(r.year || (new Date().getFullYear()+543))}"></div>
    <div class="field"><label>รอบการประเมิน</label><select id="f_period">${KPI_PERIODS.map(p=>`<option ${r.period===p?'selected':''}>${p}</option>`).join('')}</select></div>
    <div class="field"><label>คุณภาพงาน (0-100)</label><input type="number" min="0" max="100" id="f_quality" value="${r.scoreQuality??80}"></div>
    <div class="field"><label>ปริมาณงาน (0-100)</label><input type="number" min="0" max="100" id="f_quantity" value="${r.scoreQuantity??80}"></div>
    <div class="field"><label>ความรับผิดชอบ (0-100)</label><input type="number" min="0" max="100" id="f_responsibility" value="${r.scoreResponsibility??80}"></div>
    <div class="field"><label>ทำงานร่วมกับผู้อื่น (0-100)</label><input type="number" min="0" max="100" id="f_teamwork" value="${r.scoreTeamwork??80}"></div>
    <div class="field"><label>ระเบียบวินัย (0-100)</label><input type="number" min="0" max="100" id="f_discipline" value="${r.scoreDiscipline??80}"></div>
    <div class="field"><label>วันที่ประเมิน</label>${thaiDateFieldHtml('f_evaluatedDate', r.evaluatedDate || todayStr())}</div>
    <div class="field"><label>ผู้ประเมิน</label><input id="f_evaluator" value="${esc(r.evaluator)}"></div>
    <div class="field"></div>
    <div class="field full"><label>ความคิดเห็นเพิ่มเติม</label><textarea id="f_comments">${esc(r.comments)}</textarea></div>
  </div>
  <div class="field-error" id="f_error">กรุณาเลือกพนักงาน</div>
  <div class="modal-actions">
    <button class="btn" id="btnCancelModal">ยกเลิก</button>
    <button class="btn btn-primary" id="btnSaveKpi">${rec?'บันทึกการแก้ไข':'บันทึกผลประเมิน'}</button>
  </div>`;
}

function openKpiModal(id, readonly){
  const rec = id ? state.kpi.find(k=>k.id===id) : null;
  if(readonly && rec){
    const grade = rec.grade || gradeFromScore(safeNum(rec.overallScore));
    const emp = employeeById(rec.employeeId);
    openModal(`
      <div style="display:flex; align-items:center; gap:14px; margin-bottom:16px;">
        ${avatarHtml(emp,54)}
        <div><h3 style="margin:0 0 3px;">${esc(rec.employeeName)}</h3><div class="muted" style="font-size:13px;">${esc(rec.year)} · ${esc(rec.period)}</div></div>
      </div>
      ${kpiCardHtml(rec).replace(/<div class="panel">|<\/div>\s*$/g,'')}
      <div class="modal-actions">
        <button class="btn" id="btnCancelModal">ปิด</button>
        <button class="btn btn-primary" id="btnEditFromDetail">แก้ไข</button>
      </div>
    `);
    document.getElementById('btnEditFromDetail').addEventListener('click', ()=>{ closeModal(); openKpiModal(id); });
    return;
  }
  openModal(kpiFormHtml(rec));
  initThaiDatePickers(document.getElementById('modalBox'));
  document.getElementById('btnSaveKpi').addEventListener('click', ()=>{
    const empId = document.getElementById('f_emp').value;
    if(!empId){ document.getElementById('f_error').style.display='block'; return; }
    const emp = employeeById(empId);
    const scores = {
      scoreQuality: safeNum(document.getElementById('f_quality').value),
      scoreQuantity: safeNum(document.getElementById('f_quantity').value),
      scoreResponsibility: safeNum(document.getElementById('f_responsibility').value),
      scoreTeamwork: safeNum(document.getElementById('f_teamwork').value),
      scoreDiscipline: safeNum(document.getElementById('f_discipline').value)
    };
    const overall = (scores.scoreQuality+scores.scoreQuantity+scores.scoreResponsibility+scores.scoreTeamwork+scores.scoreDiscipline)/5;
    const data = {
      id: rec? rec.id : undefined,
      employeeId: empId, employeeName: emp?emp.name:'',
      year: document.getElementById('f_year').value.trim(),
      period: document.getElementById('f_period').value,
      ...scores,
      overallScore: Math.round(overall*10)/10,
      grade: gradeFromScore(overall),
      evaluator: document.getElementById('f_evaluator').value.trim(),
      comments: document.getElementById('f_comments').value.trim(),
      evaluatedDate: toDateOnly(document.getElementById('f_evaluatedDate').value)
    };
    closeModal();
    if(rec) crudUpdate('kpi', data); else crudAdd('kpi', data);
  });
}

/* ================= TRAINING ================= */
const TRAINING_TYPES = ['อบรม','สัมมนา','ศึกษาดูงาน','ประชุมเชิงปฏิบัติการ','อื่นๆ'];

function viewTraining(){
  return `
  <div class="page-header">
    <div><h1>ฝึกอบรมและพัฒนาบุคลากร</h1><div class="sub">รวมทั้งหมด ${state.training.length} รายการ</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddTraining">+ บันทึกการอบรม</button></div>
  </div>
  <div class="panel">
    <div class="searchbar">
      <input type="text" id="trainingSearch" placeholder="ค้นหาชื่อพนักงาน / หลักสูตร">
      <select id="trainingTypeFilter"><option value="">ทุกประเภท</option>${TRAINING_TYPES.map(t=>`<option>${t}</option>`).join('')}</select>
    </div>
    <div class="table-wrap"><table class="reg" id="trainingTable">
      <thead><tr><th class="rownum">#</th><th>พนักงาน</th><th>หลักสูตร</th><th>ประเภท</th><th class="num">วันที่</th><th class="num">ชั่วโมง</th><th>จัดการ</th></tr></thead>
      <tbody></tbody>
    </table></div>
  </div>`;
}

function trainingRows(){
  const q = (document.getElementById('trainingSearch')?.value||'').trim().toLowerCase();
  const type = document.getElementById('trainingTypeFilter')?.value||'';
  return [...state.training]
    .filter(t=>(!q || [t.employeeName,t.courseName].some(v=>String(v||'').toLowerCase().includes(q))) && (!type || t.trainingType===type))
    .sort((a,b)=> new Date(b.startDate||0)-new Date(a.startDate||0));
}

function renderTrainingTable(){
  const tbody = document.querySelector('#trainingTable tbody');
  if(!tbody) return;
  const rows = trainingRows();
  tbody.innerHTML = rows.length ? rows.map((t,i)=>`
    <tr>
      <td class="rownum">${i+1}</td><td>${esc(t.employeeName)}</td><td>${esc(t.courseName)}</td>
      <td><span class="tag tag-navy">${esc(t.trainingType)}</span></td>
      <td class="num">${buddhistDate(t.startDate)}</td><td class="num">${safeNum(t.hours)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" data-edit-training="${t.id}">แก้ไข</button>
        <button class="btn btn-sm btn-danger" data-del-training="${t.id}">ลบ</button>
      </td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="7">ยังไม่มีประวัติการอบรม</td></tr>`;
  tbody.querySelectorAll('[data-edit-training]').forEach(b=>b.addEventListener('click', ()=>openTrainingModal(b.dataset.editTraining)));
  tbody.querySelectorAll('[data-del-training]').forEach(b=>b.addEventListener('click', ()=>{
    if(confirm('ยืนยันลบรายการนี้?')) crudDelete('training', b.dataset.delTraining);
  }));
}

function trainingFormHtml(rec){
  const r = rec || {};
  return `
  <h3>${rec?'แก้ไขประวัติการอบรม':'บันทึกการอบรมใหม่'}</h3>
  <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid var(--line);">
    <div id="trainingCertPreview" style="width:56px; height:56px; border-radius:10px; overflow:hidden; flex-shrink:0; border:1px solid var(--line-strong); display:flex; align-items:center; justify-content:center; background:var(--lav-bg);">
      ${r.certificateUrl? `<img src="${esc(r.certificateUrl)}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="color:var(--lav-deep); font-size:11px;">ใบประกาศ</span>'}
    </div>
    <div>
      <label class="btn btn-sm" style="cursor:pointer;">อัปโหลดใบประกาศ<input type="file" id="f_certFile" accept="image/*" style="display:none;"></label>
      <div id="f_certStatus" style="font-size:12px; color:var(--ink-soft); margin-top:6px;"></div>
      <input type="hidden" id="f_certUrl" value="${esc(r.certificateUrl)}">
    </div>
  </div>
  <div class="field-grid">
    <div class="field full"><label>พนักงาน *</label><select id="f_emp"><option value="">-- เลือกพนักงาน --</option>${empOptionsHtml(r.employeeId)}</select></div>
    <div class="field full"><label>ชื่อหลักสูตร *</label><input id="f_courseName" value="${esc(r.courseName)}"></div>
    <div class="field"><label>หน่วยงานจัดอบรม</label><input id="f_organizer" value="${esc(r.organizer)}"></div>
    <div class="field"><label>ประเภท</label><select id="f_trainingType">${TRAINING_TYPES.map(t=>`<option ${r.trainingType===t?'selected':''}>${t}</option>`).join('')}</select></div>
    <div class="field"><label>วันที่เริ่ม</label>${thaiDateFieldHtml('f_startDate', r.startDate || todayStr())}</div>
    <div class="field"><label>วันที่สิ้นสุด</label>${thaiDateFieldHtml('f_endDate', r.endDate || r.startDate || todayStr())}</div>
    <div class="field"><label>จำนวนชั่วโมง</label><input type="number" id="f_hours" value="${r.hours??6}"></div>
    <div class="field"><label>ค่าใช้จ่าย (บาท)</label><input type="number" id="f_cost" value="${r.cost??0}"></div>
    <div class="field full"><label>หมายเหตุ</label><textarea id="f_note">${esc(r.note)}</textarea></div>
  </div>
  <div class="field-error" id="f_error">กรุณาเลือกพนักงานและกรอกชื่อหลักสูตร</div>
  <div class="modal-actions">
    <button class="btn" id="btnCancelModal">ยกเลิก</button>
    <button class="btn btn-primary" id="btnSaveTraining">${rec?'บันทึกการแก้ไข':'บันทึกการอบรม'}</button>
  </div>`;
}

function openTrainingModal(id){
  const rec = id ? state.training.find(t=>t.id===id) : null;
  openModal(trainingFormHtml(rec));
  initThaiDatePickers(document.getElementById('modalBox'));
  document.getElementById('f_certFile').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const statusEl = document.getElementById('f_certStatus');
    if(!cloudinaryReady()){ toast('กรุณาตั้งค่า Cloudinary ในหน้าตั้งค่าก่อนอัปโหลด'); return; }
    statusEl.textContent = 'กำลังอัปโหลด... 0%';
    try{
      const url = await uploadToCloudinary(file, (p)=>{ statusEl.textContent = 'กำลังอัปโหลด... '+p+'%'; });
      document.getElementById('f_certUrl').value = url;
      document.getElementById('trainingCertPreview').innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;">`;
      statusEl.textContent = 'อัปโหลดสำเร็จ';
    }catch(err){ statusEl.textContent=''; toast('อัปโหลดไม่สำเร็จ: '+err.message); }
  });
  document.getElementById('btnSaveTraining').addEventListener('click', ()=>{
    const empId = document.getElementById('f_emp').value;
    const courseName = document.getElementById('f_courseName').value.trim();
    if(!empId || !courseName){ document.getElementById('f_error').style.display='block'; return; }
    const emp = employeeById(empId);
    const data = {
      id: rec? rec.id : undefined,
      employeeId: empId, employeeName: emp?emp.name:'',
      courseName, organizer: document.getElementById('f_organizer').value.trim(),
      trainingType: document.getElementById('f_trainingType').value,
      startDate: toDateOnly(document.getElementById('f_startDate').value),
      endDate: toDateOnly(document.getElementById('f_endDate').value),
      hours: safeNum(document.getElementById('f_hours').value),
      cost: safeNum(document.getElementById('f_cost').value),
      certificateUrl: document.getElementById('f_certUrl').value.trim(),
      note: document.getElementById('f_note').value.trim()
    };
    closeModal();
    if(rec) crudUpdate('training', data); else crudAdd('training', data);
  });
}

