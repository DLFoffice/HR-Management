/* =====================================================================
   ⚠️ ห้ามวางไฟล์นี้ใน Apps Script โดยตรง — ไฟล์นี้เป็นเพียงครึ่งหลัง
   ให้ใช้ไฟล์ payroll/Code.gs (รวม core.js + ไฟล์นี้ไว้แล้ว ~700 บรรทัด)
   ===================================================================== */
function assertComplete_(){
  var need = ['pr_config','pr_generateContributions','pr_fundBalances','pr_createRound','pr_refreshRound','pr_updateRoundItem',
    'pr_roundSummary','pr_applyRound','pr_dailyJob','pr_saveStaff','pr_deleteStaff','pr_importStaff','pr_syncFromMain',
    'pr_deleteRound','pr_snapshot','SheetDB_','handleAction_'];
  var g = (function(){ return this; })() || {};
  var missing = [];
  if(typeof PAYROLL_TABLES === 'undefined') missing.push('PAYROLL_TABLES');
  need.forEach(function(n){ if(typeof g[n] !== 'function') missing.push(n); });
  if(missing.length){
    throw new Error('โค้ดใน Apps Script ไม่ครบ (ขาด ' + missing.slice(0,4).join(', ') + (missing.length>4?' …':'') +
      ') — ให้ลบไฟล์ .gs ทุกไฟล์ในโปรเจกต์ เหลือไฟล์เดียว วางไฟล์ payroll/Code.gs ทั้งไฟล์ (ราว 700 บรรทัด) กด Save แล้ว Deploy เป็นเวอร์ชันใหม่');
  }
}

/* รหัสผ่าน Admin เริ่มต้น — ใช้ครั้งแรกเท่านั้น เข้าระบบแล้วให้เปลี่ยนในหน้า "ตั้งค่า" ทันที */
var INITIAL_ADMIN_PASSWORD = 'ChangeMe@2569';
var PR_TZ = 'Asia/Bangkok';
var PR_TOKEN_HOURS = 6;
var PR_NUMERIC = { salary:1, fundOpening:1, rate:1, amount:1, oldSalary:1, score:1, percent:1, raise:1, newSalary:1, fiscalYear:1, half:1 };

/* ---------------------------------------------------------- Sheet DB */
function SheetDB_(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cache = {}, dirty = {};
  function sheetFor(name){
    var sh = ss.getSheetByName(name);
    if(!sh){
      sh = ss.insertSheet(name);
      var cols = PAYROLL_TABLES[name];
      sh.getRange(1,1,1,cols.length).setValues([cols]).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    } else {
      // a column was added in a newer version → extend the header row
      var want = PAYROLL_TABLES[name];
      if(sh.getLastColumn() < want.length) sh.getRange(1,1,1,want.length).setValues([want]).setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#FFFFFF');
    }
    return sh;
  }
  function cell(v, col){
    if(v instanceof Date) return Utilities.formatDate(v, PR_TZ, 'yyyy-MM-dd');
    if(PR_NUMERIC[col]) return v === '' ? '' : v;
    return v === null || v === undefined ? '' : String(v);
  }
  function load(name){
    if(cache[name]) return cache[name];
    var sh = sheetFor(name);
    var cols = PAYROLL_TABLES[name];
    var last = sh.getLastRow();
    var rows = [];
    if(last > 1){
      var vals = sh.getRange(2,1,last-1,cols.length).getValues();
      vals.forEach(function(r){
        if(r.join('') === '') return;
        var o = {}; cols.forEach(function(c,i){ o[c] = cell(r[i], c); }); rows.push(o);
      });
    }
    cache[name] = rows;
    return rows;
  }
  var db = {
    all: function(n){ return load(n).map(function(r){ return JSON.parse(JSON.stringify(r)); }); },
    insert: function(n, row){ load(n).push(JSON.parse(JSON.stringify(row))); dirty[n] = true; },
    update: function(n, row){ var t = load(n); for(var i=0;i<t.length;i++) if(t[i].id === row.id){ t[i] = JSON.parse(JSON.stringify(row)); dirty[n] = true; return; } t.push(row); dirty[n] = true; },
    remove: function(n, id){ cache[n] = load(n).filter(function(r){ return r.id !== id; }); dirty[n] = true; },
    getConfig: function(){
      var props = PropertiesService.getScriptProperties().getProperty('PAYROLL_CONFIG');
      try{ return props ? JSON.parse(props) : {}; }catch(e){ return {}; }
    },
    setConfig: function(obj){
      var cur = db.getConfig(); for(var k in obj) cur[k] = obj[k];
      PropertiesService.getScriptProperties().setProperty('PAYROLL_CONFIG', JSON.stringify(cur));
    },
    kpiRecords: function(){ return mainSheetRows_(db.getConfig().mainSheetId, 'kpi'); },
    log: function(action, detail){
      db.insert('logs', { id: pr_id('l'), time: Utilities.formatDate(new Date(), PR_TZ, 'yyyy-MM-dd HH:mm'), action: action, detail: detail });
      var t = load('logs'); if(t.length > 500) cache.logs = t.slice(-400);
    },
    flush: function(){
      Object.keys(dirty).forEach(function(n){
        var sh = sheetFor(n), cols = PAYROLL_TABLES[n], rows = cache[n] || [];
        var last = sh.getLastRow();
        if(last > 1) sh.getRange(2,1,last-1,cols.length).clearContent();
        if(rows.length){
          var rng = sh.getRange(2,1,rows.length,cols.length);
          // text columns stay text, so '2026-11' is not turned into a date by Sheets
          cols.forEach(function(c,i){ sh.getRange(2,i+1,rows.length,1).setNumberFormat(PR_NUMERIC[c] ? '#,##0.00' : '@'); });
          rng.setValues(rows.map(function(r){ return cols.map(function(c){ return r[c] === undefined || r[c] === null ? '' : r[c]; }); }));
        }
      });
      dirty = {};
    }
  };
  return db;
}

/* Rows from a tab in the main HR Google Sheet (employees / kpi), as objects */
function mainSheetId_(v){
  var s = String(v || '').trim(), m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : s.replace(/[^a-zA-Z0-9_-]/g, '');
}
/* ชื่อแท็บในระบบ HR เดิมอาจเป็นภาษาไทย — ลองหลายชื่อ */
var MAIN_TAB_ALIAS_ = {
  employees: ['employees', 'ข้อมูลพนักงาน', 'พนักงาน', 'รายชื่อพนักงาน', 'ทะเบียนพนักงาน'],
  kpi: ['kpi', 'ประเมินผลงาน KPI', 'ประเมินผล KPI', 'ประเมินผลงาน', 'KPI']
};
var MAIN_HEAD_ALIAS_ = {
  'รหัส':'code', 'รหัสพนักงาน':'code', 'ชื่อ-นามสกุล':'name', 'ชื่อ–นามสกุล':'name', 'ชื่อนามสกุล':'name', 'ชื่อ':'name',
  'ตำแหน่ง':'position', 'กลุ่มงาน':'department', 'ฝ่าย':'department', 'หน่วยงาน':'department',
  'วันเริ่มงาน':'hireDate', 'วันที่เริ่มงาน':'hireDate', 'วันบรรจุ':'hireDate', 'รูป':'photoUrl', 'รูปภาพ':'photoUrl', 'photo':'photoUrl',
  'ปี':'year', 'รอบ':'period', 'รอบประเมิน':'period', 'คะแนนรวม':'overallScore', 'คะแนน':'overallScore'
};
function findMainTab_(sheets, tab){
  var norm = function(x){ return String(x).replace(/\s+/g,'').toLowerCase(); };
  var names = (MAIN_TAB_ALIAS_[tab] || [tab]).map(norm);
  for(var i = 0; i < names.length; i++){
    var hit = sheets.filter(function(s){ return norm(s.getName()) === names[i]; })[0];
    if(hit) return hit;
  }
  return null;
}
/* strict=true → throw a Thai message that says exactly what is wrong (used by the "ดึงรายชื่อ" button) */
function mainSheetRows_(sheetId, tab, strict){
  var id = mainSheetId_(sheetId);
  function fail(msg){ if(strict) throw new Error(msg); return []; }
  if(!id) return fail('ยังไม่ได้ใส่ ID ของ Google Sheet ระบบ HR — ไปที่หน้าตั้งค่า ใส่ ID แล้วกด "บันทึก" ก่อน');
  var ss;
  try{ ss = SpreadsheetApp.openById(id); }
  catch(e){
    return fail('เปิด Google Sheet ระบบ HR ไม่ได้ (' + e.message + ') — ตรวจว่า ID ถูกต้อง และบัญชี Google ที่ Deploy ระบบเงินเดือนมีสิทธิ์เปิด Sheet นี้ (ถ้าเพิ่งวางโค้ดใหม่ ให้กด Run ฟังก์ชัน setupPayroll 1 ครั้งเพื่ออนุญาตสิทธิ์)');
  }
  var sheets = ss.getSheets();
  var sh = findMainTab_(sheets, tab);
  if(!sh) return fail('ไม่พบแท็บ "' + (MAIN_TAB_ALIAS_[tab]||[tab]).slice(0,2).join('" หรือ "') + '" ใน Sheet ระบบ HR — แท็บที่มี: ' + sheets.map(function(s){ return s.getName(); }).join(', '));
  if(sh.getLastRow() < 2) return fail('แท็บ "' + sh.getName() + '" ใน Sheet ระบบ HR ยังไม่มีข้อมูล (มีแต่หัวตาราง)');
  var vals = sh.getDataRange().getValues();
  var head = vals.shift().map(function(h){ var k = String(h).trim(); return MAIN_HEAD_ALIAS_[k.replace(/\s+/g,'')] || k; });
  return vals.filter(function(r){ return r.join('') !== ''; }).map(function(r){
    var o = {}; head.forEach(function(h,i){ if(h) o[h] = r[i] instanceof Date ? Utilities.formatDate(r[i], PR_TZ, 'yyyy-MM-dd') : r[i]; }); return o;
  });
}

/* ---------------------------------------------------------- Auth */
function hash_(pw, salt){
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8);
  return raw.map(function(b){ return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}
function ensurePassword_(){
  var p = PropertiesService.getScriptProperties();
  if(!p.getProperty('ADMIN_HASH')){
    var salt = Utilities.getUuid();
    p.setProperty('ADMIN_SALT', salt);
    p.setProperty('ADMIN_HASH', hash_(INITIAL_ADMIN_PASSWORD, salt));
    p.setProperty('ADMIN_IS_DEFAULT', 'true');
  }
}
function checkPassword_(pw){
  ensurePassword_();
  var p = PropertiesService.getScriptProperties();
  return hash_(String(pw||''), p.getProperty('ADMIN_SALT')) === p.getProperty('ADMIN_HASH');
}
function newToken_(){
  var t = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + t, '1', PR_TOKEN_HOURS * 3600);
  return t;
}
function validToken_(t){ return !!t && CacheService.getScriptCache().get('tok_' + t) === '1'; }

/* ---------------------------------------------------------- HTTP */
function doGet(){
  return json_({ ok: true, app: 'payroll', time: Utilities.formatDate(new Date(), PR_TZ, 'yyyy-MM-dd HH:mm') });
}
function doPost(e){
  var body = {};
  try{ body = JSON.parse(e.postData.contents || '{}'); }catch(err){ return json_({ error: 'รูปแบบคำขอไม่ถูกต้อง' }); }
  try{
    assertComplete_();
    if(body.action === 'login'){
      if(!checkPassword_(body.password)){ Utilities.sleep(1200); return json_({ error: 'รหัสผ่านไม่ถูกต้อง' }); }
      return json_({ token: newToken_(), mustChange: PropertiesService.getScriptProperties().getProperty('ADMIN_IS_DEFAULT') === 'true' });
    }
    if(!validToken_(body.token)) return json_({ error: 'AUTH', message: 'กรุณาเข้าสู่ระบบใหม่' });
    if(body.action === 'logout'){ CacheService.getScriptCache().remove('tok_' + body.token); return json_({ ok: true }); }
    if(body.action === 'changePassword'){
      if(!checkPassword_(body.oldPassword)) return json_({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
      if(String(body.newPassword||'').length < 8) return json_({ error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร' });
      var p = PropertiesService.getScriptProperties(), salt = Utilities.getUuid();
      p.setProperty('ADMIN_SALT', salt); p.setProperty('ADMIN_HASH', hash_(body.newPassword, salt)); p.setProperty('ADMIN_IS_DEFAULT', 'false');
      return json_({ ok: true });
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try{
      var db = SheetDB_();
      var result = handleAction_(db, body);
      db.flush();
      if(result && result.events) notify_(db, result.events);
      var snap = pr_snapshot(db);
      snap.automation = triggerStatus_();
      snap.result = result || null;
      return json_(snap);
    } finally { lock.releaseLock(); }
  }catch(err){
    return json_({ error: String(err && err.message || err) });
  }
}
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Same action names as payroll/local-backend.js (demo mode) */
function handleAction_(db, b){
  switch(b.action){
    case 'bootstrap': return null;
    case 'saveStaff': return pr_saveStaff(db, b.staff);
    case 'deleteStaff': return pr_deleteStaff(db, b.id);
    case 'importStaff': return pr_importStaff(db, b.rows || []);
    case 'syncFromMain': return pr_syncFromMain(db, mainSheetRows_(pr_config(db).mainSheetId, 'employees', true));
    case 'setConfig': db.setConfig(b.config || {}); db.log('config', 'แก้ไขการตั้งค่า'); return null;
    case 'generateMonth': return { created: pr_generateContributions(db, b.period, 'manual').length };
    case 'deleteContribution': db.remove('contributions', b.id); db.log('fund', 'ลบรายการหักเงินสะสม 1 รายการ'); return null;
    case 'createRound': return { round: pr_createRound(db, b.key) };
    case 'refreshRound': return { round: pr_refreshRound(db, b.id) };
    case 'updateRoundItem': return { item: pr_updateRoundItem(db, b.id, b.patch || {}) };
    case 'applyRound': return pr_applyRound(db, b.id, 'ผู้ดูแลระบบ');
    case 'deleteRound': return pr_deleteRound(db, b.id);
    case 'runDailyJob': return { events: pr_dailyJob(db, new Date()) };
    case 'installTrigger': installDailyTrigger(); db.log('automation', 'ติดตั้งงานอัตโนมัติรายวันแล้ว'); return null;
    default: throw new Error('ไม่รู้จักคำสั่ง ' + b.action);
  }
}

/* ---------------------------------------------------------- Automation */
function dailyPayrollJob(){
  assertComplete_();
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try{
    var db = SheetDB_();
    var events = pr_dailyJob(db, new Date());
    db.flush();
    notify_(db, events);
  } finally { lock.releaseLock(); }
}
function installDailyTrigger(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction() === 'dailyPayrollJob') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyPayrollJob').timeBased().everyDays(1).atHour(6).inTimezone(PR_TZ).create();
}
function triggerStatus_(){
  var on = ScriptApp.getProjectTriggers().some(function(t){ return t.getHandlerFunction() === 'dailyPayrollJob'; });
  return { installed: on, hour: 6 };
}
function notify_(db, events){
  var to = pr_config(db).notifyEmail;
  if(!to || !events || !events.length) return;
  var lines = events.map(function(e){
    if(e.type === 'draft') return '• สร้างร่าง' + pr_roundInfo(e.round.key).label + ' แล้ว (อีก ' + e.daysTo + ' วันถึงวันเลื่อน) — กรุณาตรวจสอบคะแนนและ %';
    if(e.type === 'applied') return '• ปรับเงินเดือน' + pr_roundInfo(e.round.key).label + ' เรียบร้อย ' + e.changed + ' คน';
    if(e.type === 'waiting') return '• ' + pr_roundInfo(e.round.key).label + ' ถึงวันเลื่อนแล้วแต่ยังไม่ปรับ: ' + (e.autoApply
        ? ('ยังไม่ได้กำหนด % ' + e.missing + ' คน' + (e.noScore ? ' (ไม่มีคะแนน KPI ' + e.noScore + ' คน)' : '') + (e.noPercent ? ' (ยังไม่กรอก % ของระดับ ' + e.noPercent + ' คน)' : ''))
        : 'รอผู้ดูแลกดอนุมัติ');
    if(e.type === 'fund') return '• หักเงินสะสมเดือน ' + e.period + ' แล้ว ' + e.count + ' คน รวม ' + e.total + ' บาท';
    return '';
  }).filter(String);
  if(lines.length) MailApp.sendEmail(to, '[ระบบเงินสะสม/เลื่อนเงินเดือน] แจ้งเตือนอัตโนมัติ', lines.join('\n') + '\n\n— ส่งจากระบบอัตโนมัติ');
}

/* เรียกครั้งเดียวจากหน้าแก้ไขสคริปต์: สร้างชีต + ตั้งรหัสผ่านเริ่มต้น + ติดตั้งงานรายวัน */
function setupPayroll(){
  assertComplete_();
  var db = SheetDB_();
  Object.keys(PAYROLL_TABLES).forEach(function(n){ db.all(n); });
  ensurePassword_();
  installDailyTrigger();
  Logger.log('พร้อมใช้งาน — รหัสผ่านเริ่มต้น: ' + INITIAL_ADMIN_PASSWORD + ' (เข้าระบบแล้วเปลี่ยนทันที)');
}
