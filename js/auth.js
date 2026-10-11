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
  if(login) login.style.display = 'grid';
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

async function attemptLogin(username, password){
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

  if(username !== password) return false; // idCard rule: username and password must be the same value

  if(firebaseReady()){
    const rec = await firestoreLookupLogin(username);
    if(rec && rec.employeeId){
      state.currentUser = { type:'self', employeeId: rec.employeeId, name: rec.name || '' };
      persistCurrentUser();
      return true;
    }
    return false; // Firebase configured: it's the source of truth, no fallback to the sheet
  }

  // Fallback (no Firebase configured yet): legacy check against the Google-Sheet-synced idCard field
  const emp = state.employees.find(e => e.idCard && String(e.idCard).trim()===username);
  if(emp){
    state.currentUser = { type:'self', employeeId: emp.id, name: emp.name };
    persistCurrentUser();
    return true;
  }
  return false;
}

function afterLogin(){
  showAppScreen();
  if(!state.currentView || !currentNav().some(n=>n.id===state.currentView)) state.currentView = isAdminUser() ? 'dashboard' : 'myhome';
  renderBrand();
  renderNav();
  renderView();
}

function renderUserBadge(){
  if(!state.currentUser) return;
  const roleLabel = isAdminUser() ? 'ผู้ดูแลระบบ' : 'พนักงาน';
  const emp = isSelfUser() ? currentEmployee() : null;
  const name = state.currentUser.name || roleLabel;
  const initial = esc(String(name).replace(/^(นาย|นางสาว|นาง)/,'').trim().slice(0,1) || 'A');
  const av = (size)=> emp && emp.photoUrl
    ? `<img class="ua-img" src="${esc(emp.photoUrl)}" alt="" style="width:${size}px;height:${size}px;">`
    : `<span class="ua-init" style="width:${size}px;height:${size}px;">${initial}</span>`;

  const rail = document.getElementById('adminBadge');
  if(rail) rail.innerHTML = `<button type="button" class="rail-avatar" title="${esc(name)}" data-open-user>${av(40)}</button>`;

  const chip = document.getElementById('userChip');
  if(chip) chip.innerHTML = `${av(36)}<span class="uc-text"><b>${esc(name)}</b><small>${roleLabel}</small></span>
    <svg class="uc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>`;

  const pop = document.getElementById('userPop');
  if(pop) pop.innerHTML = `
    <div class="up-head">${av(44)}<div><b>${esc(name)}</b><small>${emp ? esc(emp.position||'') : roleLabel}</small></div></div>
    ${emp ? `<button type="button" class="pop-item" data-goto="myhome">ข้อมูลของฉัน</button>` : ''}
    <button type="button" class="pop-item" data-pop-sync>ซิงค์ข้อมูลจาก Google Sheet</button>
    <button type="button" class="pop-item" data-theme-toggle>สลับโหมดสว่าง / มืด</button>
    ${isAdminUser() ? `<button type="button" class="pop-item" data-goto="settings">ตั้งค่าระบบ</button>` : ''}
    <div class="pop-sep"></div>
    <button type="button" class="pop-item danger" id="btnLogoutUser">ออกจากระบบ</button>`;
  document.getElementById('btnLogoutUser')?.addEventListener('click', logout);
}

let charts = {};

/* ---------------- Storage helpers ----------------
   ใช้ localStorage ของเบราว์เซอร์ (ไม่ใช่ window.storage ซึ่งใช้ได้เฉพาะใน Claude.ai เท่านั้น)
   เพื่อให้ไฟล์ HTML นี้บันทึกค่าถาวรได้เมื่อเปิดใช้งานจริงนอก Claude.ai
------------------------------------------------- */
