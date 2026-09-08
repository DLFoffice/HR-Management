/* ===== reports-selfservice.js ===== */
/* ================= REPORTS ================= */
function computeEmployeeSummary(empId){
  const emp = employeeById(empId);
  if(!emp) return null;
  const fy = fiscalYearRange();
  const leaves = state.leaves.filter(l=>l.employeeId===empId && l.startDate && inRange(l.startDate, fy.start, fy.end) && isApproved(l));
  const used = {'ป':0,'พ':0,'ก':0};
  leaves.forEach(l=>{ if(used[l.leaveType]!==undefined) used[l.leaveType]+=Number(l.days||0); });
  const leaveSummary = [
    {label:'ลาป่วย', right:safeNum(emp.sickRight), carry:safeNum(emp.carrySick), used:used['ป']},
    {label:'ลาพักผ่อน', right:safeNum(emp.vacationRight), carry:safeNum(emp.carryVacation), used:used['พ']},
    {label:'ลากิจ', right:safeNum(emp.personalRight), carry:safeNum(emp.carryPersonal), used:used['ก']}
  ].map(r=>({...r, total:r.right+r.carry, remaining:r.right+r.carry-r.used}));

  const loans = state.loans.filter(l=>l.employeeId===empId && isApproved(l));
  const loanSummary = LOAN_TYPES.map(type=>{
    const active = loans.filter(l=>l.loanType===type && (l.status||'active')==='active');
    const current = active.reduce((s,l)=>s+loanRemaining(l),0);
    const limit = type==='เงินกู้สามัญ' ? safeNum(emp.loanNormalLimit) : safeNum(emp.loanEmergencyLimit);
    return {label:type, limit, current};
  });

  const welfare = state.welfare.filter(w=>w.employeeId===empId && w.submitDate && inRange(w.submitDate, fy.start, fy.end) && isApproved(w));
  const welfareSummary = WELFARE_CATS.map(c=>{
    const usedAmt = welfare.filter(w=>w.category===c.label).reduce((s,w)=>s+Number(w.approvedAmount||0),0);
    const limit = safeNum(emp[c.limitField]);
    return {label:c.label, limit, used:usedAmt, remaining: Math.max(limit-usedAmt,0)};
  });

  return {emp, leaveSummary, loanSummary, welfareSummary, fy};
}

function viewReports(){
  return `
  <div class="page-header">
    <div><h1>รายงาน</h1><div class="sub">ดูสรุปรายบุคคลหรือรายงานภาพรวม แล้วสั่งพิมพ์เป็น PDF ได้ทันที</div></div>
  </div>
  <div class="pill-nav">
    <button data-report="individual" class="active">สรุปรายบุคคล</button>
    <button data-report="overall">สรุปภาพรวมทุกคน</button>
  </div>
  <div id="reportBody"></div>
  `;
}

function renderReportIndividual(){
  const body = document.getElementById('reportBody');
  body.innerHTML = `
  <div class="panel">
    <div class="searchbar">
      <select id="reportEmpSelect" style="flex:1;"><option value="">-- เลือกพนักงาน --</option>${empOptionsHtml('')}</select>
      <button class="btn btn-gold" id="btnPrintIndividual" disabled>พิมพ์ / บันทึก PDF</button>
    </div>
    <div id="individualPreview"></div>
  </div>`;
  document.getElementById('reportEmpSelect').addEventListener('change', (e)=>{
    const id = e.target.value;
    const printBtn = document.getElementById('btnPrintIndividual');
    if(!id){ document.getElementById('individualPreview').innerHTML=''; printBtn.disabled=true; return; }
    const summary = computeEmployeeSummary(id);
    document.getElementById('individualPreview').innerHTML = individualReportHtml(summary);
    printBtn.disabled = false;
    printBtn.onclick = ()=> printDocument(individualReportHtml(summary, true), {title: 'รายงานสรุปรายบุคคล'});
  });
}

function individualReportHtml(s, forPrint, skipHeader){
  const e = s.emp;
  return `
  ${skipHeader ? '' : `
  <div class="doc-header">
    ${state.settings.logoUrl? `<img src="${esc(state.settings.logoUrl)}" style="height:44px; object-fit:contain; margin-bottom:8px;">` : ''}
    <div class="org">รายงานสรุปข้อมูลบุคลากรรายบุคคล</div>
    <div class="title" style="display:flex; align-items:center; justify-content:center; gap:10px;">${avatarHtml(e,36)}${esc(e.name)}</div>
  </div>`}
  <div class="doc-meta">
    <div><span class="k">รหัสพนักงาน: </span>${esc(e.code)}</div>
    <div><span class="k">วันเข้าทำงาน: </span>${buddhistDate(e.hireDate)}</div>
    <div><span class="k">ตำแหน่ง: </span>${esc(e.position)}</div>
    <div><span class="k">อายุงานปัจจุบัน: </span>${ageFromDate(e.hireDate)}</div>
    <div><span class="k">กลุ่มงาน: </span>${esc(e.department)}</div>
    <div><span class="k">วันเกิด: </span>${buddhistDate(e.birthDate)}</div>
    <div></div>
    <div><span class="k">วันเกษียณอายุ: </span>${buddhistDate(e.retireDate)}</div>
  </div>

  <div class="doc-section-title">สรุปวันลา ปีงบประมาณ ${s.fy.start.getFullYear()+543}-${s.fy.end.getFullYear()+543}</div>
  <table class="reg"><thead><tr><th>หมวดวันลา</th><th class="num">สิทธิ์ตั้งต้น</th><th class="num">สะสมยกมา</th><th class="num">รวมสิทธิ์</th><th class="num">ใช้ไปแล้ว</th><th class="num">คงเหลือ</th></tr></thead>
  <tbody>${s.leaveSummary.map(r=>`<tr><td>${r.label}</td><td class="num">${r.right}</td><td class="num">${r.carry}</td><td class="num">${r.total}</td><td class="num">${r.used}</td><td class="num">${r.remaining}</td></tr>`).join('')}</tbody></table>

  <div class="doc-section-title">สรุปเงินกู้</div>
  <table class="reg"><thead><tr><th>หมวดเงินกู้</th><th class="num">วงเงินสิทธิ์สูงสุด</th><th class="num">ยอดคงค้างปัจจุบัน</th></tr></thead>
  <tbody>${s.loanSummary.map(r=>`<tr><td>${r.label}</td><td class="num">${money(r.limit)}</td><td class="num">${money(r.current)}</td></tr>`).join('')}</tbody></table>

  <div class="doc-section-title">สรุปสวัสดิการและประกันสังคม (ปีงบประมาณนี้)</div>
  <table class="reg"><thead><tr><th>รายการ</th><th class="num">วงเงินสิทธิ์</th><th class="num">เบิกใช้ไปแล้ว</th><th class="num">คงเหลือ</th></tr></thead>
  <tbody>${s.welfareSummary.map(r=>`<tr><td>${r.label}</td><td class="num">${money(r.limit)}</td><td class="num">${money(r.used)}</td><td class="num">${money(r.remaining)}</td></tr>`).join('')}</tbody></table>
  ${forPrint? `<div style="margin-top:26px; font-size:12px; color:var(--ink-soft);">พิมพ์เมื่อ ${buddhistDate(todayStr())}</div>` : ''}
  `;
}

function renderReportOverall(){
  const body = document.getElementById('reportBody');
  const fy = fiscalYearRange();
  const rows = state.employees.map(e=>{
    const s = computeEmployeeSummary(e.id);
    const totalUsed = s.leaveSummary.reduce((a,r)=>a+r.used,0);
    const totalRemaining = s.leaveSummary.reduce((a,r)=>a+r.remaining,0);
    const loanCurrent = s.loanSummary.reduce((a,r)=>a+r.current,0);
    const welfareUsed = s.welfareSummary.reduce((a,r)=>a+r.used,0);
    return {e, totalUsed, totalRemaining, loanCurrent, welfareUsed};
  });
  body.innerHTML = `
  <div class="panel">
    <div class="searchbar"><div class="muted" style="flex:1; font-size:13.5px;">ปีงบประมาณ ${fy.start.getFullYear()+543}-${fy.end.getFullYear()+543}</div>
      <button class="btn btn-gold" id="btnPrintOverall">พิมพ์ / บันทึก PDF</button>
    </div>
    <div class="table-wrap" id="overallTableWrap">${overallReportHtml(rows, fy)}</div>
  </div>`;
  document.getElementById('btnPrintOverall').addEventListener('click', ()=> printDocument(overallReportHtml(rows, fy, true), {title: 'รายงานสรุปภาพรวมพนักงาน'}));
}

function overallReportHtml(rows, fy, forPrint){
  return `
  ${forPrint? `<div class="doc-header">${state.settings.logoUrl? `<img src="${esc(state.settings.logoUrl)}" style="height:44px; object-fit:contain; margin-bottom:8px;">` : ''}<div class="org">รายงานสรุปภาพรวมบุคลากร</div><div class="title">ปีงบประมาณ ${fy.start.getFullYear()+543}-${fy.end.getFullYear()+543}</div></div>` : ''}
  <table class="reg"><thead><tr>
    <th class="rownum">#</th><th>ชื่อ-นามสกุล</th><th>กลุ่มงาน</th>
    <th class="num">วันลาใช้ไป</th><th class="num">วันลาคงเหลือ</th><th class="num">เงินกู้คงค้าง</th><th class="num">สวัสดิการที่เบิกแล้ว</th>
  </tr></thead>
  <tbody>${rows.length? rows.map((r,i)=>`
    <tr><td class="rownum">${i+1}</td><td>${esc(r.e.name)}</td><td>${esc(r.e.department)}</td>
    <td class="num">${r.totalUsed}</td><td class="num">${r.totalRemaining}</td><td class="num">${money(r.loanCurrent)}</td><td class="num">${money(r.welfareUsed)}</td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="7">ยังไม่มีข้อมูลพนักงาน</td></tr>'}</tbody></table>
  ${forPrint? `<div style="margin-top:20px; font-size:12px; color:var(--ink-soft);">พิมพ์เมื่อ ${buddhistDate(todayStr())}</div>` : ''}
  `;
}

/* ================= PRINT ENGINE ==================
   Opens a dedicated preview window instead of printing the current page —
   gives a clean isolated layout with a repeating page header (via a real
   <thead>, which browsers repeat automatically on every printed page),
   a visible "print / save as PDF" toolbar, and a live on-screen paper
   preview. Avoids fighting the app's own CSS/sidebar during print. */
const PRINT_DOC_CSS = `
:root{
  --lav:#8B7FF0; --lav-2:#A79BFF; --lav-deep:#6558D3; --lav-bg:#EEEBFF;
  --mint:#4FD1B5; --peach:#FF9F7A; --pink:#FF8FB8; --sun:#FFC24B;
  --ink:#2C2A45; --ink-soft:#7B7897; --ink-faint:#A7A4C2;
  --line:#EAE7FA; --line-strong:#D9D4F5;
  --green:#37B893; --green-bg:#DEFBF3; --red:#FF6B7A; --red-bg:#FFE4E7;
  --amber:#F0A93F; --amber-bg:#FFF1DA; --ease:cubic-bezier(.22,1,.36,1);
}
table.reg{width:100%; border-collapse:collapse; font-size:12.5px;}
table.reg th{ text-align:left; font-weight:700; color:var(--lav-deep); padding:8px 10px; border-bottom:2px solid var(--line-strong); font-size:11px; white-space:nowrap; background:var(--lav-bg); }
table.reg td{ padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:middle; }
table.reg th.num, table.reg td.num{font-variant-numeric:tabular-nums; text-align:right;}
table.reg th.rownum, table.reg td.rownum{color:var(--ink-faint); font-size:11px; width:26px; text-align:left;}
.tag{display:inline-block; padding:3px 11px; border-radius:20px; font-size:11px; font-weight:600;}
.tag-green{background:var(--green-bg); color:var(--green);}
.tag-red{background:var(--red-bg); color:var(--red);}
.tag-amber{background:var(--amber-bg); color:var(--amber);}
.tag-navy{background:var(--lav-bg); color:var(--lav-deep);}
.doc-header{text-align:center; border-bottom:2px solid var(--lav-deep); padding-bottom:12px; margin-bottom:18px;}
.doc-header .org{font-size:13px; color:var(--ink-soft);}
.doc-header .title{font-size:18px; font-weight:700; color:var(--ink); margin-top:4px;}
.doc-meta{display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; font-size:12.5px; margin-bottom:18px;}
.doc-meta div span.k{color:var(--ink-soft);}
.doc-section-title{font-size:13.5px; font-weight:700; color:var(--lav-deep); margin:18px 0 8px; border-bottom:2px solid var(--lav-bg); padding-bottom:5px;}
.leave-doc{ max-width:100%; margin:0 auto; font-size:13px; line-height:1.85; color:#202020; }
.leave-doc-title{ text-align:center; font-size:19px; font-weight:700; letter-spacing:.3px; color:#111; padding-bottom:14px; margin-bottom:18px; border-bottom:2.5px solid #202020; }
.leave-doc-meta{ text-align:right; font-size:12px; color:#555; margin-bottom:16px; }
.leave-doc-meta div{margin-bottom:2px;}
.leave-doc-intro{margin-bottom:14px;}
.leave-doc-field{margin-bottom:9px;}
.leave-doc-indent{padding-left:36px;}
.leave-doc-label{font-weight:700; color:#111;}
.leave-doc-checks{ display:flex; flex-wrap:wrap; column-gap:30px; row-gap:7px; margin:4px 0 12px; padding-left:36px; }
.leave-doc-check{white-space:nowrap; font-size:13px;}
.leave-doc-blank{border-bottom:1px dotted #999; display:inline-block; min-width:52px; padding:0 3px;}
.leave-doc-block{ margin:14px 0; padding:12px 14px; background:#F7F7FA; border:1px solid #E4E4EC; border-radius:8px; }
.leave-doc-block-title{font-weight:700; font-size:12px; color:#555; margin-bottom:6px; letter-spacing:.2px;}
.leave-doc-block .leave-doc-field{margin-bottom:6px;}
.leave-doc-block .leave-doc-field:last-child{margin-bottom:0;}
.leave-doc-section{margin-top:22px; padding-top:16px; border-top:1px dashed #ccc;}
.leave-doc-section-title{font-weight:700; margin-bottom:9px; color:#222; font-size:13.5px;}
.leave-doc-sign{text-align:center; margin-top:26px;}
.leave-doc-sign .sign-line{margin:30px 0 4px;}
.leave-doc-approval{ display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-top:24px; padding-top:18px; border-top:1px solid #ddd; }
.leave-doc-approval .col-title{font-weight:700; margin-bottom:12px;}
.leave-doc-approval .approval-line{border-bottom:1px dotted #999; height:20px; margin-bottom:7px;}
.leave-doc-approval .approval-order{display:flex; align-items:center; gap:18px; flex-wrap:wrap;}
.leave-doc-approval .approval-sign{text-align:center;}
.orgchart-wrap{padding:6px 0;}
.org-head-wrap{display:flex; flex-direction:column; align-items:center;}
.org-head-box{ display:inline-flex; align-items:center; gap:10px; background:linear-gradient(135deg, #123A6B 0%, #2E7DC9 100%); color:#fff; padding:10px 18px; border-radius:14px; }
.org-head-name{font-size:14px; font-weight:700;}
.org-head-title{font-size:11px; color:#DCEBFF; margin-top:2px;}
.org-head-stem{width:2px; height:22px; background:var(--line-strong); margin:0 auto;}
.org-branch{display:flex; justify-content:center; gap:12px; position:relative; padding-top:22px; flex-wrap:wrap;}
.org-col{position:relative; flex:1; min-width:110px; max-width:170px;}
.org-col-head{ background:linear-gradient(135deg, var(--lav) 0%, var(--lav-2) 100%); color:#fff; font-size:11px; font-weight:700; text-align:center; padding:7px 6px; border-radius:10px; margin-bottom:8px; min-height:32px; display:flex; align-items:center; justify-content:center; }
.org-col-list{display:flex; flex-direction:column; gap:5px;}
.org-person{ display:flex; align-items:center; gap:6px; background:#fff; border:1px solid var(--line); border-radius:8px; padding:5px 6px; }
.org-person-info{min-width:0;}
.org-person-name{font-size:10.5px; color:var(--ink); line-height:1.3;}
.org-person-pos{font-size:9px; color:var(--ink-faint); line-height:1.3;}
.org-leader{background:var(--lav-bg); border-color:var(--lav-2);}
.org-leader .org-person-name{font-weight:700; color:var(--lav-deep);}
.avatar{border-radius:50%; object-fit:cover; flex-shrink:0;}
.avatar-fallback{border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--lav-bg); color:var(--lav-deep); font-weight:700; flex-shrink:0;}
`;

function printDocument(html, opts){
  opts = opts || {};
  // open the window synchronously (before any await) so the browser doesn't
  // treat it as an unrequested popup and block it
  const printWin = window.open('', '_blank');
  if(!printWin){
    toast('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต popup ของเว็บนี้แล้วลองใหม่');
    return;
  }

  const title = esc(opts.title || 'เอกสาร');
  const logoImg = state.settings.logoUrl
    ? `<img src="${esc(state.settings.logoUrl)}" class="pph-logo" alt="โลโก้">` : '';
  const headerHtml = `
    <div class="pph-wrap">
      <div class="pph-row">
        ${logoImg}
        <div class="pph-text">
          <div class="pph-title">${title}</div>
          <div class="pph-sub">${esc(ORG_FULL_NAME)}</div>
        </div>
      </div>
      <div class="pph-bar"></div>
    </div>`;

  const dateStr = buddhistDate(todayStr());
  const docHtml = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin:0; padding:0; background:#e5e7eb; font-family:'Noto Sans Thai',sans-serif; color:#161c26; }
  table.pdf-print-table { width:100%; border-collapse:collapse; background:#fff; }
  table.pdf-print-table thead { display: table-header-group; }
  table.pdf-print-table td { padding:0; }
  tr, .pdf-noBreak { page-break-inside: avoid; break-inside: avoid; }
  .pph-wrap { padding:10px 30px 8px; }
  .pph-row { display:flex; align-items:center; gap:14px; }
  .pph-logo { height:40px; width:auto; object-fit:contain; flex-shrink:0; }
  .pph-text { flex:1; text-align:center; }
  .pph-title { font-size:15px; font-weight:700; margin:2px 0; color:#1e2f4f; }
  .pph-sub { font-size:10.5px; color:#666; }
  .pph-bar { margin-top:7px; height:3px; border-radius:2px; background:linear-gradient(90deg,#6558D3 0%,#6558D3 70%,#A79BFF 100%); }
  .pdf-print-footnote { text-align:right; font-size:9px; color:#999; padding:10px 30px 0; }
  .pdf-print-toolbar { position:sticky; top:0; z-index:10; background:#1e2f4f; color:#fff; padding:10px 16px;
    display:flex; align-items:center; justify-content:space-between; font-size:13px; font-family:'Noto Sans Thai',sans-serif; gap:10px; }
  .pdf-print-toolbar button { font-family:'Noto Sans Thai',sans-serif; font-size:13px; font-weight:600; padding:7px 16px;
    border:none; border-radius:8px; background:#6558D3; color:#fff; cursor:pointer; }
  .pdf-print-toolbar span { opacity:.85; }
  @media print {
    html, body { background:#fff; }
    .pdf-print-toolbar { display:none !important; }
    table.pdf-print-table { box-shadow:none !important; margin:0 !important; }
  }
  @media screen {
    table.pdf-print-table { max-width:210mm; margin:16px auto; box-shadow:0 2px 14px rgba(0,0,0,.15); }
  }
  ${PRINT_DOC_CSS}
</style>
</head><body>
  <div class="pdf-print-toolbar">
    <span>ตรวจดูตัวอย่างก่อนพิมพ์ — กด "พิมพ์ / บันทึกเป็น PDF" แล้วเลือกปลายทางเป็น <b>Save as PDF</b> ในกล่องพิมพ์</span>
    <button onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button>
  </div>
  <table class="pdf-print-table">
    <thead><tr><td>${headerHtml}</td></tr></thead>
    <tbody><tr><td style="padding:16px 30px;">${html}</td></tr></tbody>
  </table>
  <div class="pdf-print-footnote">พิมพ์จากระบบเมื่อ ${dateStr}</div>
</body></html>`;

  printWin.document.open();
  printWin.document.write(docHtml);
  printWin.document.close();
}

/* ---------------- Official leave request form (printable) ----------------
   Matches the organization's paper form: "ใบลาป่วย ลาคลอด และลากิจ" for
   sick/personal leave, and "แบบใบลาพักผ่อน" for vacation leave. */
const ORG_FULL_NAME = 'มูลนิธิการศึกษาทางไกลผ่านดาวเทียม ในพระบรมราชูปถัมภ์';
const THAI_MONTHS_LONG = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

function thaiLongDateParts(dstr){
  if(!dstr) return {day:'', month:'', year:''};
  const d = new Date(dstr+'T00:00:00');
  if(isNaN(d)) return {day:'', month:'', year:''};
  return { day:d.getDate(), month:THAI_MONTHS_LONG[d.getMonth()], year:d.getFullYear()+543 };
}
function checkbox(on){ return on ? '☑' : '☐'; }
function blankOr(v){
  if(v===undefined || v===null || v==='') return '<span class="leave-doc-blank">&nbsp;</span>';
  return esc(v);
}

function findPreviousLeaveOfType(rec){
  const prior = state.leaves.filter(l=>
    l.employeeId===rec.employeeId && l.leaveType===rec.leaveType && l.id!==rec.id &&
    l.startDate && rec.startDate && l.startDate < rec.startDate
  ).sort((a,b)=> new Date(b.startDate) - new Date(a.startDate));
  return prior[0] || null;
}

function leaveStatsTableHtml(empId, currentRec){
  const s = computeEmployeeSummary(empId);
  if(currentRec && currentRec.leaveType && !isApproved(currentRec)){
    // the leave being printed isn't counted yet by computeEmployeeSummary (only approved
    // leaves are) — add it in so the printed form reflects the balance including this request
    const row = s.leaveSummary.find(r=>r.label===LEAVE_TYPES[currentRec.leaveType]);
    if(row){
      row.used = row.used + Number(currentRec.days||0);
      row.remaining = row.total - row.used;
    }
  }
  return `
  <table class="reg leave-print-stats-table">
    <thead><tr><th>ประเภทวันลา</th><th class="num">สิทธิ์รวม</th><th class="num">ใช้ไปแล้ว (รวมครั้งนี้)</th><th class="num">คงเหลือ</th></tr></thead>
    <tbody>${s.leaveSummary.map(r=>`<tr><td>${esc(r.label)}</td><td class="num">${r.total}</td><td class="num">${r.used}</td><td class="num">${r.remaining}</td></tr>`).join('')}</tbody>
  </table>`;
}

function leaveFormPrintHtml(rec){
  const emp = employeeById(rec.employeeId) || {};
  const submit = thaiLongDateParts(rec.submitDate);
  const isVacation = rec.leaveType==='พ';
  if(isVacation) return vacationFormPrintHtml(rec, emp, submit);
  return sickPersonalFormPrintHtml(rec, emp, submit);
}
function leaveFormTitle(rec){
  return rec.leaveType==='พ' ? 'แบบใบลาพักผ่อน' : 'ใบลาป่วย ลาคลอด และลากิจ';
}

function sickPersonalFormPrintHtml(rec, emp, submit){
  const prev = findPreviousLeaveOfType(rec);
  const isSick = rec.leaveType==='ป';
  const isPersonal = rec.leaveType==='ก';
  return `
  <div class="leave-doc">
    <div class="leave-doc-meta">
      <div>วันที่ ${blankOr(submit.day)} เดือน ${blankOr(submit.month)} พ.ศ. ${blankOr(submit.year)}</div>
    </div>

    <div class="leave-doc-intro">
      <div class="leave-doc-field"><span class="leave-doc-label">เรื่อง</span>&emsp;ขออนุญาตลา${isSick?'ป่วย':isPersonal?'กิจ':''}</div>
      <div class="leave-doc-field"><span class="leave-doc-label">เรียน</span>&emsp;หัวหน้าสำนักงาน</div>
      <div class="leave-doc-field leave-doc-indent">ข้าพเจ้า ${blankOr(emp.name)} ตำแหน่ง ${blankOr(emp.position)}</div>
      <div class="leave-doc-field leave-doc-indent">สังกัด (สถานี/สำนักงาน) ${blankOr(emp.department)} ${esc(ORG_FULL_NAME)}</div>
    </div>

    <div class="leave-doc-field leave-doc-indent" style="margin-bottom:2px;"><span class="leave-doc-label">ขอลา</span></div>
    <div class="leave-doc-checks">
      <span class="leave-doc-check">${checkbox(isSick)} ป่วย เนื่องจาก ${blankOr(isSick?rec.reason:'')}</span>
      <span class="leave-doc-check">${checkbox(isPersonal)} ลากิจส่วนตัว เนื่องจาก ${blankOr(isPersonal?rec.reason:'')}</span>
      <span class="leave-doc-check">${checkbox(false)} คลอดบุตร</span>
      <span class="leave-doc-check">${checkbox(false)} อื่นๆ ${blankOr('')}</span>
    </div>
    <div class="leave-doc-field leave-doc-indent">ตั้งแต่วันที่ ${blankOr(buddhistDate(rec.startDate))} ถึงวันที่ ${blankOr(buddhistDate(rec.endDate))} มีกำหนด ${blankOr(rec.days)} วัน</div>

    <div class="leave-doc-field" style="margin:14px 0 2px;"><span class="leave-doc-label">ข้าพเจ้าได้ลา</span> (สถิติการลาครั้งก่อนหน้าในประเภทเดียวกัน)</div>
    <div class="leave-doc-checks" style="padding-left:0;">
      <span class="leave-doc-check">${checkbox(isSick)} ป่วย</span>
      <span class="leave-doc-check">${checkbox(isPersonal)} กิจส่วนตัว</span>
      <span class="leave-doc-check">${checkbox(false)} คลอดบุตร</span>
      <span class="leave-doc-check">${checkbox(false)} อื่นๆ</span>
    </div>
    <div class="leave-doc-field">ครั้งสุดท้ายตั้งแต่วันที่ ${prev?blankOr(buddhistDate(prev.startDate)):blankOr('')} ถึงวันที่ ${prev?blankOr(buddhistDate(prev.endDate)):blankOr('')} มีกำหนด ${prev?blankOr(prev.days):blankOr('')} วัน</div>

    <div class="leave-doc-block">
      <div class="leave-doc-block-title">ระหว่างลาสามารถติดต่อได้ที่</div>
      <div class="leave-doc-field">บ้านเลขที่ ${blankOr(rec.contactAddress)} ตรอก/ซอย ${blankOr(rec.contactSoi)}</div>
      <div class="leave-doc-field">ตำบล/แขวง ${blankOr(rec.contactTambon)} อำเภอ/เขต ${blankOr(rec.contactAmphoe)} จังหวัด ${blankOr(rec.contactProvince)}</div>
      <div class="leave-doc-field">โทรศัพท์ ${blankOr(rec.contactPhone)}</div>
    </div>

    <div class="leave-doc-sign">
      <div>ขอแสดงความนับถือ</div>
      <div class="sign-line">.......................................................</div>
      <div>( ${esc(emp.name||'')} )</div>
    </div>

    <div class="leave-doc-section">
      <div class="leave-doc-section-title">สถิติการลาในปีนี้</div>
      ${leaveStatsTableHtml(rec.employeeId, rec)}
    </div>

    <div class="leave-doc-approval">
      <div>
        <div class="col-title">ความเห็นผู้บังคับบัญชา</div>
        <div class="approval-line">&nbsp;</div>
        <div class="approval-line">&nbsp;</div>
        <div class="approval-sign">
          <div style="margin-top:10px;">ลงชื่อ ........................................</div>
          <div style="margin-top:4px;">วันที่ ...../...../.....</div>
        </div>
      </div>
      <div>
        <div class="col-title">คำสั่ง&emsp;${checkbox(false)} อนุญาต&emsp;&emsp;${checkbox(false)} ไม่อนุญาต</div>
        <div class="approval-sign" style="margin-top:34px;">
          <div>ลงชื่อ ........................................</div>
          <div style="margin-top:4px;">( ........................................ )</div>
          <div style="margin-top:4px;">วันที่ ...../...../.....</div>
        </div>
      </div>
    </div>
  </div>`;
}

function vacationFormPrintHtml(rec, emp, submit){
  const s = computeEmployeeSummary(rec.employeeId);
  const vac = s.leaveSummary.find(r=>r.label==='ลาพักผ่อน') || {right:0, carry:0, total:0};
  return `
  <div class="leave-doc">
    <div class="leave-doc-meta">
      <div>วันที่ ${blankOr(submit.day)} เดือน ${blankOr(submit.month)} พ.ศ. ${blankOr(submit.year)}</div>
    </div>

    <div class="leave-doc-intro">
      <div class="leave-doc-field"><span class="leave-doc-label">เรื่อง</span>&emsp;ขออนุญาตลาพักผ่อน</div>
      <div class="leave-doc-field"><span class="leave-doc-label">เรียน</span>&emsp;หัวหน้าสำนักงานมูลนิธิฯ</div>
      <div class="leave-doc-field leave-doc-indent">ข้าพเจ้า ${blankOr(emp.name)} ตำแหน่ง ${blankOr(emp.position)}</div>
    </div>

    <div class="leave-doc-block">
      <div class="leave-doc-block-title">สิทธิวันลาพักผ่อน</div>
      <div class="leave-doc-field">วันลาพักผ่อนสะสม ${blankOr(vac.carry)} วันทำการ &nbsp;+&nbsp; สิทธิพักผ่อนประจำปีนี้ ${blankOr(vac.right)} วันทำการ &nbsp;=&nbsp; รวม ${blankOr(vac.total)} วันทำการ</div>
    </div>

    <div class="leave-doc-field">ขอลาพักผ่อนตั้งแต่วันที่ ${blankOr(buddhistDate(rec.startDate))} ถึงวันที่ ${blankOr(buddhistDate(rec.endDate))} มีกำหนด ${blankOr(rec.days)} วันทำการ</div>

    <div class="leave-doc-block">
      <div class="leave-doc-block-title">ระหว่างลาสามารถติดต่อได้ที่</div>
      <div class="leave-doc-field">บ้านเลขที่ ${blankOr(rec.contactAddress)} ตรอก/ซอย ${blankOr(rec.contactSoi)}</div>
      <div class="leave-doc-field">ตำบล/แขวง ${blankOr(rec.contactTambon)} อำเภอ/เขต ${blankOr(rec.contactAmphoe)} จังหวัด ${blankOr(rec.contactProvince)}</div>
      <div class="leave-doc-field">โทรศัพท์ ${blankOr(rec.contactPhone)}</div>
    </div>

    <div class="leave-doc-sign">
      <div>ขอแสดงความนับถือ</div>
      <div class="sign-line">.......................................................</div>
      <div>( ${esc(emp.name||'')} )</div>
    </div>

    <div class="leave-doc-section">
      <div class="leave-doc-section-title">สถิติการลาในปีนี้</div>
      ${leaveStatsTableHtml(rec.employeeId, rec)}
    </div>

    <div class="leave-doc-approval" style="grid-template-columns:1fr;">
      <div>
        <div class="col-title">คำสั่ง&emsp;${checkbox(false)} อนุญาต&emsp;&emsp;${checkbox(false)} ไม่อนุญาต</div>
        <div class="leave-doc-sign approval-sign" style="margin-top:34px;">
          <div>ลงชื่อ ........................................</div>
          <div style="margin-top:4px;">( ........................................ )</div>
          <div style="margin-top:4px;">วันที่ ...../...../.....</div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ================= SELF-SERVICE (employee portal) ================= */
function viewMyHome(){
  const emp = currentEmployee();
  if(!emp) return `<div class="panel">ไม่พบข้อมูลพนักงานของคุณ กรุณาติดต่อผู้ดูแลระบบ</div>`;
  const summary = computeEmployeeSummary(emp.id);
  return `
  <div class="page-header">
    <div><h1>ข้อมูลของฉัน</h1><div class="sub">สวัสดี ${esc(emp.name)}</div></div>
  </div>
  <div class="panel">
    <div style="display:flex; align-items:center; gap:16px; margin-bottom:6px;">
      ${avatarHtml(emp,64)}
      <div>
        <h3 style="margin:0 0 3px;">${esc(emp.name)}</h3>
        <div class="muted" style="font-size:13px;">${esc(emp.position)} · ${esc(emp.department)}</div>
      </div>
    </div>
  </div>
  <div class="panel">${individualReportHtml(summary, false, true)}</div>
  <div class="grid grid-3">
    <div class="panel" style="text-align:center;">
      <div class="muted" style="font-size:12.5px; margin-bottom:10px;">ต้องการยื่นขอลา?</div>
      <button class="btn btn-primary" id="btnQuickLeave" style="width:100%; justify-content:center;">+ ยื่นขอลา</button>
    </div>
    <div class="panel" style="text-align:center;">
      <div class="muted" style="font-size:12.5px; margin-bottom:10px;">ต้องการยื่นขอกู้เงิน?</div>
      <button class="btn btn-primary" id="btnQuickLoan" style="width:100%; justify-content:center;">+ ยื่นขอกู้เงิน</button>
    </div>
    <div class="panel" style="text-align:center;">
      <div class="muted" style="font-size:12.5px; margin-bottom:10px;">ต้องการเบิกสวัสดิการ?</div>
      <button class="btn btn-primary" id="btnQuickWelfare" style="width:100%; justify-content:center;">+ ยื่นเบิกสวัสดิการ</button>
    </div>
  </div>
  `;
}

function selfRecordActionsHtml(sheet, rec){
  if((rec.approvalStatus||'approved') !== 'pending') return '';
  return `<button class="btn btn-sm" data-self-edit="${sheet}:${rec.id}">แก้ไข</button>
    <button class="btn btn-sm btn-danger" data-self-del="${sheet}:${rec.id}">ลบ</button>`;
}
function bindSelfRecordActions(container, editFns){
  container.querySelectorAll('[data-self-edit]').forEach(b=>b.addEventListener('click', ()=>{
    const [sheet,id] = b.dataset.selfEdit.split(':');
    editFns[sheet](id);
  }));
  container.querySelectorAll('[data-self-del]').forEach(b=>b.addEventListener('click', ()=>{
    const [sheet,id] = b.dataset.selfDel.split(':');
    if(confirm('ยืนยันลบรายการนี้?')) crudDelete(sheet, id);
  }));
}

let selfLeaveCalState = { year: new Date().getFullYear(), month: new Date().getMonth() };

function viewMyLeaves(){
  const empId = currentEmployeeId();
  const rows = state.leaves.filter(l=>l.employeeId===empId).sort((a,b)=> new Date(b.startDate||0)-new Date(a.startDate||0));
  return `
  <div class="page-header">
    <div><h1>วันลาของฉัน</h1><div class="sub">รวม ${rows.length} รายการ</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddLeave">+ ยื่นขอลา</button></div>
  </div>
  <div class="panel" id="myLeaveCalendarPanel">${leaveCalendarHtml(selfLeaveCalState, rows)}</div>
  <div class="panel">
    <div class="table-wrap"><table class="reg" id="myLeaveTable">
      <thead><tr><th class="rownum">#</th><th class="num">วันที่ยื่น</th><th>ประเภท</th><th class="num">ลาตั้งแต่</th><th class="num">ถึงวันที่</th><th class="num">จำนวนวัน</th><th>เหตุผล</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((l,i)=>`
        <tr class="row-clickable" data-leave-id="${l.id}">
          <td class="rownum">${i+1}</td><td class="num">${buddhistDate(l.submitDate)}</td>
          <td>${leaveTypeTag(l.leaveType)}</td>
          <td class="num">${buddhistDate(l.startDate)}</td><td class="num">${buddhistDate(l.endDate)}</td>
          <td class="num">${l.days}</td><td>${esc(l.reason)}</td><td>${approvalTag(l)}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-sm btn-gold" data-print-leave="${l.id}">พิมพ์ใบลา</button>
            ${selfRecordActionsHtml('leaves', l)}
          </td>
        </tr>`).join('') : `<tr class="empty-row"><td colspan="9">ยังไม่มีรายการลา</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

function refreshSelfLeaveCalendar(){
  const empId = currentEmployeeId();
  const rows = state.leaves.filter(l=>l.employeeId===empId);
  const panel = document.getElementById('myLeaveCalendarPanel');
  if(!panel) return;
  panel.innerHTML = leaveCalendarHtml(selfLeaveCalState, rows);
  bindLeaveCalendarEvents(panel, selfLeaveCalState, rows, refreshSelfLeaveCalendar);
}

function viewMyLoans(){
  const empId = currentEmployeeId();
  const rows = state.loans.filter(l=>l.employeeId===empId).sort((a,b)=> new Date(b.submitDate||0)-new Date(a.submitDate||0));
  return `
  <div class="page-header">
    <div><h1>เงินกู้ของฉัน</h1><div class="sub">รวม ${rows.length} รายการ</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddLoan">+ ยื่นขอกู้เงิน</button></div>
  </div>
  <div class="panel">
    <div class="table-wrap"><table class="reg" id="myLoanTable">
      <thead><tr><th class="rownum">#</th><th>ประเภท</th><th class="num">วงเงินอนุมัติ</th><th class="num">คงเหลือ</th><th>สถานะ</th><th>อนุมัติ</th><th>จัดการ</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((l,i)=>{
          const remaining = loanRemaining(l);
          const status = l.status||'active';
          return `<tr class="row-clickable" data-loan-id="${l.id}">
          <td class="rownum">${i+1}</td><td>${esc(l.loanType)}</td>
          <td class="num">${money(l.approvedAmount)}</td><td class="num">${money(remaining)}</td>
          <td>${status==='closed'?'<span class="tag tag-green">ปิดบัญชีแล้ว</span>':'<span class="tag tag-amber">กำลังผ่อน</span>'}</td>
          <td>${approvalTag(l)}</td>
          <td style="white-space:nowrap;">${selfRecordActionsHtml('loans', l)}</td>
        </tr>`;
        }).join('') : `<tr class="empty-row"><td colspan="7">ยังไม่มีรายการเงินกู้</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

function viewMyWelfare(){
  const empId = currentEmployeeId();
  const rows = state.welfare.filter(w=>w.employeeId===empId).sort((a,b)=> new Date(b.submitDate||0)-new Date(a.submitDate||0));
  return `
  <div class="page-header">
    <div><h1>สวัสดิการของฉัน</h1><div class="sub">รวม ${rows.length} รายการ</div></div>
    <div class="actions"><button class="btn btn-primary" id="btnAddWelfare">+ ยื่นเบิกสวัสดิการ</button></div>
  </div>
  <div class="panel">
    <div class="table-wrap"><table class="reg" id="myWelfTable">
      <thead><tr><th class="rownum">#</th><th class="num">วันที่ยื่น</th><th>หมวดหมู่</th><th class="num">ยอดใบเสร็จ</th><th class="num">อนุมัติเบิก</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((w,i)=>`
        <tr class="row-clickable" data-welf-id="${w.id}">
          <td class="rownum">${i+1}</td><td class="num">${buddhistDate(w.submitDate)}</td>
          <td><span class="tag tag-navy">${esc(w.category)}</span></td>
          <td class="num">${money(w.receiptAmount)}</td><td class="num">${money(w.approvedAmount)}</td>
          <td>${approvalTag(w)}</td>
          <td style="white-space:nowrap;">${selfRecordActionsHtml('welfare', w)}</td>
        </tr>`).join('') : `<tr class="empty-row"><td colspan="7">ยังไม่มีรายการเบิกสวัสดิการ</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

function gradeFromScore(score){
  if(score>=90) return 'ดีเยี่ยม';
  if(score>=80) return 'ดีมาก';
  if(score>=70) return 'ดี';
  if(score>=60) return 'พอใช้';
  return 'ควรปรับปรุง';
}

function viewMyKpi(){
  const empId = currentEmployeeId();
  const rows = state.kpi.filter(k=>k.employeeId===empId).sort((a,b)=> (b.year||'').localeCompare(a.year||''));
  return `
  <div class="page-header"><div><h1>ผลประเมิน KPI</h1><div class="sub">ประวัติผลประเมินการปฏิบัติงานของฉัน</div></div></div>
  ${rows.length ? rows.map(k=>kpiCardHtml(k)).join('') : `<div class="panel"><div class="muted" style="text-align:center; padding:20px;">ยังไม่มีผลการประเมิน</div></div>`}
  `;
}

function kpiCardHtml(k){
  const grade = k.grade || gradeFromScore(safeNum(k.overallScore));
  return `
  <div class="panel">
    <h2>${esc(k.year)} — ${esc(k.period)}</h2>
    <div class="grid grid-2" style="margin-bottom:14px;">
      <div class="stat" style="--stat-accent:linear-gradient(90deg,#8B7FF0,#A79BFF);"><div class="label">คะแนนรวม</div><div class="value">${safeNum(k.overallScore).toFixed(1)}</div><div class="foot">จาก 100 คะแนน</div></div>
      <div class="stat" style="--stat-accent:linear-gradient(90deg,#4FD1B5,#7EE8D0);"><div class="label">ระดับผลงาน</div><div class="value" style="font-size:20px;">${esc(grade)}</div></div>
    </div>
    <table class="reg">
      <thead><tr><th>หัวข้อประเมิน</th><th class="num">คะแนน (เต็ม 100)</th></tr></thead>
      <tbody>
        <tr><td>คุณภาพงาน</td><td class="num">${safeNum(k.scoreQuality)}</td></tr>
        <tr><td>ปริมาณงาน</td><td class="num">${safeNum(k.scoreQuantity)}</td></tr>
        <tr><td>ความรับผิดชอบ</td><td class="num">${safeNum(k.scoreResponsibility)}</td></tr>
        <tr><td>การทำงานร่วมกับผู้อื่น</td><td class="num">${safeNum(k.scoreTeamwork)}</td></tr>
        <tr><td>ระเบียบวินัย</td><td class="num">${safeNum(k.scoreDiscipline)}</td></tr>
      </tbody>
    </table>
    <div class="doc-meta" style="margin-top:14px;">
      <div><span class="k">ผู้ประเมิน: </span>${esc(k.evaluator)||'-'}</div>
      <div><span class="k">วันที่ประเมิน: </span>${buddhistDate(k.evaluatedDate)}</div>
      <div class="field full"><span class="k">ความคิดเห็น: </span>${esc(k.comments)||'-'}</div>
    </div>
  </div>`;
}

function viewMyTraining(){
  const empId = currentEmployeeId();
  const rows = state.training.filter(t=>t.employeeId===empId).sort((a,b)=> new Date(b.startDate||0)-new Date(a.startDate||0));
  const totalHours = rows.reduce((s,t)=>s+safeNum(t.hours),0);
  return `
  <div class="page-header"><div><h1>ประวัติการอบรม</h1><div class="sub">รวม ${rows.length} หลักสูตร · ${totalHours} ชั่วโมง</div></div></div>
  <div class="panel">
    <div class="table-wrap"><table class="reg">
      <thead><tr><th class="rownum">#</th><th>หลักสูตร</th><th>หน่วยงานจัดอบรม</th><th>ประเภท</th><th class="num">วันที่</th><th class="num">ชั่วโมง</th><th>ใบประกาศ</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((t,i)=>`
        <tr>
          <td class="rownum">${i+1}</td><td>${esc(t.courseName)}</td><td>${esc(t.organizer)}</td><td>${esc(t.trainingType)}</td>
          <td class="num">${buddhistDate(t.startDate)}${t.endDate && t.endDate!==t.startDate ? ' - '+buddhistDate(t.endDate):''}</td>
          <td class="num">${safeNum(t.hours)}</td>
          <td>${t.certificateUrl? `<a href="${esc(t.certificateUrl)}" target="_blank" rel="noopener">ดูใบประกาศ</a>` : '-'}</td>
        </tr>`).join('') : `<tr class="empty-row"><td colspan="7">ยังไม่มีประวัติการอบรม</td></tr>`}
      </tbody>
    </table></div>
  </div>`;
}

