/* ===== app-events.js ===== */
/* ================= MODAL HELPERS ================= */
function openModal(html, maxWidth){
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalBox').style.maxWidth = maxWidth ? maxWidth+'px' : '';
  document.getElementById('modalOverlay').classList.add('active');
  const cancelBtn = document.getElementById('btnCancelModal');
  if(cancelBtn) cancelBtn.addEventListener('click', closeModal);
  initThaiDatePickers(document.getElementById('modalBox'));
}
function closeModal(){
  closeAnyDatePicker();
  document.getElementById('modalOverlay').classList.remove('active');
  document.getElementById('modalBox').innerHTML = '';
}

/* ================= EVENT BINDING PER VIEW ================= */
function bindViewEvents(v){
  if(v==='dashboard'){
    document.getElementById('btnSyncTop')?.addEventListener('click', ()=>syncFromSheet(true));
    bindApprovalButtons(document.getElementById('viewRoot'));
    document.querySelectorAll('[data-pending-leave]').forEach(tr=>tr.addEventListener('click', (e)=>{ if(e.target.closest('button')) return; openLeaveDetailModal(tr.dataset.pendingLeave); }));
    document.querySelectorAll('[data-pending-loan]').forEach(tr=>tr.addEventListener('click', (e)=>{ if(e.target.closest('button')) return; openLoanDetailModal(tr.dataset.pendingLoan); }));
    document.querySelectorAll('[data-pending-welf]').forEach(tr=>tr.addEventListener('click', (e)=>{ if(e.target.closest('button')) return; openWelfareDetailModal(tr.dataset.pendingWelf); }));
    document.querySelectorAll('[data-recent-leave]').forEach(el=>el.addEventListener('click', ()=>openLeaveDetailModal(el.dataset.recentLeave)));
  }
  else if(v==='employees'){
    document.getElementById('btnAddEmp')?.addEventListener('click', ()=>openEmployeeModal(null));
    document.getElementById('empSearch')?.addEventListener('input', renderEmployeeTable);
    document.getElementById('empDeptFilter')?.addEventListener('change', renderEmployeeTable);
    renderEmployeeTable();
  }
  else if(v==='orgchart'){
    document.getElementById('btnPrintOrgChart')?.addEventListener('click', ()=> printDocument(orgChartBodyHtml()));
    document.querySelectorAll('[data-org-emp]').forEach(el=>{
      el.style.cursor = 'pointer';
      el.addEventListener('click', ()=> openEmployeeDetailModal(el.dataset.orgEmp));
    });
  }
  else if(v==='leaves'){
    document.getElementById('btnAddLeave')?.addEventListener('click', ()=>openLeaveModal(null));
    document.getElementById('leaveSearch')?.addEventListener('input', renderLeaveTable);
    document.getElementById('leaveTypeFilter')?.addEventListener('change', renderLeaveTable);
    document.getElementById('leaveStatusFilter')?.addEventListener('change', renderLeaveTable);
    renderLeaveTable();
  }
  else if(v==='loans'){
    document.getElementById('btnAddLoan')?.addEventListener('click', ()=>openLoanModal(null));
    document.getElementById('loanSearch')?.addEventListener('input', renderLoanTable);
    document.getElementById('loanStatusFilter')?.addEventListener('change', renderLoanTable);
    document.getElementById('loanApprovalFilter')?.addEventListener('change', renderLoanTable);
    renderLoanTable();
  }
  else if(v==='welfare'){
    document.getElementById('btnAddWelfare')?.addEventListener('click', ()=>openWelfareModal(null));
    document.getElementById('welfSearch')?.addEventListener('input', renderWelfareTable);
    document.getElementById('welfCatFilter')?.addEventListener('change', renderWelfareTable);
    document.getElementById('welfApprovalFilter')?.addEventListener('change', renderWelfareTable);
    renderWelfareTable();
  }
  else if(v==='kpi'){
    document.getElementById('btnAddKpi')?.addEventListener('click', ()=>openKpiModal(null));
    document.getElementById('kpiSearch')?.addEventListener('input', renderKpiTable);
    document.getElementById('kpiYearFilter')?.addEventListener('change', renderKpiTable);
    renderKpiTable();
  }
  else if(v==='training'){
    document.getElementById('btnAddTraining')?.addEventListener('click', ()=>openTrainingModal(null));
    document.getElementById('trainingSearch')?.addEventListener('input', renderTrainingTable);
    document.getElementById('trainingTypeFilter')?.addEventListener('change', renderTrainingTable);
    renderTrainingTable();
  }
  else if(v==='myhome'){
    document.getElementById('btnQuickLeave')?.addEventListener('click', ()=>openLeaveModal(null));
    document.getElementById('btnQuickLoan')?.addEventListener('click', ()=>openLoanModal(null));
    document.getElementById('btnQuickWelfare')?.addEventListener('click', ()=>openWelfareModal(null));
  }
  else if(v==='myleaves'){
    document.getElementById('btnAddLeave')?.addEventListener('click', ()=>openLeaveModal(null));
    document.querySelectorAll('#myLeaveTable [data-leave-id]').forEach(tr=>tr.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      openLeaveDetailModal(tr.dataset.leaveId);
    }));
    bindSelfRecordActions(document.getElementById('viewRoot'), { leaves: (id)=>openLeaveModal(id) });
  }
  else if(v==='myloans'){
    document.getElementById('btnAddLoan')?.addEventListener('click', ()=>openLoanModal(null));
    document.querySelectorAll('#myLoanTable [data-loan-id]').forEach(tr=>tr.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      openLoanDetailModal(tr.dataset.loanId);
    }));
    bindSelfRecordActions(document.getElementById('viewRoot'), { loans: (id)=>openLoanModal(id) });
  }
  else if(v==='mywelfare'){
    document.getElementById('btnAddWelfare')?.addEventListener('click', ()=>openWelfareModal(null));
    document.querySelectorAll('#myWelfTable [data-welf-id]').forEach(tr=>tr.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      openWelfareDetailModal(tr.dataset.welfId);
    }));
    bindSelfRecordActions(document.getElementById('viewRoot'), { welfare: (id)=>openWelfareModal(id) });
  }
  else if(v==='reports'){
    const pills = document.querySelectorAll('[data-report]');
    pills.forEach(p=>p.addEventListener('click', ()=>{
      pills.forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      if(p.dataset.report==='individual') renderReportIndividual(); else renderReportOverall();
    }));
    renderReportIndividual();
  }
  else if(v==='settings'){
    document.getElementById('btnSaveUrl')?.addEventListener('click', async ()=>{
      state.settings.gasUrl = document.getElementById('gasUrlInput').value.trim();
      await saveSettings();
      toast('บันทึก URL แล้ว');
      renderView();
    });
    document.getElementById('btnTestConn')?.addEventListener('click', async ()=>{
      if(!gasReady()){ toast('กรุณากรอกและบันทึก URL ก่อน'); return; }
      try{
        const data = await gasGet('init');
        toast(data.error? 'เชื่อมต่อไม่สำเร็จ: '+data.error : 'เชื่อมต่อสำเร็จ: '+(data.message||'พร้อมใช้งาน'));
      }catch(e){ toast('เชื่อมต่อไม่สำเร็จ: '+e.message); }
    });
    document.getElementById('btnManualSync')?.addEventListener('click', ()=>syncFromSheet(true));
    document.getElementById('btnRepairDates')?.addEventListener('click', async ()=>{
      if(!gasReady()){ toast('กรุณาตั้งค่า URL ก่อน'); return; }
      toast('กำลังซ่อมข้อมูลวันที่...');
      try{
        const data = await gasGet('repair');
        if(data.error) throw new Error(data.error);
        toast('ซ่อมข้อมูลวันที่แล้ว '+data.fixedCount+' เซลล์');
        syncFromSheet(false);
      }catch(e){ toast('ซ่อมข้อมูลไม่สำเร็จ: '+e.message); }
    });
    document.getElementById('btnImportSeed')?.addEventListener('click', importSeedData);
    document.getElementById('btnImportSeed2569')?.addEventListener('click', ()=>importSeedDataGeneric(SEED_DATA_2569, 'ทะเบียนพนักงานล่าสุด 133 คน'));
    document.getElementById('btnSaveAdminAuth')?.addEventListener('click', async ()=>{
      const uname = document.getElementById('adminUsernameSetting').value.trim();
      const pwd = document.getElementById('adminPasswordSetting').value.trim();
      if(!uname){ toast('กรุณากรอกชื่อผู้ใช้'); return; }
      state.settings.adminUsername = uname;
      if(pwd) state.settings.adminPassword = pwd;
      await saveSettings();
      toast('บันทึกบัญชีผู้ดูแลระบบแล้ว');
      renderView();
    });
    document.getElementById('idCardChecker')?.addEventListener('input', (e)=>{
      const val = e.target.value.trim();
      const resultEl = document.getElementById('idCardCheckResult');
      if(!val){ resultEl.innerHTML = ''; return; }
      const match = state.employees.find(emp => emp.idCard && String(emp.idCard).trim()===val);
      if(match){
        resultEl.innerHTML = `<div style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--green-bg); border-radius:10px; margin-top:8px;">
          ${avatarHtml(match,32)}
          <div><b style="color:var(--green);">พบข้อมูลตรงกัน ✓</b> — ${esc(match.name)} จะสามารถล็อกอินด้วยเลขนี้ได้</div>
        </div>`;
      } else {
        const total = state.employees.length;
        resultEl.innerHTML = `<div style="padding:10px 12px; background:var(--red-bg); border-radius:10px; margin-top:8px; color:var(--red);">
          <b>ไม่พบเลขนี้ในระบบ ✗</b> — ตรวจสอบพนักงานทั้งหมด ${total} คนแล้วไม่พบเลขบัตรที่ตรงกัน สาเหตุที่เป็นไปได้:
          <ul style="margin:8px 0 0; padding-right:0; padding-left:18px;">
            <li>ยังไม่ได้กด "ซิงค์ข้อมูลตอนนี้" หลังเพิ่มข้อมูลใน Google Sheet</li>
            <li>ชื่อหัวคอลัมน์ใน Google Sheet ไม่ใช่ <code class="inline">idCard</code> เป๊ะๆ (ตัวพิมพ์เล็ก-ใหญ่ต้องตรง)</li>
            <li>เลขบัตรถูกพิมพ์ในแถว(row)ของพนักงานคนละคนกับที่ตั้งใจ</li>
            <li>คอลัมน์ถูกจัดรูปแบบเป็น "ตัวเลข" ทำให้เลข 0 นำหน้าหายไป</li>
          </ul>
        </div>`;
      }
    });
    document.getElementById('btnSaveCloudinary')?.addEventListener('click', async ()=>{
      state.settings.cloudinaryCloud = document.getElementById('cldCloud').value.trim();
      state.settings.cloudinaryPreset = document.getElementById('cldPreset').value.trim();
      await saveSettings();
      toast('บันทึกการตั้งค่า Cloudinary แล้ว');
    });
    document.getElementById('btnSaveLogoUrl')?.addEventListener('click', async ()=>{
      state.settings.logoUrl = document.getElementById('logoUrlInput').value.trim();
      await saveSettings();
      renderBrand();
      toast('บันทึกโลโก้แล้ว');
      renderView();
    });
    document.getElementById('logoFileInput')?.addEventListener('change', async (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      const statusEl = document.getElementById('logoUploadStatus');
      if(!cloudinaryReady()){ toast('กรุณาตั้งค่า Cloudinary ก่อนอัปโหลดไฟล์'); return; }
      statusEl.textContent = 'กำลังอัปโหลด... 0%';
      try{
        const url = await uploadToCloudinary(file, (p)=>{ statusEl.textContent = 'กำลังอัปโหลด... '+p+'%'; });
        state.settings.logoUrl = url;
        await saveSettings();
        renderBrand();
        statusEl.textContent = 'อัปโหลดสำเร็จ';
        toast('อัปโหลดโลโก้สำเร็จ');
        renderView();
      }catch(err){
        statusEl.textContent = '';
        toast('อัปโหลดไม่สำเร็จ: '+err.message);
      }
    });
  }
  document.getElementById('modalOverlay').onclick = (e)=>{ if(e.target.id==='modalOverlay') closeModal(); };
}

/* ================= BOOTSTRAP ================= */
async function init(){
  await loadPersisted();
  loadCurrentUserFromSession();
  renderBrand();

  if(state.currentUser){
    afterLogin();
    if(gasReady()) await syncFromSheet(false);
    updateSyncStatus(gasReady() ? (state.lastSync? 'ok':'none') : 'none');
  } else {
    showLoginScreen();
    if(gasReady()){
      setLoginBusy(true, 'กำลังโหลดข้อมูลล่าสุด...');
      await syncFromSheet(false);
      setLoginBusy(false);
    }
  }
}
init();

function setLoginBusy(busy, msg){
  const btn = document.getElementById('btnLoginSubmit');
  const note = document.getElementById('loginLoading');
  if(btn) btn.disabled = busy;
  if(note){ note.textContent = msg||''; note.style.display = busy ? 'block' : 'none'; }
}

function bindLoginForm(){
  const btn = document.getElementById('btnLoginSubmit');
  const uEl = document.getElementById('loginUsername');
  const pEl = document.getElementById('loginPassword');
  if(!btn) return;
  const toggleBtn = document.getElementById('btnTogglePwd');
  if(toggleBtn){
    toggleBtn.addEventListener('click', ()=>{
      const showing = pEl.type === 'text';
      pEl.type = showing ? 'password' : 'text';
      toggleBtn.textContent = showing ? '👁' : '🙈';
    });
  }
  const tryLogin = async ()=>{
    document.getElementById('loginError').style.display = 'none';
    let ok = attemptLogin(uEl.value, pEl.value);
    if(!ok && gasReady()){
      // data might be stale on this device — re-sync once and retry before giving up
      setLoginBusy(true, 'กำลังตรวจสอบข้อมูลล่าสุด...');
      await syncFromSheet(false);
      setLoginBusy(false);
      ok = attemptLogin(uEl.value, pEl.value);
    }
    if(ok){
      afterLogin();
      updateSyncStatus(gasReady() ? (state.lastSync? 'ok':'none') : 'none');
    } else {
      document.getElementById('loginError').style.display = 'block';
    }
  };
  btn.addEventListener('click', tryLogin);
  [uEl, pEl].forEach(el=> el && el.addEventListener('keydown', (e)=>{ if(e.key==='Enter') tryLogin(); }));
}
bindLoginForm();
