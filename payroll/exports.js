/* =====================================================================
   payroll/exports.js — ส่งออกรายงานเป็น PDF (พิมพ์/บันทึก, ฟอนต์ Sarabun) และ Excel
   ทุกรายงานสร้างจาก "spec" เดียวกัน แล้วแปลงเป็น PDF หรือ Excel
   ===================================================================== */

/* ---------- report specs ---------- */
function rpt_fundMonth(ym){
  const c = cfg();
  const rows = (PR.data.contributions||[]).filter(x=>x.period===ym).map(x=>({ x, s: staffById(x.staffId) || {} }))
    .sort((a,b)=>String(a.s.department).localeCompare(String(b.s.department),'th') || String(a.s.code).localeCompare(String(b.s.code)));
  const balAt = id => { let b = n((staffById(id)||{}).fundOpening); (PR.data.contributions||[]).forEach(cn=>{ if(cn.staffId===id && cn.period<=ym) b += n(cn.amount); }); return b; };
  return {
    title: 'รายงานการหักเงินสะสมประจำเดือน', subtitle: ymLabel(ym), file: 'เงินสะสม_' + ym,
    meta: [['อัตราหัก', c.fundRate + '% ของเงินเดือน'], ['จำนวนพนักงาน', rows.length + ' คน']],
    columns: [ {h:'ลำดับ', w:6, center:true}, {h:'รหัส', w:8}, {h:'ชื่อ-นามสกุล', w:27}, {h:'ตำแหน่ง', w:22}, {h:'กลุ่มงาน', w:11},
               {h:'เงินเดือน', w:13, num:true}, {h:'อัตรา (%)', w:8, num:true, dec:0}, {h:'หักเงินสะสม', w:13, num:true}, {h:'ยอดสะสม ณ สิ้นเดือน', w:15, num:true} ],
    rows: rows.map((r,i)=>[i+1, r.s.code||'', r.s.name||'', r.s.position||'', r.s.department||'', n(r.x.salary), n(r.x.rate), n(r.x.amount), balAt(r.x.staffId)]),
    foot: ['', '', 'รวม', '', '', rows.reduce((a,r)=>a+n(r.x.salary),0), '', rows.reduce((a,r)=>a+n(r.x.amount),0), ''],
    signatures: ['ผู้จัดทำ', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ']
  };
}
function rpt_fundYear(fy){
  const M = fundYearMatrix(fy);
  return {
    title: 'สรุปการหักเงินสะสมรายปีงบประมาณ', subtitle: 'ปีงบประมาณ ' + fy + ' (ต.ค. ' + (fy-1) + ' – ก.ย. ' + fy + ')', file: 'สรุปเงินสะสม_ปีงบ' + fy, landscape: true, compact: true,
    columns: [ {h:'ลำดับ', w:5, center:true}, {h:'ชื่อ-นามสกุล', w:26} ].concat(M.ms.map(m=>({ h: ymLabel(m,true), w:9, num:true, dec:0 }))).concat([{h:'รวม', w:12, num:true}]),
    rows: M.staff.map((s,i)=>[i+1, s.name].concat(M.ms.map(m=>M.by[s.id][m]!==undefined ? M.by[s.id][m] : '')).concat([M.ms.reduce((a,m)=>a+(M.by[s.id][m]||0),0)])),
    foot: ['', 'รวม'].concat(M.colTotals).concat([M.grand]),
    signatures: ['ผู้จัดทำ', 'ผู้ตรวจสอบ']
  };
}
function rpt_balances(){
  const bal = PR.data.balances || {};
  const list = (PR.data.staff||[]).slice().sort((a,b)=>String(a.department).localeCompare(String(b.department),'th') || String(a.code).localeCompare(String(b.code)));
  const contributed = id => (PR.data.contributions||[]).filter(c=>c.staffId===id).reduce((a,c)=>a+n(c.amount),0);
  return {
    title: 'ยอดเงินสะสมคงเหลือรายบุคคล', subtitle: 'ณ วันที่ ' + thDateLong(pr_ymd(new Date())), file: 'ยอดเงินสะสม_' + pr_ymd(new Date()),
    columns: [ {h:'ลำดับ', w:6, center:true}, {h:'รหัส', w:9}, {h:'ชื่อ-นามสกุล', w:30}, {h:'กลุ่มงาน', w:12}, {h:'สถานะ', w:10},
               {h:'ยอดยกมา', w:13, num:true}, {h:'หักในระบบ', w:13, num:true}, {h:'ยอดเงินสะสมรวม', w:15, num:true} ],
    rows: list.map((s,i)=>[i+1, s.code||'', s.name, s.department||'', (s.status||'active')==='active'?'ทำงานอยู่':'พ้นสภาพ', n(s.fundOpening), contributed(s.id), n(bal[s.id])]),
    foot: ['', '', 'รวม', '', '', list.reduce((a,s)=>a+n(s.fundOpening),0), list.reduce((a,s)=>a+contributed(s.id),0), list.reduce((a,s)=>a+n(bal[s.id]),0)],
    signatures: ['ผู้จัดทำ', 'ผู้ตรวจสอบ']
  };
}
function rpt_ledger(staffId){
  const L = pr_ledger(snapDb(), staffId), s = L.staff || {};
  const hist = (PR.data.salaryHistory||[]).filter(h=>h.staffId===staffId).sort((a,b)=>a.effectiveDate<b.effectiveDate?-1:1);
  return {
    title: 'ทะเบียนเงินสะสมรายบุคคล', subtitle: s.name || '', file: 'ทะเบียนเงินสะสม_' + String(s.name||'').replace(/\s+/g,'_'),
    meta: [['รหัสพนักงาน', s.code||'-'], ['ตำแหน่ง', s.position||'-'], ['กลุ่มงาน', s.department||'-'], ['วันเริ่มงาน', thDateLong(s.hireDate)],
           ['เงินเดือนปัจจุบัน', baht(s.salary) + ' บาท'], ['ยอดเงินสะสมรวม', baht(L.balance) + ' บาท']],
    columns: [ {h:'ลำดับ', w:6, center:true}, {h:'เดือน', w:18}, {h:'เงินเดือน', w:13, num:true}, {h:'อัตรา (%)', w:8, num:true, dec:0}, {h:'หักเข้ากองทุน', w:14, num:true}, {h:'ยอดสะสม', w:15, num:true} ],
    rows: L.rows.map((r,i)=>[i+1, r.opening ? 'ยอดยกมา' : ymLabel(r.period), r.opening?'':n(r.salary), r.opening?'':n(r.rate), n(r.amount), n(r.balance)]),
    foot: ['', 'รวม', '', '', L.rows.reduce((a,r)=>a+n(r.amount),0), L.balance],
    extra: hist.length ? {
      title: 'ประวัติการเปลี่ยนแปลงเงินเดือน',
      columns: [ {h:'มีผลวันที่', w:16}, {h:'เงินเดือนเดิม', w:14, num:true}, {h:'เงินเดือนใหม่', w:14, num:true}, {h:'%', w:7, num:true}, {h:'ที่มา', w:34} ],
      rows: hist.map(h=>[thDate(h.effectiveDate), n(h.oldSalary), n(h.newSalary), n(h.percent), (h.roundKey ? pr_roundInfo(h.roundKey).label + ' ' : '') + (h.note||'')])
    } : null,
    signatures: ['ผู้จัดทำ', 'ผู้ตรวจสอบ']
  };
}
function rpt_round(key){
  const round = (PR.data.rounds||[]).find(r=>r.key===key);
  if(!round) return null;
  const info = pr_roundInfo(key), S = pr_roundSummary(snapDb(), round.id);
  const items = (PR.data.roundItems||[]).filter(i=>i.roundId===round.id).sort((a,b)=>(pr_bool(b.eligible)-pr_bool(a.eligible)) || String(a.name).localeCompare(String(b.name),'th'));
  return {
    title: 'ผลการเลื่อนเงินเดือน' + info.label, subtitle: 'ช่วงประเมิน ' + thDateLong(info.evalStart) + ' – ' + thDateLong(info.evalEnd), file: 'เลื่อนเงินเดือน_' + key, landscape: true,
    meta: [['มีผลวันที่', thDateLong(info.effectiveDate)], ['สถานะ', round.status==='applied' ? 'ปรับเงินเดือนแล้ว' : 'ร่าง (ยังไม่ปรับ)'],
           ['ผู้มีสิทธิ์', S.eligible + ' จาก ' + S.count + ' คน'], ['เงินเดือนเพิ่มรวม', baht(S.totalRaise) + ' บาท/เดือน (' + S.raisePercentOfBase + '%)']],
    columns: [ {h:'ลำดับ', w:6, center:true}, {h:'ชื่อ-นามสกุล', w:30}, {h:'ตำแหน่ง', w:24}, {h:'คะแนน KPI', w:10, num:true, dec:1}, {h:'ระดับ', w:12},
               {h:'% เลื่อน', w:8, num:true, dec:1}, {h:'เงินเดือนเดิม', w:13, num:true}, {h:'เพิ่มขึ้น', w:11, num:true}, {h:'เงินเดือนใหม่', w:13, num:true}, {h:'หมายเหตุ', w:26} ],
    rows: items.map((it,i)=>{ const s = staffById(it.staffId)||{}; return [i+1, it.name, s.position||'', it.score===''?'':n(it.score), it.tier||'', pr_blank(it.percent)?'':n(it.percent), n(it.oldSalary), n(it.raise), n(it.newSalary), it.reason||'']; }),
    foot: ['', 'รวม', '', '', '', '', items.reduce((a,i)=>a+n(i.oldSalary),0), S.totalRaise, items.reduce((a,i)=>a+n(i.newSalary),0), ''],
    signatures: ['ผู้เสนอ', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ']
  };
}
function rpt_salaries(){
  const c = cfg();
  const list = activeStaff().sort((a,b)=>String(a.department).localeCompare(String(b.department),'th') || String(a.code).localeCompare(String(b.code)));
  return {
    title: 'ทะเบียนเงินเดือนพนักงาน', subtitle: 'ณ วันที่ ' + thDateLong(pr_ymd(new Date())), file: 'ทะเบียนเงินเดือน_' + pr_ymd(new Date()),
    columns: [ {h:'ลำดับ', w:6, center:true}, {h:'รหัส', w:9}, {h:'ชื่อ-นามสกุล', w:30}, {h:'ตำแหน่ง', w:26}, {h:'กลุ่มงาน', w:12}, {h:'วันเริ่มงาน', w:14},
               {h:'เงินเดือน', w:13, num:true}, {h:'หักเงินสะสม ' + c.fundRate + '%', w:15, num:true} ],
    rows: list.map((s,i)=>[i+1, s.code||'', s.name, s.position||'', s.department||'', thDate(s.hireDate), n(s.salary), n(s.salary) ? pr_fundAmount(s.salary, c) : 0]),
    foot: ['', '', 'รวม ' + list.length + ' คน', '', '', '', list.reduce((a,s)=>a+n(s.salary),0), list.reduce((a,s)=>a+(n(s.salary)?pr_fundAmount(s.salary,c):0),0)],
    signatures: ['ผู้จัดทำ', 'ผู้ตรวจสอบ']
  };
}

/* ---------- dispatcher ---------- */
function runExport(kind, fmt, opts){
  opts = opts || {};
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  let spec = null;
  if(kind === 'all'){ return exportAllExcel(); }
  if(kind === 'fundMonth') spec = rpt_fundMonth(val('ex_month') || PR.fundMonth);
  else if(kind === 'fundYear') spec = rpt_fundYear(Number(val('ex_fy') || val('fundYearSel')) || PR.fundYear);
  else if(kind === 'balances') spec = rpt_balances();
  else if(kind === 'ledger') spec = rpt_ledger(opts.staffId || val('ex_staff'));
  else if(kind === 'round') spec = rpt_round(val('ex_round') || PR.roundKey);
  else if(kind === 'salaries') spec = rpt_salaries();
  if(!spec){ toast('ยังไม่มีข้อมูลสำหรับรายงานนี้'); return; }
  if(!spec.rows.length){ toast('ไม่มีรายการในรายงานนี้'); return; }
  if(fmt === 'xlsx') exportExcel([spec], spec.file); else exportPdf(spec);
}

/* ---------- Excel ---------- */
function specToSheet(spec){
  const aoa = [], merges = [];
  const width = spec.columns.length;
  aoa.push([spec.title]); merges.push({ s:{r:0,c:0}, e:{r:0,c:width-1} });
  aoa.push([(cfg().orgName||'') + (spec.subtitle ? ' — ' + spec.subtitle : '')]); merges.push({ s:{r:1,c:0}, e:{r:1,c:width-1} });
  (spec.meta||[]).forEach(m=>aoa.push([m[0], m[1]]));
  aoa.push([]);
  const headRow = aoa.length;
  aoa.push(spec.columns.map(c=>c.h));
  spec.rows.forEach(r=>aoa.push(r));
  if(spec.foot) aoa.push(spec.foot);
  if(spec.extra){
    aoa.push([]); aoa.push([spec.extra.title]); aoa.push(spec.extra.columns.map(c=>c.h)); spec.extra.rows.forEach(r=>aoa.push(r));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = spec.columns.map(c=>({ wch: c.w || 12 }));
  // number formats for numeric columns (main table + footer)
  const lastMain = headRow + spec.rows.length + (spec.foot ? 1 : 0);
  for(let r = headRow+1; r <= lastMain; r++){
    spec.columns.forEach((c, ci)=>{
      if(!c.num) return;
      const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
      if(cell && typeof cell.v === 'number'){ cell.t = 'n'; cell.z = c.dec === 0 ? '#,##0' : c.dec === 1 ? '#,##0.0' : '#,##0.00'; }
    });
  }
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s:{r:headRow,c:0}, e:{r:headRow+spec.rows.length, c:width-1} }) };
  return ws;
}
function safeSheetName(s){ return String(s).replace(/[\\\/\?\*\[\]:]/g,' ').slice(0,31); }
function exportExcel(specs, file){
  if(typeof XLSX === 'undefined'){ toast('โหลดไลบรารี Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); return; }
  const wb = XLSX.utils.book_new();
  specs.forEach(s=>XLSX.utils.book_append_sheet(wb, specToSheet(s), safeSheetName(s.sheet || s.title)));
  XLSX.writeFile(wb, (file || 'รายงาน') + '.xlsx');
  toast('ดาวน์โหลด Excel แล้ว');
}
function exportAllExcel(){
  const specs = [];
  const sal = rpt_salaries(); sal.sheet = 'เงินเดือน'; specs.push(sal);
  const bal = rpt_balances(); bal.sheet = 'ยอดเงินสะสม'; specs.push(bal);
  const fm = rpt_fundMonth(PR.fundMonth); fm.sheet = 'เงินสะสม ' + ymLabel(PR.fundMonth, true); if(fm.rows.length) specs.push(fm);
  const fy = rpt_fundYear(PR.fundYear); fy.sheet = 'สรุปปีงบ ' + PR.fundYear; if(fy.rows.length) specs.push(fy);
  (PR.data.rounds||[]).slice().sort((a,b)=>a.key<b.key?1:-1).slice(0,4).forEach(r=>{ const s = rpt_round(r.key); if(s){ s.sheet = 'เลื่อน ' + pr_roundInfo(r.key).label.replace('รอบ ',''); specs.push(s); } });
  exportExcel(specs, 'ระบบเงินสะสมและเลื่อนเงินเดือน_' + pr_ymd(new Date()));
}

/* ---------- PDF (print window, Sarabun) ---------- */
function fmtCell(v, col){
  if(v === '' || v === null || v === undefined) return '';
  if(col.num && typeof v === 'number') return v.toLocaleString('th-TH', { minimumFractionDigits: col.dec ?? 2, maximumFractionDigits: col.dec ?? 2 });
  return esc(v);
}
function tableHtml(columns, rows, foot){
  const tw = columns.reduce((a,c)=>a+(c.w||10),0);
  return `<table class="t"><colgroup>${columns.map(c=>`<col style="width:${((c.w||10)/tw*100).toFixed(2)}%">`).join('')}</colgroup>
    <thead><tr>${columns.map(c=>`<th class="${c.num?'num':''}${c.center?' c':''}">${esc(c.h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${r.map((v,i)=>`<td class="${columns[i].num?'num':''}${columns[i].center?' c':''}">${fmtCell(v, columns[i])}</td>`).join('')}</tr>`).join('')}</tbody>
    ${foot ? `<tfoot><tr>${foot.map((v,i)=>`<td class="${columns[i].num?'num':''}">${fmtCell(v, columns[i])}</td>`).join('')}</tr></tfoot>` : ''}
  </table>`;
}
function exportPdf(spec){
  const w = window.open('', '_blank');
  if(!w){ toast('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต popup แล้วลองใหม่'); return; }
  const c = cfg();
  const logo = c.logoUrl ? `<img src="${esc(c.logoUrl)}" alt="">` : '';
  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>${esc(spec.title)} ${esc(spec.subtitle||'')}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page{ size:A4 ${spec.landscape?'landscape':'portrait'}; margin:12mm 12mm 14mm; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body{ margin:0; font-family:'Sarabun','TH Sarabun New',sans-serif; color:#14213D; background:#DCE2EE; font-size:${spec.compact?'11.5px':'13px'}; }
  .bar{ position:sticky; top:0; background:#0F1A33; color:#fff; padding:10px 18px; display:flex; justify-content:space-between; align-items:center; font-size:14px; z-index:5; }
  .bar button{ font:inherit; font-weight:600; border:none; border-radius:8px; padding:8px 18px; color:#fff; cursor:pointer; background:linear-gradient(135deg,#1E3A8A,#2563EB 60%,#38BDF8 130%); }
  .sheet{ background:#fff; width:${spec.landscape?'297mm':'210mm'}; margin:18px auto 30px; padding:12mm; box-shadow:0 6px 30px rgba(0,0,0,.15); }
  .head{ display:flex; align-items:center; gap:14px; padding-bottom:10px; border-bottom:2px solid #1D4ED8; margin-bottom:12px; }
  .head img{ height:52px; width:auto; }
  .head .tt{ flex:1; }
  .head h1{ font-size:19px; margin:0; line-height:1.3; }
  .head .org{ font-size:13px; color:#4E5B73; }
  .head .sub{ font-size:14.5px; font-weight:600; color:#1D4ED8; text-align:right; }
  .meta{ display:grid; grid-template-columns:1fr 1fr; gap:2px 28px; margin:0 0 12px; padding:8px 12px; border:1px solid #DCE3F0; border-radius:6px; font-size:13px; }
  .meta span{ color:#4E5B73; }
  table.t{ width:100%; border-collapse:collapse; table-layout:fixed; }
  .t td{ overflow-wrap:anywhere; }
  .t th{ background:#EEF3FC; border:1px solid #C5D0E3; padding:5px 6px; font-weight:600; text-align:left; font-size:.93em; }
  .t td{ border:1px solid #DCE3F0; padding:4px 6px; vertical-align:top; }
  .t tr:nth-child(even) td{ background:#FAFBFE; }
  .t .num{ text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .t th, .t th.num{ white-space:normal; line-height:1.3; vertical-align:bottom; }
  .t .c{ text-align:center; }
  .t tfoot td{ font-weight:700; background:#EEF3FC; border-top:2px solid #1D4ED8; }
  tr{ page-break-inside:avoid; } thead{ display:table-header-group; }
  h2{ font-size:15px; margin:18px 0 6px; padding-left:8px; border-left:3px solid #1D4ED8; }
  .sign{ display:grid; grid-template-columns:repeat(${(spec.signatures||[]).length||1},1fr); gap:20px; margin-top:34px; text-align:center; page-break-inside:avoid; font-size:13px; }
  .sign .ln{ border-bottom:1px dotted #555; height:32px; margin:0 12%; }
  .foot{ margin-top:16px; font-size:11px; color:#8A93A8; text-align:right; }
  @media print{ body{ background:#fff; } .bar{ display:none; } .sheet{ margin:0; box-shadow:none; width:auto; padding:0; } }
</style></head><body>
<div class="bar"><span>ตรวจดูตัวอย่าง แล้วกดพิมพ์ — เลือกปลายทาง <b>Save as PDF</b> เพื่อบันทึกเป็นไฟล์</span><button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div>
<div class="sheet">
  <div class="head">${logo}<div class="tt"><h1>${esc(spec.title)}</h1><div class="org">${esc(c.orgName||'')}</div></div><div class="sub">${esc(spec.subtitle||'')}</div></div>
  ${spec.meta && spec.meta.length ? `<div class="meta">${spec.meta.map(m=>`<div><span>${esc(m[0])}:</span> ${esc(m[1])}</div>`).join('')}</div>` : ''}
  ${tableHtml(spec.columns, spec.rows, spec.foot)}
  ${spec.extra ? `<h2>${esc(spec.extra.title)}</h2>${tableHtml(spec.extra.columns, spec.extra.rows)}` : ''}
  ${spec.signatures ? `<div class="sign">${spec.signatures.map(s=>`<div><div class="ln"></div><div>(......................................................)</div><div>${esc(s)}</div><div>วันที่ ........./........./.........</div></div>`).join('')}</div>` : ''}
  <div class="foot">พิมพ์เมื่อ ${thDateLong(pr_ymd(new Date()))} · ระบบเงินสะสมและเลื่อนเงินเดือน</div>
</div></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}
