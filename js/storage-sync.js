/* ===== storage-sync.js ===== */
const LS_KEYS = { settings: 'hr_system_settings_v1', cache: 'hr_system_cache_v1' };

async function loadPersisted(){
  try{
    const s = localStorage.getItem(LS_KEYS.settings);
    if(s) state.settings = Object.assign({}, state.settings, JSON.parse(s));
  }catch(e){}
  try{
    const c = localStorage.getItem(LS_KEYS.cache);
    if(c){
      const data = JSON.parse(c);
      DATA_KEYS.forEach(k=>{ state[k] = data[k] || []; });
      state.lastSync = data.lastSync || null;
      normalizeAllDates();
    }
  }catch(e){}
}
async function saveSettings(){
  try{ localStorage.setItem(LS_KEYS.settings, JSON.stringify(state.settings)); }
  catch(e){ toast('บันทึกการตั้งค่าไม่สำเร็จ: '+e.message); }
}
async function saveCache(){
  try{
    const payload = { lastSync: state.lastSync };
    DATA_KEYS.forEach(k=>{ payload[k] = state[k]; });
    localStorage.setItem(LS_KEYS.cache, JSON.stringify(payload));
  }catch(e){ toast('บันทึกข้อมูลสำรองไม่สำเร็จ: '+e.message); }
}

/* ---------------- GAS sync ---------------- */
function gasReady(){ return !!state.settings.gasUrl; }

async function gasGet(action){
  const url = state.settings.gasUrl + (state.settings.gasUrl.includes('?') ? '&' : '?') + 'action=' + action;
  const res = await fetch(url);
  if(!res.ok) throw new Error('เชื่อมต่อไม่สำเร็จ (' + res.status + ')');
  return res.json();
}
async function gasPost(body){
  const res = await fetch(state.settings.gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error('บันทึกไม่สำเร็จ (' + res.status + ')');
  return res.json();
}

async function syncFromSheet(showToast){
  if(!gasReady()){ updateSyncStatus('none'); return; }
  updateSyncStatus('syncing');
  try{
    const data = await gasGet('getAll');
    if(data.error) throw new Error(data.error);
    DATA_KEYS.forEach(k=>{ state[k] = data[k] || []; });
    normalizeAllDates();
    state.lastSync = new Date().toISOString();
    await saveCache();
    updateSyncStatus('ok');
    if(showToast) toast('ซิงค์ข้อมูลจาก Google Sheet สำเร็จ');
    if(document.getElementById('app').style.display !== 'none') renderView();
  }catch(e){
    updateSyncStatus('bad');
    if(showToast) toast('ซิงค์ไม่สำเร็จ: ' + e.message);
  }
}

function updateSyncStatus(kind){
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncText');
  if(kind==='none'){ dot.className='sync-dot sync-none'; text.textContent='ยังไม่ได้ตั้งค่า'; }
  else if(kind==='syncing'){ dot.className='sync-dot sync-none'; text.textContent='กำลังซิงค์...'; }
  else if(kind==='ok'){ dot.className='sync-dot sync-ok'; text.textContent='เชื่อมต่อแล้ว · ' + (state.lastSync? fmtDateTime(state.lastSync):''); }
  else if(kind==='bad'){ dot.className='sync-dot sync-bad'; text.textContent='เชื่อมต่อล้มเหลว'; }
}

/* generic CRUD against a category */
async function crudAdd(sheet, data){
  data.id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()));
  state[sheet].push(data);
  renderView(); await saveCache();
  if(gasReady()){
    try{ await gasPost({action:'add', sheet, data}); toast('บันทึกข้อมูลแล้ว'); }
    catch(e){ toast('บันทึกในเครื่องแล้ว แต่ส่งขึ้น Google Sheet ไม่สำเร็จ: '+e.message); }
  } else {
    toast('บันทึกข้อมูลในระบบแล้ว (ยังไม่ได้เชื่อมต่อ Google Sheet)');
  }
}
async function crudUpdate(sheet, data){
  const idx = state[sheet].findIndex(r=>r.id===data.id);
  if(idx>-1) state[sheet][idx] = data;
  renderView(); await saveCache();
  if(gasReady()){
    try{ await gasPost({action:'update', sheet, data}); toast('แก้ไขข้อมูลแล้ว'); }
    catch(e){ toast('แก้ไขในเครื่องแล้ว แต่ส่งขึ้น Google Sheet ไม่สำเร็จ: '+e.message); }
  } else {
    toast('แก้ไขข้อมูลในระบบแล้ว');
  }
}
async function crudDelete(sheet, id){
  state[sheet] = state[sheet].filter(r=>r.id!==id);
  renderView(); await saveCache();
  if(gasReady()){
    try{ await gasPost({action:'delete', sheet, id}); toast('ลบข้อมูลแล้ว'); }
    catch(e){ toast('ลบในเครื่องแล้ว แต่ลบใน Google Sheet ไม่สำเร็จ: '+e.message); }
  } else {
    toast('ลบข้อมูลในระบบแล้ว');
  }
}

/* ---------------- Cloudinary image upload ---------------- */
function cloudinaryReady(){ return !!(state.settings.cloudinaryCloud && state.settings.cloudinaryPreset); }

async function uploadToCloudinary(file, onProgress){
  if(!cloudinaryReady()) throw new Error('ยังไม่ได้ตั้งค่า Cloudinary (Cloud name / Upload preset) ในหน้าตั้งค่า');
  const url = `https://api.cloudinary.com/v1_1/${state.settings.cloudinaryCloud}/image/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', state.settings.cloudinaryPreset);
  return new Promise((resolve, reject)=>{
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e)=>{
      if(onProgress && e.lengthComputable) onProgress(Math.round((e.loaded/e.total)*100));
    };
    xhr.onload = ()=>{
      try{
        const data = JSON.parse(xhr.responseText);
        if(data.secure_url) resolve(data.secure_url);
        else reject(new Error(data.error?.message || 'อัปโหลดไม่สำเร็จ'));
      }catch(e){ reject(new Error('อัปโหลดไม่สำเร็จ')); }
    };
    xhr.onerror = ()=> reject(new Error('เชื่อมต่อ Cloudinary ไม่สำเร็จ'));
    xhr.send(formData);
  });
}

function avatarHtml(emp, size){
  size = size || 32;
  const initials = emp && emp.name ? emp.name.replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ว่าที่ร้อยตรีหญิง)/,'').trim().slice(0,1) : '?';
  if(emp && emp.photoUrl){
    return `<img src="${esc(emp.photoUrl)}" class="avatar-thumb" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; border:1px solid var(--line-strong); vertical-align:middle; cursor:zoom-in;">`;
  }
  return `<span style="display:inline-flex; align-items:center; justify-content:center; width:${size}px; height:${size}px; border-radius:50%; background:var(--lav-bg); color:var(--lav-deep); font-weight:600; font-size:${size*0.4}px; vertical-align:middle;">${esc(initials)}</span>`;
}

/* ---------------- Image hover zoom (global) ---------------- */
document.addEventListener('mouseover', (e)=>{
  const img = e.target.closest && e.target.closest('.avatar-thumb');
  if(!img) return;
  const preview = document.getElementById('imgHoverPreview');
  if(!preview) return;
  preview.innerHTML = `<img src="${img.src}" style="width:210px; height:210px; object-fit:cover; border-radius:10px; display:block;">`;
  preview.style.display = 'block';
});
document.addEventListener('mousemove', (e)=>{
  const preview = document.getElementById('imgHoverPreview');
  if(!preview || preview.style.display!=='block') return;
  let x = e.clientX + 22, y = e.clientY + 22;
  const maxX = window.innerWidth - 230;
  const maxY = window.innerHeight - 230;
  if(x>maxX) x = e.clientX - 230;
  if(y>maxY) y = e.clientY - 230;
  preview.style.left = Math.max(x,8)+'px';
  preview.style.top = Math.max(y,8)+'px';
});
document.addEventListener('mouseout', (e)=>{
  const img = e.target.closest && e.target.closest('.avatar-thumb');
  if(!img) return;
  const preview = document.getElementById('imgHoverPreview');
  if(preview) preview.style.display = 'none';
});

/* ---------------- Utilities ---------------- */
