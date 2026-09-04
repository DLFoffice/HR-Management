/* ===== employees-orgchart.js ===== */
/* ================= EMPLOYEES ================= */
function viewEmployees(){
  return `
  <div class="page-header">
    <div><h1>ข้อมูลพนักงาน</h1><div class="sub">ทะเบียนพนักงานทั้งหมด ${state.employees.length} คน</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddEmp">+ เพิ่มพนักงาน</button></div>
  </div>
  <div class="searchbar">
    <input type="text" id="empSearch" placeholder="ค้นหาชื่อ / รหัส / ตำแหน่ง">
    <select id="empDeptFilter"><option value="">ทุกสังกัด</option>${[...new Set(state.employees.map(e=>e.department).filter(Boolean))].sort((a,b)=>deptSortKey(a)-deptSortKey(b)).map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select>
  </div>
  <div id="empGroups"></div>`;
}

function employeeRows(){
  const q = (document.getElementById('empSearch')?.value||'').trim().toLowerCase();
  const dept = document.getElementById('empDeptFilter')?.value||'';
  return state.employees.filter(e=>{
    const matchQ = !q || [e.code,e.name,e.position].some(v=>String(v||'').toLowerCase().includes(q));
    const matchD = !dept || e.department===dept;
    return matchQ && matchD;
  });
}

function groupEmployeesByDept(rows){
  const groups = {};
  rows.forEach(e=>{
    const d = e.department || 'ไม่ระบุสังกัด';
    if(!groups[d]) groups[d] = [];
    groups[d].push(e);
  });
  return Object.keys(groups)
    .sort((a,b)=> deptSortKey(a)-deptSortKey(b) || a.localeCompare(b,'th'))
    .map(d=>({ dept: d, list: groups[d] }));
}

function renderEmployeeTable(){
  const root = document.getElementById('empGroups');
  if(!root) return;
  const rows = employeeRows();
  if(rows.length === 0){
    root.innerHTML = `<div class="panel"><table class="reg"><tbody><tr class="empty-row"><td>ยังไม่มีข้อมูลพนักงานที่ตรงกับเงื่อนไข</td></tr></tbody></table></div>`;
    return;
  }
  const groups = groupEmployeesByDept(rows);
  root.innerHTML = groups.map(g => `
    <div class="panel dept-box">
      <h2>${esc(g.dept)} <span class="dept-count">${g.list.length} คน</span></h2>
      <div class="table-wrap"><table class="reg">
        <thead><tr>
          <th class="rownum">#</th><th class="num">รหัส</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th>
          <th class="num">อายุ</th><th class="num">วันเกษียณ</th><th>จัดการ</th>
        </tr></thead>
        <tbody>
          ${g.list.map((e,i)=>`
          <tr class="row-clickable" data-emp-id="${e.id}">
            <td class="rownum">${i+1}</td>
            <td class="num">${esc(e.code)}</td>
            <td>${avatarHtml(e,28)} <span style="margin-left:8px;">${esc(e.name)}</span></td>
            <td>${esc(e.position)}</td>
            <td class="num">${ageFromDate(e.birthDate)}</td>
            <td class="num">${buddhistDate(e.retireDate)}</td>
            <td>
              <button class="btn btn-sm" data-edit-emp="${e.id}">แก้ไข</button>
              <button class="btn btn-sm btn-danger" data-del-emp="${e.id}">ลบ</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
  `).join('');

  root.querySelectorAll('tr[data-emp-id]').forEach(tr=>{
    tr.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      openEmployeeDetailModal(tr.dataset.empId);
    });
  });
  root.querySelectorAll('[data-edit-emp]').forEach(b=>b.addEventListener('click', (e)=>{ e.stopPropagation(); openEmployeeModal(b.dataset.editEmp); }));
  root.querySelectorAll('[data-del-emp]').forEach(b=>b.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(confirm('ยืนยันลบข้อมูลพนักงานนี้?')){
      const emp = employeeById(b.dataset.delEmp);
      if(emp && emp.idCard) firestoreDeleteLogin(emp.idCard);
      crudDelete('employees', b.dataset.delEmp);
    }
  }));
}

function employeeFormHtml(emp){
  const e = emp || {};
  return `
  <h3>${emp? 'แก้ไขข้อมูลพนักงาน':'เพิ่มพนักงานใหม่'}</h3>
  <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid var(--line);">
    <div id="empPhotoPreview" style="width:68px; height:68px; border-radius:50%; overflow:hidden; flex-shrink:0; border:1px solid var(--line-strong); display:flex; align-items:center; justify-content:center; background:var(--lav-bg);">
      ${e.photoUrl? `<img src="${esc(e.photoUrl)}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="color:var(--lav-deep); font-size:22px; font-weight:600;">?</span>'}
    </div>
    <div>
      <label class="btn btn-sm" style="cursor:pointer;">อัปโหลดรูปพนักงาน<input type="file" id="f_photoFile" accept="image/*" style="display:none;"></label>
      <div id="f_photoStatus" style="font-size:12px; color:var(--ink-soft); margin-top:6px;"></div>
      <input type="hidden" id="f_photoUrl" value="${esc(e.photoUrl)}">
    </div>
  </div>
  <div class="field-grid">
    <div class="field"><label>รหัสพนักงาน</label><input id="f_code" value="${esc(e.code)}"></div>
    <div class="field"><label>เลขบัตรประชาชน (สำหรับล็อกอิน) *</label><input id="f_idCard" maxlength="13" placeholder="13 หลัก ไม่ต้องมีขีด" value="${esc(e.idCard)}"></div>
    <div class="field"><label>ชื่อ - นามสกุล *</label><input id="f_name" value="${esc(e.name)}"></div>
    <div class="field"><label>ตำแหน่ง</label><input id="f_position" value="${esc(e.position)}"></div>
    <div class="field"><label>กลุ่ม/กลุ่มงาน</label><input id="f_department" value="${esc(e.department)}"></div>
    <div class="field"><label>วันเดือนปีเกิด</label>${thaiDateFieldHtml('f_birthDate', e.birthDate)}</div>
    <div class="field"><label>วันเข้าทำงาน</label>${thaiDateFieldHtml('f_hireDate', e.hireDate)}</div>
    <div class="field"><label>วันเกษียณอายุ</label>${thaiDateFieldHtml('f_retireDate', e.retireDate)}</div>
    <div class="field"></div>
    <div class="field"><label>สิทธิ์ลาป่วย (วัน/ปี)</label><input type="number" id="f_sickRight" value="${e.sickRight??60}"></div>
    <div class="field"><label>สิทธิ์ลาพักผ่อน (วัน/ปี)</label><input type="number" id="f_vacationRight" value="${e.vacationRight??10}"></div>
    <div class="field"><label>สิทธิ์ลากิจ (วัน/ปี)</label><input type="number" id="f_personalRight" value="${e.personalRight??15}"></div>
    <div class="field"></div>
    <div class="field"><label>ลาป่วยสะสมยกมา</label><input type="number" id="f_carrySick" value="${e.carrySick??0}"></div>
    <div class="field"><label>ลาพักผ่อนสะสมยกมา</label><input type="number" id="f_carryVacation" value="${e.carryVacation??0}"></div>
    <div class="field"><label>ลากิจสะสมยกมา</label><input type="number" id="f_carryPersonal" value="${e.carryPersonal??0}"></div>
    <div class="field"></div>
    <div class="field"><label>วงเงินสวัสดิการ (บาท)</label><input type="number" id="f_welfareLimit" value="${e.welfareLimit??30000}"></div>
    <div class="field"><label>วงเงินกู้สามัญ (บาท)</label><input type="number" id="f_loanNormalLimit" value="${e.loanNormalLimit??50000}"></div>
    <div class="field"><label>วงเงินกู้ฉุกเฉิน (บาท)</label><input type="number" id="f_loanEmergencyLimit" value="${e.loanEmergencyLimit??5000}"></div>
    <div class="field"></div>
    <div class="field"><label>สิทธิ์ อุด/ถอน/ขูด (บาท)</label><input type="number" id="f_dentalFilling" value="${e.dentalFilling??900}"></div>
    <div class="field"><label>สิทธิ์ผ่าฟันคุด (บาท)</label><input type="number" id="f_dentalSurgery" value="${e.dentalSurgery??2500}"></div>
    <div class="field"><label>สิทธิ์รากฟันเทียม (บาท)</label><input type="number" id="f_dentalImplant" value="${e.dentalImplant??20800}"></div>
    <div class="field"><label>สิทธิ์ฟันปลอม (บาท)</label><input type="number" id="f_denture" value="${e.denture??6000}"></div>
  </div>
  <div class="field-error" id="f_error">กรุณากรอกชื่อ - นามสกุล</div>
  <div class="modal-actions">
    <button class="btn" id="btnCancelModal">ยกเลิก</button>
    <button class="btn btn-primary" id="btnSaveEmp">${emp?'บันทึกการแก้ไข':'บันทึกพนักงานใหม่'}</button>
  </div>`;
}

function openEmployeeDetailModal(id){
  const emp = employeeById(id);
  if(!emp) return;
  const summary = computeEmployeeSummary(id);
  openModal(`
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:4px;">
      <div style="display:flex; align-items:center; gap:16px;">
        ${avatarHtml(emp,72)}
        <div>
          <h3 style="margin:0 0 3px;">${esc(emp.name)}</h3>
          <div class="muted" style="font-size:13px;">${esc(emp.position)} ${emp.department? '· '+esc(emp.department):''}</div>
        </div>
      </div>
    </div>
    <div style="max-height:56vh; overflow-y:auto; overflow-x:auto; margin-top:16px; padding-right:4px;">
      ${individualReportHtml(summary, false, true)}
    </div>
    <div class="modal-actions">
      <button class="btn" id="btnCancelModal">ปิด</button>
      <button class="btn btn-primary" id="btnEditFromDetail">แก้ไขข้อมูลพนักงาน</button>
    </div>
  `, 760);
  document.getElementById('btnEditFromDetail').addEventListener('click', ()=>{ closeModal(); openEmployeeModal(id); });
}

function openEmployeeModal(id){
  const emp = id ? employeeById(id) : null;
  openModal(employeeFormHtml(emp));
  document.getElementById('f_photoFile').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const statusEl = document.getElementById('f_photoStatus');
    if(!cloudinaryReady()){ toast('กรุณาตั้งค่า Cloudinary ในหน้าตั้งค่าก่อนอัปโหลดรูป'); return; }
    statusEl.textContent = 'กำลังอัปโหลด... 0%';
    try{
      const url = await uploadToCloudinary(file, (p)=>{ statusEl.textContent = 'กำลังอัปโหลด... '+p+'%'; });
      document.getElementById('f_photoUrl').value = url;
      document.getElementById('empPhotoPreview').innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;">`;
      statusEl.textContent = 'อัปโหลดสำเร็จ';
    }catch(err){
      statusEl.textContent = '';
      toast('อัปโหลดไม่สำเร็จ: '+err.message);
    }
  });
  document.getElementById('btnSaveEmp').addEventListener('click', ()=>{
    const name = document.getElementById('f_name').value.trim();
    if(!name){ document.getElementById('f_error').style.display='block'; return; }
    const data = {
      id: emp? emp.id : undefined,
      code: document.getElementById('f_code').value.trim(),
      idCard: document.getElementById('f_idCard').value.trim(),
      name,
      position: document.getElementById('f_position').value.trim(),
      department: document.getElementById('f_department').value.trim(),
      birthDate: toDateOnly(document.getElementById('f_birthDate').value),
      hireDate: toDateOnly(document.getElementById('f_hireDate').value),
      retireDate: toDateOnly(document.getElementById('f_retireDate').value),
      sickRight: Number(document.getElementById('f_sickRight').value||0),
      vacationRight: Number(document.getElementById('f_vacationRight').value||0),
      personalRight: Number(document.getElementById('f_personalRight').value||0),
      carrySick: Number(document.getElementById('f_carrySick').value||0),
      carryVacation: Number(document.getElementById('f_carryVacation').value||0),
      carryPersonal: Number(document.getElementById('f_carryPersonal').value||0),
      welfareLimit: Number(document.getElementById('f_welfareLimit').value||0),
      loanNormalLimit: Number(document.getElementById('f_loanNormalLimit').value||0),
      loanEmergencyLimit: Number(document.getElementById('f_loanEmergencyLimit').value||0),
      dentalFilling: Number(document.getElementById('f_dentalFilling').value||0),
      dentalSurgery: Number(document.getElementById('f_dentalSurgery').value||0),
      dentalImplant: Number(document.getElementById('f_dentalImplant').value||0),
      denture: Number(document.getElementById('f_denture').value||0),
      photoUrl: document.getElementById('f_photoUrl').value.trim()
    };
    closeModal();
    if(emp) crudUpdate('employees', data); else crudAdd('employees', data);
    if(data.idCard) firestoreSaveLogin(data.idCard, data.id, data.name);
  });
}

/* ================= ORGANIZATION CHART ================= */
const ORG_CHART_DATA = {
  head: { name:'นายเชิดศักดิ์ ศรีศักดิ์วิชัย', fallbackTitle:'หัวหน้าสำนักงานฯ' },
  groups: [
    { title:'กลุ่มบริหารงานทั่วไป', members:['นางสาวจรรยา พลสมัคร','นางสาวฐิติรัตน์ มากใย','นางสาวสงวน ชัยสูงเนิน','นางสาวศรุดา สถานนท์ชัย','นางสาวกมลวรรณ คล้ายมาก','นางสาวรินรดา ฤษฎีร'] },
    { title:'กลุ่มการเงินและบัญชี', members:['นางอุราภรณ์ มูลตรี','นางสาวปัญจรัตน์ พลอยมีค่า','นางวณิชญาย์ ทางธรรม','นางสาววิภาวรรณ อยู่อุบล'] },
    { title:'กลุ่มงานสนับสนุน', members:['นางสาวณัฎฐา ปัดแก้ว','นายอนุชัย แก้วสระเสน','นางสาวพจนีย์ ไทรชมภู','นายปานัฐ เกิดผล','นายขวัญชัย มาเกิด','นายอดิศร แสงไชย','นายพิษณุพจน์ สิทธิธนาสกุล'] },
    { title:'กลุ่มวิชาการ', members:['ดร.วิภา ตัณฑุลพงษ์','นางสาวณัฐพร เผือดจันทึก','นางสาวนิสาชล แสงฟ้า','นายพันธ์พัทธ์ ชัยด้วง','นางสาวทิพจุฑา ชุนเกษา','นางศิริรัตน์ มูลไชยศรี'] },
    { title:'กลุ่มนโยบายและแผน', members:['นางสาวจินตนา วรรณยง','นายอดิพงษ์ วรรณยศ','นางสาววันทิวา สอนน้อย','นางสาวสุธาสินี เอื้อวีระวัฒน์'] },
    { title:'กลุ่มสารสนเทศ', members:['ว่าที่ร้อยตรีพิพัฒพงษ์ เตชะรัตน์วรากุล','นายถิรเดช สร้อยสังข์','นางพจนีย์ ศรีสวัสดิ์'] },
    { title:'กลุ่มงานความร่วมมือและสื่อสารองค์กร', members:['นางสาวสุวิมล วัฒนะพาณิชมงคล'] }
  ]
};

function normalizeNameForMatch(name){
  return String(name||'')
    .replace(/^(ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|ดร\.|นางสาว|นาง|นาย)/,'')
    .replace(/\s+/g,'')
    .trim();
}
function findEmployeeByName(name){
  const key = normalizeNameForMatch(name);
  return state.employees.find(e=> normalizeNameForMatch(e.name) === key) || null;
}

function orgPersonHtml(name, isLeader){
  const emp = findEmployeeByName(name);
  const position = emp ? emp.position : '';
  return `
  <div class="org-person ${isLeader?'org-leader':''}" ${emp?`data-org-emp="${emp.id}"`:''}>
    ${avatarHtml(emp, isLeader?34:26)}
    <div class="org-person-info">
      <div class="org-person-name">${esc(name)}</div>
      ${position? `<div class="org-person-pos">${esc(position)}</div>` : ''}
    </div>
  </div>`;
}

function viewOrgChart(){
  const headEmp = findEmployeeByName(ORG_CHART_DATA.head.name);
  const headTitle = headEmp ? headEmp.position : ORG_CHART_DATA.head.fallbackTitle;
  return `
  <div class="page-header">
    <div><h1>โครงสร้างองค์กร</h1><div class="sub">ผังโครงสร้างบุคลากรตามกลุ่มงาน ดึงตำแหน่งและรูปจากข้อมูลพนักงานอัตโนมัติ</div></div>
    <div class="actions"><button class="btn btn-gold" id="btnPrintOrgChart">พิมพ์ / บันทึก PDF</button></div>
  </div>
  <div class="panel" style="overflow-x:auto;">
    ${orgChartBodyHtml()}
  </div>
  `;
}

function orgChartBodyHtml(){
  const headEmp = findEmployeeByName(ORG_CHART_DATA.head.name);
  const headTitle = headEmp ? headEmp.position : ORG_CHART_DATA.head.fallbackTitle;
  return `
  <div class="orgchart-wrap">
    <div class="org-head-wrap">
      <div class="org-head-box" ${headEmp?`data-org-emp="${headEmp.id}"`:''}>
        ${avatarHtml(headEmp, 40)}
        <div>
          <div class="org-head-name">${esc(ORG_CHART_DATA.head.name)}</div>
          <div class="org-head-title">${esc(headTitle)}</div>
        </div>
      </div>
      <div class="org-head-stem"></div>
    </div>
    <div class="org-branch">
      ${ORG_CHART_DATA.groups.map(g => `
        <div class="org-col">
          <div class="org-col-head">${esc(g.title)}</div>
          <div class="org-col-list">
            ${g.members.map((m,i)=> orgPersonHtml(m, i===0)).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

