/* ===== auth.js ===== */
/* ==================================================================
   AUTHENTICATION SYSTEM
   Two roles:
     - 'admin' : full access, logs in with username/password (default
                 Admin/Admin, configurable in Settings)
     - 'self'  : one employee only, logs in with their 13-digit citizen
                 ID as BOTH username and password. Sees only their own
                 data and can only submit requests for themselves.
   Note: this is UI-level access control suitable for an internal team
   tool. All records still sync through the same shared Google Sheet,
   so it is not a substitute for a real per-user backend if data
   secrecy between employees is a hard requirement.
   ================================================================== */
function isAdminUser(){ return !!(state.currentUser && state.currentUser.type==='admin'); }
function isSelfUser(){ return !!(state.currentUser && state.currentUser.type==='self'); }
function currentEmployeeId(){ return isSelfUser() ? state.currentUser.employeeId : null; }
function currentEmployee(){ return isSelfUser() ? employeeById(state.currentUser.employeeId) : null; }

function persistCurrentUser(){
  try{ sessionStorage.setItem('hr_current_user', JSON.stringify(state.currentUser)); }catch(e){}
}
function loadCurrentUserFromSession(){
  try{
    const s = sessionStorage.getItem('hr_current_user');
    if(s) state.currentUser = JSON.parse(s);
  }catch(e){}
}
function logout(){
  state.currentUser = null;
  try{ sessionStorage.removeItem('hr_current_user'); }catch(e){}
  showLoginScreen();
}

function showLoginScreen(){
  const login = document.getElementById('loginScreen');
  const appEl = document.getElementById('app');
  if(login) login.style.display = 'flex';
  if(appEl) appEl.style.display = 'none';
  const err = document.getElementById('loginError');
  if(err) err.style.display = 'none';
  const u = document.getElementById('loginUsername');
  if(u){ u.value=''; u.focus(); }
  const p = document.getElementById('loginPassword');
  if(p) p.value = '';
}

function showAppScreen(){
  const login = document.getElementById('loginScreen');
  const appEl = document.getElementById('app');
  if(login) login.style.display = 'none';
  if(appEl) appEl.style.display = 'flex';
}

function attemptLogin(username, password){
  username = (username||'').trim();
  password = (password||'').trim();
  if(!username || !password) return false;

  const adminUser = state.settings.adminUsername || 'Admin';
  const adminPass = state.settings.adminPassword || 'Admin';
  if(username === adminUser && password === adminPass){
    state.currentUser = { type:'admin', name:'ผู้ดูแลระบบ' };
    persistCurrentUser();
    return true;
  }

  const emp = state.employees.find(e => e.idCard && String(e.idCard).trim()===username && String(e.idCard).trim()===password);
  if(emp){
    state.currentUser = { type:'self', employeeId: emp.id, name: emp.name };
    persistCurrentUser();
    return true;
  }
  return false;
}

function afterLogin(){
  showAppScreen();
  state.currentView = isAdminUser() ? 'dashboard' : 'myhome';
  renderBrand();
  renderNav();
  renderView();
}

function renderUserBadge(){
  const box = document.getElementById('adminBadge');
  if(!box || !state.currentUser) return;
  const roleLabel = isAdminUser() ? 'ผู้ดูแลระบบ' : 'พนักงาน (ดูข้อมูลตนเอง)';
  box.innerHTML = `<div class="admin-badge on">
    <span class="lbl"><span class="dot"></span>${esc(state.currentUser.name||roleLabel)}</span>
    <button id="btnLogoutUser">ออก</button>
  </div>
  <div class="muted" style="font-size:10.5px; margin-top:6px; color:#C9D6E8;">${roleLabel}</div>`;
  document.getElementById('btnLogoutUser').addEventListener('click', logout);
}

let charts = {};

/* ---------------- Storage helpers ----------------
   ใช้ localStorage ของเบราว์เซอร์ (ไม่ใช่ window.storage ซึ่งใช้ได้เฉพาะใน Claude.ai เท่านั้น)
   เพื่อให้ไฟล์ HTML นี้บันทึกค่าถาวรได้เมื่อเปิดใช้งานจริงนอก Claude.ai
------------------------------------------------- */
