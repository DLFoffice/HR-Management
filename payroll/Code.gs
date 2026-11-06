/* =====================================================================
   Code.gs — ระบบเงินสะสม 5% และเลื่อนเงินเดือน (Google Apps Script)
   วิธีติดตั้ง: ดู payroll/README-payroll.md
   ไฟล์นี้สร้างจาก payroll/core.js + payroll/gas-backend.js (คัดลอกทั้งไฟล์ไปวางใน Apps Script)
   ===================================================================== */

/* =====================================================================
   payroll/core.js — ระบบเงินสะสม 5% และเลื่อนเงินเดือน (logic กลาง)

   ไฟล์นี้ใช้ร่วมกัน 2 ที่:
     1) Google Apps Script (ถูกรวมไว้ในไฟล์ Code.gs)
     2) หน้าเว็บ payroll.html ในโหมดทดลอง (ยังไม่ต่อ Google)
   จึงเขียนเป็น JavaScript ล้วน ไม่แตะ DOM และไม่แตะ SpreadsheetApp โดยตรง
   ทุกฟังก์ชันรับ `db` ที่มีเมธอด:
     db.all(table) → [rows]           db.insert(table, row)
     db.update(table, row)            db.remove(table, id)
     db.getConfig() → {}              db.setConfig(obj)
     db.kpiRecords() → [kpi rows จากระบบ HR เดิม] (คืน [] ได้)
     db.log(action, detail)
   ===================================================================== */

var PAYROLL_TABLES = {
  staff:         ['id','code','name','position','department','hireDate','salary','status','fundOpening','fundOpeningDate','hrEmployeeId','note','updatedAt'],
  contributions: ['id','staffId','period','salary','rate','amount','createdAt','source'],
  rounds:        ['id','key','effectiveDate','evalStart','evalEnd','fiscalYear','half','status','createdAt','appliedAt','note'],
  roundItems:    ['id','roundId','staffId','name','oldSalary','score','tier','percent','raise','newSalary','eligible','reason','overridden'],
  salaryHistory: ['id','staffId','effectiveDate','oldSalary','newSalary','percent','roundKey','note','createdAt'],
  logs:          ['id','time','action','detail']
};

var PAYROLL_DEFAULTS = {
  fundRate: 5,                 // % หักจากเงินเดือนเข้ากองทุนสะสม
  fundRounding: 'satang',      // 'satang' = ทศนิยม 2 ตำแหน่ง, 'baht' = ปัดเป็นบาท
  deductionDay: 25,            // วันที่ระบบสร้างรายการหักเงินสะสมของเดือน
  eligibilityMonths: 6,        // ต้องทำงานครบกี่เดือน ณ วันที่เลื่อน จึงมีสิทธิ์
  leadDays: 30,                // สร้างร่างรอบเลื่อนเงินเดือนล่วงหน้ากี่วัน
  autoApply: true,             // ถึงวันที่ 1 เม.ย./1 ต.ค. ให้ปรับเงินเดือนอัตโนมัติ
  raiseRounding: 'ceil10',     // 'ceil10' = ปัดขึ้นเป็นหลักสิบ (แบบราชการ), 'none'
  raisePoolPercent: 3,         // วงเงินเลื่อนต่อรอบ (% ของเงินเดือนรวมผู้มีสิทธิ์) — ใช้เตือน
  notifyEmail: '',
  orgName: 'มูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์',
  logoUrl: 'https://dltv.ac.th/upload/data/users/0/316/CMS/images/logo%20dlf%20%E0%B8%AA%E0%B8%A1%E0%B8%9A%E0%B8%B9%E0%B8%A3%E0%B8%93%E0%B9%8C.png',
  mainSheetId: '',             // ID ของ Google Sheet ระบบ HR เดิม (อ่านพนักงาน/KPI)
  // คะแนน KPI ขั้นต่ำ → % ที่เลื่อน — ช่วงคะแนน/ชื่อระดับตรงกับการให้เกรด KPI ในระบบ HR
  // ส่วน % เว้นว่างไว้ให้ผู้ดูแลกรอกเอง (ว่าง = ยังไม่กำหนด ระบบจะไม่ปรับเงินเดือนอัตโนมัติ)
  tiers: [
    { min: 90, label: 'ดีเยี่ยม', percent: '' },
    { min: 80, label: 'ดีมาก',   percent: '' },
    { min: 70, label: 'ดี',      percent: '' },
    { min: 60, label: 'พอใช้',   percent: '' },
    { min: 0,  label: 'ควรปรับปรุง', percent: '' }
  ]
};

/* ------------------------------------------------------------------ utils */
function pr_num(v){ var n = Number(String(v === undefined || v === null ? '' : v).replace(/,/g,'')); return isFinite(n) ? n : 0; }
function pr_round2(n){ return Math.round((pr_num(n) + Number.EPSILON) * 100) / 100; }
function pr_pad(n){ return (n < 10 ? '0' : '') + n; }
function pr_ymd(d){ return d.getFullYear() + '-' + pr_pad(d.getMonth()+1) + '-' + pr_pad(d.getDate()); }
function pr_ym(d){ return d.getFullYear() + '-' + pr_pad(d.getMonth()+1); }
function pr_parse(s){
  if(!s) return null;
  if(Object.prototype.toString.call(s) === '[object Date]') return isNaN(s) ? null : new Date(s.getFullYear(), s.getMonth(), s.getDate());
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return null;
  var y = Number(m[1]); if(y > 2400) y -= 543;
  return new Date(y, Number(m[2])-1, Number(m[3]));
}
function pr_addMonths(d, n){ var r = new Date(d.getFullYear(), d.getMonth()+n, d.getDate()); return r; }
function pr_id(prefix){ return (prefix||'') + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function pr_nowIso(){ return new Date().toISOString(); }
function pr_blank(v){ return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
function pr_bool(v){ return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1'; }

function pr_config(db){
  var c = db.getConfig() || {};
  var out = {};
  for(var k in PAYROLL_DEFAULTS) out[k] = PAYROLL_DEFAULTS[k];
  for(var k2 in c){ if(c[k2] !== '' && c[k2] !== undefined && c[k2] !== null) out[k2] = c[k2]; }
  if(typeof out.tiers === 'string'){ try{ out.tiers = JSON.parse(out.tiers); }catch(e){ out.tiers = PAYROLL_DEFAULTS.tiers; } }
  out.fundRate = pr_num(out.fundRate);
  out.deductionDay = Math.min(28, Math.max(1, pr_num(out.deductionDay) || 25));
  out.eligibilityMonths = pr_num(out.eligibilityMonths);
  out.leadDays = pr_num(out.leadDays);
  out.raisePoolPercent = pr_num(out.raisePoolPercent);
  out.autoApply = pr_bool(out.autoApply);
  out.tiers = (out.tiers || []).map(function(t){ return { min: pr_num(t.min), label: String(t.label||''), percent: pr_blank(t.percent) ? '' : pr_num(t.percent) }; })
                               .sort(function(a,b){ return b.min - a.min; });
  return out;
}

function pr_activeStaff(db){
  return db.all('staff').filter(function(s){ return (s.status || 'active') === 'active'; });
}

/* ---------------------------------------------------------- เงินสะสม 5% */
function pr_fundAmount(salary, cfg){
  var raw = pr_num(salary) * cfg.fundRate / 100;
  return cfg.fundRounding === 'baht' ? Math.round(raw) : pr_round2(raw);
}

/* staff who should contribute for month ym ('YYYY-MM') */
function pr_staffForMonth(db, ym){
  var p = ym.split('-'); var y = Number(p[0]), m = Number(p[1]);
  var monthEnd = new Date(y, m, 0);
  return pr_activeStaff(db).filter(function(s){
    var h = pr_parse(s.hireDate);
    return pr_num(s.salary) > 0 && (!h || h <= monthEnd);
  });
}

/* Creates the month's deductions. Idempotent: never duplicates a person/month. */
function pr_generateContributions(db, ym, source){
  var cfg = pr_config(db);
  var existing = {};
  db.all('contributions').forEach(function(c){ if(c.period === ym) existing[c.staffId] = true; });
  var created = [];
  pr_staffForMonth(db, ym).forEach(function(s){
    if(existing[s.id]) return;
    var row = { id: pr_id('c'), staffId: s.id, period: ym, salary: pr_num(s.salary), rate: cfg.fundRate,
                amount: pr_fundAmount(s.salary, cfg), createdAt: pr_nowIso(), source: source || 'auto' };
    db.insert('contributions', row);
    created.push(row);
  });
  if(created.length) db.log('fund', 'สร้างรายการหักเงินสะสมเดือน ' + ym + ' จำนวน ' + created.length + ' คน รวม ' + pr_round2(created.reduce(function(a,r){ return a + r.amount; }, 0)) + ' บาท');
  return created;
}

/* Running balance for one person (opening balance + every deduction) */
function pr_ledger(db, staffId){
  var s = db.all('staff').filter(function(x){ return x.id === staffId; })[0];
  var rows = db.all('contributions').filter(function(c){ return c.staffId === staffId; })
                .sort(function(a,b){ return a.period < b.period ? -1 : a.period > b.period ? 1 : 0; });
  var bal = pr_num(s && s.fundOpening);
  var out = [];
  if(bal) out.push({ period: s.fundOpeningDate ? String(s.fundOpeningDate).slice(0,7) : '', label: 'ยอดยกมา', salary: '', amount: bal, balance: bal, opening: true });
  rows.forEach(function(c){ bal = pr_round2(bal + pr_num(c.amount)); out.push({ period: c.period, salary: pr_num(c.salary), rate: pr_num(c.rate), amount: pr_num(c.amount), balance: bal, id: c.id }); });
  return { staff: s, rows: out, balance: bal, contributed: pr_round2(rows.reduce(function(a,c){ return a + pr_num(c.amount); }, 0)) };
}

function pr_fundBalances(db){
  var map = {};
  db.all('staff').forEach(function(s){ map[s.id] = pr_num(s.fundOpening); });
  db.all('contributions').forEach(function(c){ map[c.staffId] = pr_round2((map[c.staffId] || 0) + pr_num(c.amount)); });
  return map;
}

/* -------------------------------------------------- เลื่อนเงินเดือน 2 รอบ */
/* round key 'YYYY-04' (1 เม.ย., ประเมิน ต.ค.–มี.ค.) or 'YYYY-10' (1 ต.ค., ประเมิน เม.ย.–ก.ย.) */
function pr_roundInfo(key){
  var p = String(key).split('-'); var y = Number(p[0]); var m = Number(p[1]);
  var april = m === 4;
  var eff = new Date(y, april ? 3 : 9, 1);
  var evalStart = april ? new Date(y-1, 9, 1) : new Date(y, 3, 1);
  var evalEnd = april ? new Date(y, 2, 31) : new Date(y, 8, 30);
  // fiscal year (พ.ศ.) of the evaluation period: Oct–Sep, named by the year it ends
  var fy = (april ? y : y) + 543;
  return { key: key, effectiveDate: pr_ymd(eff), evalStart: pr_ymd(evalStart), evalEnd: pr_ymd(evalEnd),
           fiscalYear: fy, half: april ? 1 : 2,
           label: (april ? 'รอบ 1 เม.ย. ' : 'รอบ 1 ต.ค. ') + (y + 543) };
}
function pr_nextRoundKey(today){
  var y = today.getFullYear();
  var apr = new Date(y, 3, 1), oct = new Date(y, 9, 1);
  if(today < apr) return y + '-04';
  if(today < oct) return y + '-10';
  return (y+1) + '-04';
}
function pr_roundKeyOn(today){ // round whose effective date is exactly today (or null)
  if(today.getDate() !== 1) return null;
  if(today.getMonth() === 3) return today.getFullYear() + '-04';
  if(today.getMonth() === 9) return today.getFullYear() + '-10';
  return null;
}

function pr_tierFor(score, cfg){
  if(score === null || score === undefined || score === '') return null;
  var s = pr_num(score);
  for(var i=0; i<cfg.tiers.length; i++) if(s >= cfg.tiers[i].min) return cfg.tiers[i];
  return cfg.tiers[cfg.tiers.length-1] || null;
}
function pr_raiseAmount(salary, percent, cfg){
  var raw = pr_num(salary) * pr_num(percent) / 100;
  if(raw <= 0) return 0;
  return cfg.raiseRounding === 'ceil10' ? Math.ceil(raw / 10) * 10 : pr_round2(raw);
}

/* KPI score from the main HR system for this staff + evaluation half.
   Matches by HR employee id, then code, then name; accepts the year as either
   the fiscal year or the calendar year; falls back to the yearly ("ประจำปี") score. */
function pr_kpiScore(kpis, staff, info){
  var half = info.half === 1 ? 'รอบที่ 1' : 'รอบที่ 2';
  var years = [String(info.fiscalYear), String(info.fiscalYear - 543)];
  var mine = kpis.filter(function(k){
    return (staff.hrEmployeeId && k.employeeId === staff.hrEmployeeId) ||
           (staff.code && k.employeeCode && String(k.employeeCode) === String(staff.code)) ||
           (staff.name && k.employeeName && String(k.employeeName).replace(/\s+/g,'') === String(staff.name).replace(/\s+/g,''));
  }).filter(function(k){ return years.indexOf(String(k.year).trim()) > -1; });
  var exact = mine.filter(function(k){ return String(k.period||'').indexOf(half) > -1; })[0];
  var yearly = mine.filter(function(k){ return String(k.period||'').indexOf('ประจำปี') > -1; })[0];
  var hit = exact || yearly;
  return hit && hit.overallScore !== '' && hit.overallScore !== undefined ? pr_num(hit.overallScore) : null;
}

function pr_isEligible(staff, info, cfg){
  var h = pr_parse(staff.hireDate);
  if(!h) return { ok: true, reason: '' };
  var need = pr_addMonths(h, cfg.eligibilityMonths);
  var eff = pr_parse(info.effectiveDate);
  if(need > eff) return { ok: false, reason: 'ทำงานไม่ครบ ' + cfg.eligibilityMonths + ' เดือน ณ วันที่เลื่อน' };
  return { ok: true, reason: '' };
}

function pr_itemReason(score, tier, percent, manual){
  if(percent !== '' ) return manual ? 'กำหนดเอง' : '';
  if(score === '' || score === null) return 'ยังไม่มีคะแนน KPI';
  if(!tier) return 'ยังไม่ได้ตั้งเกณฑ์ %';
  return 'ยังไม่กำหนด % ของระดับ' + tier.label;
}
function pr_itemPending(i){ return pr_bool(i.eligible) && pr_blank(i.percent); }

function pr_buildItem(db, round, staff, cfg, kpis, info, keep){
  var el = pr_isEligible(staff, info, cfg);
  var score = keep && pr_bool(keep.overridden) ? (keep.score === '' ? null : keep.score) : pr_kpiScore(kpis, staff, info);
  var tier = pr_tierFor(score, cfg);
  var manual = keep && pr_bool(keep.overridden);
  // '' = % not decided yet (tier has no % or no score) — never treated as 0%
  var percent = !el.ok ? 0 : manual ? (pr_blank(keep.percent) ? '' : pr_num(keep.percent)) : (tier && !pr_blank(tier.percent) ? pr_num(tier.percent) : '');
  var oldSalary = pr_num(staff.salary);
  var raise = el.ok && percent !== '' ? pr_raiseAmount(oldSalary, percent, cfg) : 0;
  var reason = !el.ok ? el.reason : pr_itemReason(score === null ? '' : score, tier, percent, manual);
  return {
    id: keep ? keep.id : pr_id('ri'), roundId: round.id, staffId: staff.id, name: staff.name,
    oldSalary: oldSalary, score: score === null ? '' : score, tier: tier ? tier.label : '',
    percent: percent, raise: raise, newSalary: pr_round2(oldSalary + raise),
    eligible: el.ok, reason: reason, overridden: !!manual
  };
}

/* Create (or return existing) round with a draft list of everybody active */
function pr_createRound(db, key){
  var existing = db.all('rounds').filter(function(r){ return r.key === key; })[0];
  if(existing) return existing;
  var cfg = pr_config(db), info = pr_roundInfo(key), kpis = db.kpiRecords() || [];
  var round = { id: pr_id('r'), key: key, effectiveDate: info.effectiveDate, evalStart: info.evalStart, evalEnd: info.evalEnd,
                fiscalYear: info.fiscalYear, half: info.half, status: 'draft', createdAt: pr_nowIso(), appliedAt: '', note: '' };
  db.insert('rounds', round);
  pr_activeStaff(db).forEach(function(s){ db.insert('roundItems', pr_buildItem(db, round, s, cfg, kpis, info, null)); });
  db.log('round', 'สร้างร่าง' + info.label + ' (' + pr_activeStaff(db).length + ' คน)');
  return round;
}

/* Re-read KPI scores / salaries for items not manually overridden */
function pr_refreshRound(db, roundId){
  var round = db.all('rounds').filter(function(r){ return r.id === roundId; })[0];
  if(!round || round.status !== 'draft') return round;
  var cfg = pr_config(db), info = pr_roundInfo(round.key), kpis = db.kpiRecords() || [];
  var items = db.all('roundItems').filter(function(i){ return i.roundId === roundId; });
  var byStaff = {}; items.forEach(function(i){ byStaff[i.staffId] = i; });
  pr_activeStaff(db).forEach(function(s){
    var keep = byStaff[s.id];
    var item = pr_buildItem(db, round, s, cfg, kpis, info, keep || null);
    if(keep) db.update('roundItems', item); else db.insert('roundItems', item);
  });
  return round;
}

/* Admin edits one person's score or percent in a draft round */
function pr_updateRoundItem(db, itemId, patch){
  var item = db.all('roundItems').filter(function(i){ return i.id === itemId; })[0];
  if(!item) throw new Error('ไม่พบรายการ');
  var round = db.all('rounds').filter(function(r){ return r.id === item.roundId; })[0];
  if(!round || round.status !== 'draft') throw new Error('รอบนี้ปรับเงินเดือนไปแล้ว แก้ไขไม่ได้');
  var cfg = pr_config(db);
  var staff = db.all('staff').filter(function(s){ return s.id === item.staffId; })[0] || { salary: item.oldSalary };
  if(patch.score !== undefined){
    item.score = patch.score === '' ? '' : pr_num(patch.score);
    var t = pr_tierFor(item.score === '' ? null : item.score, cfg);
    item.tier = t ? t.label : '';
    if(patch.percent === undefined) item.percent = pr_bool(item.eligible) && t && !pr_blank(t.percent) ? pr_num(t.percent) : (pr_bool(item.eligible) ? '' : 0);
  }
  if(patch.percent !== undefined) item.percent = pr_blank(patch.percent) ? '' : pr_num(patch.percent);
  if(patch.eligible !== undefined) item.eligible = pr_bool(patch.eligible);
  item.overridden = true;
  item.oldSalary = pr_num(staff.salary);
  item.raise = pr_bool(item.eligible) && !pr_blank(item.percent) ? pr_raiseAmount(item.oldSalary, item.percent, cfg) : 0;
  item.newSalary = pr_round2(item.oldSalary + item.raise);
  var tt = pr_tierFor(item.score === '' ? null : item.score, cfg);
  item.reason = pr_bool(item.eligible) ? pr_itemReason(item.score, tt, pr_blank(item.percent) ? '' : item.percent, true) : (item.reason || 'ไม่มีสิทธิ์รอบนี้');
  db.update('roundItems', item);
  return item;
}

function pr_roundSummary(db, roundId){
  var cfg = pr_config(db);
  var items = db.all('roundItems').filter(function(i){ return i.roundId === roundId; });
  var eligible = items.filter(function(i){ return pr_bool(i.eligible); });
  var base = eligible.reduce(function(a,i){ return a + pr_num(i.oldSalary); }, 0);
  var raise = eligible.reduce(function(a,i){ return a + pr_num(i.raise); }, 0);
  var pending = eligible.filter(pr_itemPending);   // eligible but % not decided yet
  var noScore = pending.filter(function(i){ return pr_blank(i.score); });
  return { count: items.length, eligible: eligible.length, missingScores: pending.length, pending: pending.length,
           noScore: noScore.length, noPercent: pending.length - noScore.length, baseSalary: pr_round2(base),
           totalRaise: pr_round2(raise), raisePercentOfBase: base ? pr_round2(raise / base * 100) : 0,
           pool: pr_round2(base * cfg.raisePoolPercent / 100), overPool: raise > base * cfg.raisePoolPercent / 100 + 0.001 };
}

/* Apply: update salaries + write salary history. Only once per round. */
function pr_applyRound(db, roundId, by){
  var round = db.all('rounds').filter(function(r){ return r.id === roundId; })[0];
  if(!round) throw new Error('ไม่พบรอบ');
  if(round.status === 'applied') return { round: round, changed: 0 };
  var items = db.all('roundItems').filter(function(i){ return i.roundId === roundId; });
  var staffMap = {}; db.all('staff').forEach(function(s){ staffMap[s.id] = s; });
  var changed = 0;
  items.forEach(function(i){
    var s = staffMap[i.staffId];
    if(!s || !pr_bool(i.eligible) || pr_blank(i.percent) || pr_num(i.raise) <= 0) return;
    var oldSal = pr_num(s.salary);
    var newSal = pr_round2(oldSal + pr_num(i.raise));
    s.salary = newSal; s.updatedAt = pr_nowIso();
    db.update('staff', s);
    db.insert('salaryHistory', { id: pr_id('h'), staffId: s.id, effectiveDate: round.effectiveDate, oldSalary: oldSal, newSalary: newSal,
                                 percent: pr_num(i.percent), roundKey: round.key, note: i.tier ? ('ผลประเมิน ' + i.tier) : '', createdAt: pr_nowIso() });
    changed++;
  });
  round.status = 'applied'; round.appliedAt = pr_nowIso(); round.note = (by ? 'ปรับโดย ' + by : 'ปรับอัตโนมัติ');
  db.update('rounds', round);
  db.log('round', 'ปรับเงินเดือน' + pr_roundInfo(round.key).label + ' แล้ว ' + changed + ' คน (' + round.note + ')');
  return { round: round, changed: changed };
}

/* ------------------------------------------------------- งานอัตโนมัติรายวัน
   เรียกวันละครั้ง (Apps Script time trigger) — ทำซ้ำได้ ไม่เกิดรายการซ้ำ
   1. ใกล้ถึงรอบเลื่อน (ภายใน leadDays วัน) → สร้างร่าง + ดึงคะแนน KPI
   2. ระหว่างร่าง → อัปเดตคะแนน KPI ที่เพิ่งกรอก
   3. ถึงวันที่ 1 เม.ย./1 ต.ค. → ปรับเงินเดือน (ถ้า autoApply และคะแนนครบ)
   4. ถึงวันหักเงินสะสมของเดือน → สร้างรายการหัก 5% จากเงินเดือนล่าสุด     */
function pr_dailyJob(db, today){
  today = today || new Date();
  today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var cfg = pr_config(db);
  var events = [];

  // 1–2: upcoming round draft
  var nextKey = pr_nextRoundKey(today);
  var nextEff = pr_parse(pr_roundInfo(nextKey).effectiveDate);
  var daysTo = Math.round((nextEff - today) / 86400000);
  var nextRound = db.all('rounds').filter(function(r){ return r.key === nextKey; })[0];
  if(daysTo <= cfg.leadDays){
    if(!nextRound){ nextRound = pr_createRound(db, nextKey); events.push({ type: 'draft', round: nextRound, daysTo: daysTo }); }
    else if(nextRound.status === 'draft') pr_refreshRound(db, nextRound.id);
  }

  // 3: effective today (or overdue drafts whose date has passed)
  db.all('rounds').filter(function(r){ return r.status === 'draft' && pr_parse(r.effectiveDate) <= today; }).forEach(function(r){
    pr_refreshRound(db, r.id);
    var sum = pr_roundSummary(db, r.id);
    if(cfg.autoApply && sum.missingScores === 0){
      var res = pr_applyRound(db, r.id, '');
      events.push({ type: 'applied', round: res.round, changed: res.changed });
    } else {
      events.push({ type: 'waiting', round: r, missing: sum.pending, noScore: sum.noScore, noPercent: sum.noPercent, autoApply: cfg.autoApply });
    }
  });

  // 4: monthly deduction
  if(today.getDate() >= cfg.deductionDay){
    var ym = pr_ym(today);
    var created = pr_generateContributions(db, ym, 'auto');
    if(created.length) events.push({ type: 'fund', period: ym, count: created.length, total: pr_round2(created.reduce(function(a,c){ return a + c.amount; }, 0)) });
  }
  db.log('daily', 'งานอัตโนมัติรายวัน: ' + (events.length ? events.map(function(e){ return e.type; }).join(', ') : 'ไม่มีงานที่ต้องทำ'));
  return events;
}


/* ------------------------------------------------------- staff management */
function pr_saveStaff(db, data){
  if(!data || !String(data.name||'').trim()) throw new Error('กรุณากรอกชื่อพนักงาน');
  var row = {};
  PAYROLL_TABLES.staff.forEach(function(c){ row[c] = data[c] === undefined ? '' : data[c]; });
  row.salary = pr_round2(row.salary); row.fundOpening = pr_round2(row.fundOpening);
  row.status = row.status || 'active'; row.updatedAt = pr_nowIso();
  if(row.id && db.all('staff').some(function(s){ return s.id === row.id; })){
    var old = db.all('staff').filter(function(s){ return s.id === row.id; })[0];
    db.update('staff', row);
    if(pr_num(old.salary) !== pr_num(row.salary) && pr_num(old.salary) > 0){
      db.insert('salaryHistory', { id: pr_id('h'), staffId: row.id, effectiveDate: pr_ymd(new Date()), oldSalary: pr_num(old.salary), newSalary: row.salary,
        percent: pr_round2((row.salary - pr_num(old.salary)) / pr_num(old.salary) * 100), roundKey: '', note: data.changeNote || 'แก้ไขเงินเดือนโดยผู้ดูแล', createdAt: pr_nowIso() });
    }
    db.log('staff', 'แก้ไขข้อมูล ' + row.name);
  } else {
    row.id = row.id || pr_id('s');
    db.insert('staff', row);
    db.log('staff', 'เพิ่มพนักงาน ' + row.name);
  }
  return { staff: row };
}
function pr_deleteStaff(db, id){
  var hasData = db.all('contributions').some(function(c){ return c.staffId === id; });
  var s = db.all('staff').filter(function(x){ return x.id === id; })[0];
  if(!s) return null;
  if(hasData){ s.status = 'resigned'; s.updatedAt = pr_nowIso(); db.update('staff', s); db.log('staff', 'เปลี่ยนสถานะ ' + s.name + ' เป็นพ้นสภาพ (มีประวัติเงินสะสม จึงไม่ลบ)'); return { softDeleted: true }; }
  db.remove('staff', id); db.log('staff', 'ลบ ' + s.name);
  return { deleted: true };
}
/* rows: [{code,name,position,department,hireDate,salary,fundOpening,fundOpeningDate}] — matches by code, then name */
function pr_importStaff(db, rows){
  var staff = db.all('staff'), added = 0, updated = 0;
  rows.forEach(function(r){
    if(!r || !String(r.name||'').trim()) return;
    var hit = staff.filter(function(s){ return (r.code && String(s.code) === String(r.code)) || String(s.name).replace(/\s+/g,'') === String(r.name).replace(/\s+/g,''); })[0];
    var data = {};
    if(hit) for(var k in hit) data[k] = hit[k];
    ['code','name','position','department','hireDate','salary','fundOpening','fundOpeningDate','status'].forEach(function(k){ if(r[k] !== undefined && r[k] !== '') data[k] = r[k]; });
    data.changeNote = 'นำเข้าจาก Excel';
    pr_saveStaff(db, data);
    if(hit) updated++; else { added++; staff = db.all('staff'); }
  });
  db.log('staff', 'นำเข้า Excel: เพิ่ม ' + added + ' คน, ปรับปรุง ' + updated + ' คน');
  return { added: added, updated: updated };
}
/* Copy names/positions/hire dates from the main HR system (never touches salary) */
function pr_syncFromMain(db, employees){
  if(!employees || !employees.length) throw new Error('อ่านข้อมูลพนักงานจากระบบ HR ไม่ได้ — ตรวจสอบ ID ของ Google Sheet ระบบ HR ในหน้าตั้งค่า');
  var staff = db.all('staff'), added = 0, updated = 0;
  employees.forEach(function(e){
    if(!e.name) return;
    var hit = staff.filter(function(s){ return (s.hrEmployeeId && s.hrEmployeeId === e.id) || (e.code && String(s.code) === String(e.code)) || String(s.name).replace(/\s+/g,'') === String(e.name).replace(/\s+/g,''); })[0];
    if(hit){
      hit.hrEmployeeId = e.id || hit.hrEmployeeId; hit.code = e.code || hit.code; hit.name = e.name; hit.position = e.position || hit.position;
      hit.department = e.department || hit.department; hit.hireDate = e.hireDate || hit.hireDate; hit.updatedAt = pr_nowIso();
      db.update('staff', hit); updated++;
    } else {
      db.insert('staff', { id: pr_id('s'), code: e.code || '', name: e.name, position: e.position || '', department: e.department || '', hireDate: e.hireDate || '',
                           salary: 0, status: 'active', fundOpening: 0, fundOpeningDate: '', hrEmployeeId: e.id || '', note: '', updatedAt: pr_nowIso() });
      added++;
    }
  });
  db.log('staff', 'ดึงรายชื่อจากระบบ HR: เพิ่ม ' + added + ' คน, ปรับปรุง ' + updated + ' คน');
  return { added: added, updated: updated };
}
function pr_deleteRound(db, id){
  var r = db.all('rounds').filter(function(x){ return x.id === id; })[0];
  if(!r) return null;
  if(r.status === 'applied') throw new Error('รอบที่ปรับเงินเดือนแล้วลบไม่ได้');
  db.all('roundItems').filter(function(i){ return i.roundId === id; }).forEach(function(i){ db.remove('roundItems', i.id); });
  db.remove('rounds', id);
  db.log('round', 'ลบร่าง' + pr_roundInfo(r.key).label);
  return { deleted: true };
}

/* Everything the UI needs in one payload */
function pr_snapshot(db){
  var cfg = pr_config(db);
  return {
    config: cfg,
    staff: db.all('staff'),
    contributions: db.all('contributions'),
    rounds: db.all('rounds'),
    roundItems: db.all('roundItems'),
    salaryHistory: db.all('salaryHistory'),
    logs: db.all('logs').slice(-60),
    balances: pr_fundBalances(db),
    serverToday: pr_ymd(new Date())
  };
}


/* =====================================================================
   Apps Script backend ของระบบเงินสะสม/เลื่อนเงินเดือน
   (ไฟล์นี้ถูกรวมกับ core.js เป็น payroll/Code.gs — ให้คัดลอก Code.gs ไปใช้)
   ===================================================================== */

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
function mainSheetRows_(sheetId, tab){
  if(!sheetId) return [];
  try{
    var ss = SpreadsheetApp.openById(sheetId);
    var sh = ss.getSheetByName(tab) || ss.getSheets().filter(function(s){ return s.getName().toLowerCase() === tab.toLowerCase(); })[0];
    if(!sh || sh.getLastRow() < 2) return [];
    var vals = sh.getDataRange().getValues();
    var head = vals.shift().map(String);
    return vals.map(function(r){
      var o = {}; head.forEach(function(h,i){ o[h] = r[i] instanceof Date ? Utilities.formatDate(r[i], PR_TZ, 'yyyy-MM-dd') : r[i]; }); return o;
    });
  }catch(e){ return []; }
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
    case 'syncFromMain': return pr_syncFromMain(db, mainSheetRows_(pr_config(db).mainSheetId, 'employees'));
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
  var db = SheetDB_();
  Object.keys(PAYROLL_TABLES).forEach(function(n){ db.all(n); });
  ensurePassword_();
  installDailyTrigger();
  Logger.log('พร้อมใช้งาน — รหัสผ่านเริ่มต้น: ' + INITIAL_ADMIN_PASSWORD + ' (เข้าระบบแล้วเปลี่ยนทันที)');
}
