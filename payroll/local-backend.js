/* =====================================================================
   payroll/local-backend.js — โหมดทดลอง (ยังไม่ได้เชื่อม Apps Script)
   ใช้ logic ชุดเดียวกับ Code.gs (core.js) แต่เก็บข้อมูลไว้ใน localStorage
   ของเบราว์เซอร์เครื่องนี้เท่านั้น — เหมาะสำหรับลองใช้งาน ไม่ใช่ใช้งานจริง
   ===================================================================== */
const LOCAL_PAYROLL_KEY = 'payroll_demo_db_v2';
const DEMO_PASSWORD = 'demo1234';

const LocalPayroll = (function(){
  let store = null;

  function load(){
    if(store) return store;
    try{ store = JSON.parse(localStorage.getItem(LOCAL_PAYROLL_KEY) || 'null'); }catch(e){ store = null; }
    if(!store){ store = seed(); persist(); }
    return store;
  }
  function persist(){ try{ localStorage.setItem(LOCAL_PAYROLL_KEY, JSON.stringify(store)); }catch(e){} }

  function db(){
    const s = load();
    return {
      all: n => (s.tables[n] || []).map(r => Object.assign({}, r)),
      insert: (n, r) => { (s.tables[n] = s.tables[n] || []).push(Object.assign({}, r)); },
      update: (n, r) => { const t = s.tables[n] || []; const i = t.findIndex(x => x.id === r.id); if(i > -1) t[i] = Object.assign({}, r); else t.push(Object.assign({}, r)); },
      remove: (n, id) => { s.tables[n] = (s.tables[n] || []).filter(x => x.id !== id); },
      getConfig: () => Object.assign({}, s.config),
      setConfig: o => { Object.assign(s.config, o); },
      kpiRecords: () => s.kpi || [],
      log: (a, d) => {
        const now = new Date();
        (s.tables.logs = s.tables.logs || []).push({ id: pr_id('l'), time: pr_ymd(now) + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'), action: a, detail: d });
        if(s.tables.logs.length > 400) s.tables.logs = s.tables.logs.slice(-300);
      }
    };
  }

  /* realistic sample: staff from the HR seed list, 12 months of deductions, one applied round */
  function seed(){
    const tables = {}; Object.keys(PAYROLL_TABLES).forEach(n => tables[n] = []);
    const st = { tables, config: { notifyEmail: '' }, kpi: [], demo: true };
    const src = (typeof SEED_DATA !== 'undefined' && SEED_DATA.employees ? SEED_DATA.employees : []).slice(0, 28);
    const steps = [15050, 16800, 18400, 19750, 21300, 23900, 26450, 28800, 31250, 34600, 38900, 45200];
    src.forEach((e, i) => {
      const salary = steps[(i * 7 + 3) % steps.length];
      tables.staff.push({ id: 'demo_' + e.id, code: e.code || '', name: e.name, position: e.position || '', department: e.department || '',
        hireDate: e.hireDate || '2019-06-01', salary, status: 'active', fundOpening: (i % 4 === 0) ? 25000 + i * 1000 : 0,
        fundOpeningDate: (i % 4 === 0) ? '2025-10-01' : '', hrEmployeeId: e.id, note: '', updatedAt: '' });
      // KPI for the coming April round (most people scored, a few missing so the UI shows it)
      if(i % 9 !== 5) st.kpi.push({ employeeId: e.id, employeeName: e.name, year: '2570', period: 'รอบที่ 1 (ต.ค.-มี.ค.)', overallScore: [94, 86, 81, 77, 72, 68, 91, 83, 64][i % 9] });
      st.kpi.push({ employeeId: e.id, employeeName: e.name, year: '2569', period: 'รอบที่ 2 (เม.ย.-ก.ย.)', overallScore: [88, 79, 92, 71, 84, 66, 75, 90, 81][i % 9] });
    });
    store = st;
    const D = db();
    // history: Oct 2026 round already applied, deductions Nov 2025 → Oct 2026
    // (the demo past round uses sample percentages; the live criteria start blank for the admin to fill)
    st.config.tiers = JSON.stringify([{min:90,label:'ดีเยี่ยม',percent:4},{min:80,label:'ดีมาก',percent:3},{min:70,label:'ดี',percent:2},{min:60,label:'พอใช้',percent:1},{min:0,label:'ควรปรับปรุง',percent:0}]);
    const t = new Date();
    for(let k = 12; k >= 1; k--){
      const m = new Date(t.getFullYear(), t.getMonth() - k, 1);
      if(m.getFullYear() === 2026 && m.getMonth() === 9){
        const r = pr_createRound(D, '2026-10');
        pr_applyRound(D, r.id, 'ผู้ดูแลระบบ');
      }
      pr_generateContributions(D, pr_ym(m), 'auto');
    }
    delete st.config.tiers;   // back to the blank default
    st.tables.logs = st.tables.logs.slice(-12);
    return st;
  }

  function snapshot(){ return Object.assign(pr_snapshot(db()), { automation: { installed: true, hour: 6, demo: true }, demo: true }); }

  function handle(body){
    const D = db();
    const a = body.action;
    if(a === 'login'){
      if(body.password !== (load().password || DEMO_PASSWORD)) return { error: 'รหัสผ่านไม่ถูกต้อง' };
      return { token: 'demo-' + Date.now(), mustChange: false };
    }
    if(a === 'logout') return { ok: true };
    if(a === 'changePassword'){
      if(body.oldPassword !== (load().password || DEMO_PASSWORD)) return { error: 'รหัสผ่านเดิมไม่ถูกต้อง' };
      if(String(body.newPassword||'').length < 8) return { error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร' };
      load().password = body.newPassword; persist(); return { ok: true };
    }
    if(a === 'resetDemo'){ localStorage.removeItem(LOCAL_PAYROLL_KEY); store = null; load(); return snapshot(); }
    let result = null;
    try{
      switch(a){
        case 'bootstrap': break;
        case 'saveStaff': result = pr_saveStaff(D, body.staff); break;
        case 'deleteStaff': result = pr_deleteStaff(D, body.id); break;
        case 'importStaff': result = pr_importStaff(D, body.rows || []); break;
        case 'syncFromMain': {
          const emps = (typeof SEED_DATA !== 'undefined' ? SEED_DATA.employees : []).map(e => ({ id: e.id, code: e.code, name: e.name, position: e.position, department: e.department, hireDate: e.hireDate }));
          result = pr_syncFromMain(D, emps); break;
        }
        case 'setConfig': D.setConfig(body.config || {}); D.log('config', 'แก้ไขการตั้งค่า'); result = { refreshed: pr_refreshDraftRounds(D) }; break;
        case 'generateMonth': result = { created: pr_generateContributions(D, body.period, 'manual').length }; break;
        case 'deleteContribution': D.remove('contributions', body.id); D.log('fund', 'ลบรายการหักเงินสะสม 1 รายการ'); break;
        case 'createRound': result = { round: pr_createRound(D, body.key) }; break;
        case 'refreshRound': result = { round: pr_refreshRound(D, body.id) }; break;
        case 'updateRoundItem': result = { item: pr_updateRoundItem(D, body.id, body.patch || {}) }; break;
        case 'applyRound': result = pr_applyRound(D, body.id, 'ผู้ดูแลระบบ'); break;
        case 'deleteRound': result = pr_deleteRound(D, body.id); break;
        case 'runDailyJob': result = { events: pr_dailyJob(D, new Date()) }; break;
        case 'installTrigger': D.log('automation', 'โหมดทดลอง: งานอัตโนมัติจะทำงานเมื่อเชื่อม Apps Script จริง'); break;
        default: return { error: 'ไม่รู้จักคำสั่ง ' + a };
      }
    }catch(e){ return { error: e.message }; }
    persist();
    const snap = snapshot(); snap.result = result; return snap;
  }
  return { handle, isSeeded: () => !!localStorage.getItem(LOCAL_PAYROLL_KEY) };
})();
