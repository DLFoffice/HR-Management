/* ===== nav-dashboard.js ===== */
const NAV_ADMIN = [
  {id:'dashboard', label:'ภาพรวม'},
  {id:'employees', label:'ข้อมูลพนักงาน'},
  {id:'orgchart', label:'โครงสร้างองค์กร'},
  {id:'leaves', label:'บันทึกวันลา'},
  {id:'loans', label:'บันทึกเงินกู้'},
  {id:'welfare', label:'สวัสดิการ/ประกันสังคม'},
  {id:'kpi', label:'ประเมินผล KPI'},
  {id:'training', label:'ฝึกอบรม/พัฒนาบุคลากร'},
  {id:'reports', label:'รายงาน / PDF'},
  {id:'settings', label:'ตั้งค่าเชื่อมต่อ'}
];
const NAV_SELF = [
  {id:'myhome', label:'ข้อมูลของฉัน'},
  {id:'myleaves', label:'วันลาของฉัน'},
  {id:'myloans', label:'เงินกู้ของฉัน'},
  {id:'mywelfare', label:'สวัสดิการของฉัน'},
  {id:'mykpi', label:'ผลประเมิน KPI'},
  {id:'mytraining', label:'ประวัติการอบรม'}
];
function currentNav(){ return isAdminUser() ? NAV_ADMIN : NAV_SELF; }

function renderNav(){
  const nav = document.getElementById('navlist');
  const list = currentNav();
  nav.innerHTML = list.map((n,i)=>`
    <button data-view="${n.id}" class="${state.currentView===n.id?'active':''}">
      <span>${n.label}</span>
      <span class="idx">${String(i+1).padStart(2,'0')}</span>
    </button>
  `).join('');
  nav.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{ state.currentView = b.dataset.view; renderNav(); renderView(); });
  });
  renderUserBadge();
}

function renderView(){
  const root = document.getElementById('viewRoot');
  const v = state.currentView;
  if(v==='dashboard') root.innerHTML = viewDashboard();
  else if(v==='employees') root.innerHTML = viewEmployees();
  else if(v==='orgchart') root.innerHTML = viewOrgChart();
  else if(v==='leaves') root.innerHTML = viewLeaves();
  else if(v==='loans') root.innerHTML = viewLoans();
  else if(v==='welfare') root.innerHTML = viewWelfare();
  else if(v==='kpi') root.innerHTML = viewKpi();
  else if(v==='training') root.innerHTML = viewTraining();
  else if(v==='reports') root.innerHTML = viewReports();
  else if(v==='settings') root.innerHTML = viewSettings();
  else if(v==='myhome') root.innerHTML = viewMyHome();
  else if(v==='myleaves') root.innerHTML = viewMyLeaves();
  else if(v==='myloans') root.innerHTML = viewMyLoans();
  else if(v==='mywelfare') root.innerHTML = viewMyWelfare();
  else if(v==='mykpi') root.innerHTML = viewMyKpi();
  else if(v==='mytraining') root.innerHTML = viewMyTraining();
  bindViewEvents(v);
  if(v==='dashboard'){
    setTimeout(renderDashboardCharts, 0);
    document.querySelectorAll('.stat .value[data-to]').forEach(el=>{
      animateValue(el, Number(el.dataset.to||0), Number(el.dataset.dec||0));
    });
  }
}

/* ================= DASHBOARD ================= */
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function leavesActiveOn(dateD){
  return state.leaves.filter(l=>{
    if(!isApproved(l)) return false;
    const s = parseYMD(l.startDate); if(!s) return false;
    const e = parseYMD(l.endDate) || s;
    return dateD >= s && dateD <= e;
  });
}

function monthlyLeaveTrend(fy){
  const buckets = [];
  let cursor = new Date(fy.start.getFullYear(), fy.start.getMonth(), 1);
  for(let i=0;i<12;i++){
    buckets.push({ y:cursor.getFullYear(), m:cursor.getMonth(), total:0 });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
  }
  state.leaves.forEach(l=>{
    if(!isApproved(l) || !l.startDate) return;
    const d = new Date(l.startDate);
    if(isNaN(d)) return;
    const b = buckets.find(x=>x.y===d.getFullYear() && x.m===d.getMonth());
    if(b) b.total += Number(l.days||0);
  });
  return buckets;
}

/* Anyone whose remaining leave balance (right + carry - used, for this fiscal
   year) has run low or gone negative — lets HR follow up before it becomes
   a payroll/policy problem instead of after. */
function leaveBalanceWarnings(){
  const LOW_THRESHOLD = 2;
  const out = [];
  state.employees.forEach(e=>{
    const sum = computeEmployeeSummary(e.id);
    if(!sum) return;
    sum.leaveSummary.forEach(ls=>{
      if(ls.total>0 && ls.remaining<=LOW_THRESHOLD){
        out.push({ emp:e, label:ls.label, remaining:ls.remaining, total:ls.total });
      }
    });
  });
  return out.sort((a,b)=> a.remaining-b.remaining);
}

const PROBATION_DAYS = 120;
function employeesOnProbation(){
  const now = new Date();
  return state.employees.filter(e=>{
    if(!e.hireDate) return false;
    const d = new Date(e.hireDate);
    if(isNaN(d)) return false;
    const days = (now-d)/(1000*60*60*24);
    return days>=0 && days<=PROBATION_DAYS;
  }).sort((a,b)=> new Date(b.hireDate)-new Date(a.hireDate));
}

function viewDashboard(){
  const fy = fiscalYearRange();
  const totalEmp = state.employees.length;
  const byDept = {};
  state.employees.forEach(e=>{ byDept[e.department||'ไม่ระบุ'] = (byDept[e.department||'ไม่ระบุ']||0)+1; });

  const leavesFY = state.leaves.filter(l=>l.startDate && inRange(l.startDate, fy.start, fy.end) && isApproved(l));
  const leaveDaysTotal = leavesFY.reduce((s,l)=>s+Number(l.days||0),0);
  const leaveByType = {'ป':0,'พ':0,'ก':0};
  leavesFY.forEach(l=>{ if(leaveByType[l.leaveType]!==undefined) leaveByType[l.leaveType]+=Number(l.days||0); });

  const activeLoans = state.loans.filter(l=>l.status!=='closed' && isApproved(l));
  const loanOutstanding = activeLoans.reduce((s,l)=>{
    const paid = Number(l.paidInstallments||0)*Number(l.installment||0);
    return s + Math.max(Number(l.approvedAmount||0)-paid,0);
  },0);
  const loanByType = {};
  LOAN_TYPES.forEach(t=>{ loanByType[t] = activeLoans.filter(l=>l.loanType===t).length; });
  const loanBreakdownText = LOAN_TYPES.map(t=>`${t.replace('เงินกู้','')} ${loanByType[t]}`).join(' · ');

  const welfareFY = state.welfare.filter(w=>w.submitDate && inRange(w.submitDate, fy.start, fy.end) && isApproved(w));
  const welfareUsed = welfareFY.reduce((s,w)=>s+Number(w.approvedAmount||0),0);
  const welfareByCat = {};
  WELFARE_CATS.forEach(c=>{ welfareByCat[c.label] = 0; });
  welfareFY.forEach(w=>{ if(welfareByCat[w.category]!==undefined) welfareByCat[w.category]+=Number(w.approvedAmount||0); });

  const pendingLeaves = state.leaves.filter(l=>(l.approvalStatus||'approved')==='pending');
  const pendingLoans = state.loans.filter(l=>(l.approvalStatus||'approved')==='pending');
  const pendingWelfare = state.welfare.filter(w=>(w.approvalStatus||'approved')==='pending');
  const pendingTotal = pendingLeaves.length + pendingLoans.length + pendingWelfare.length;

  const now = new Date();
  const in12mo = new Date(); in12mo.setMonth(in12mo.getMonth()+12);
  const upcomingRetire = state.employees.filter(e=>e.retireDate && new Date(e.retireDate)>=now && new Date(e.retireDate)<=in12mo)
    .sort((a,b)=> new Date(a.retireDate)-new Date(b.retireDate));

  const thisMonth = now.getMonth();
  const birthdays = state.employees.filter(e=>e.birthDate && new Date(e.birthDate).getMonth()===thisMonth)
    .sort((a,b)=> new Date(a.birthDate).getDate()-new Date(b.birthDate).getDate());

  const recentLeaves = [...state.leaves].sort((a,b)=> new Date(b.submitDate||b.startDate)-new Date(a.submitDate||a.startDate)).slice(0,6);

  const kpiYear = String(now.getFullYear()+543);
  const kpiThisYear = state.kpi.filter(k=>String(k.year)===kpiYear);
  const kpiAvg = kpiThisYear.length ? kpiThisYear.reduce((s,k)=>s+safeNum(k.overallScore),0)/kpiThisYear.length : 0;
  const kpiEvaluatedCount = new Set(kpiThisYear.map(k=>k.employeeId)).size;

  const trainingFY = state.training.filter(t=>t.startDate && inRange(t.startDate, fy.start, fy.end));
  const trainingHours = trainingFY.reduce((s,t)=>s+safeNum(t.hours),0);
  const trainingEmpCount = new Set(trainingFY.map(t=>t.employeeId)).size;

  const todayD = parseYMD(todayStr());
  const onLeaveToday = leavesActiveOn(todayD);

  const leaveTrend = monthlyLeaveTrend(fy);
  const balanceWarnings = leaveBalanceWarnings();
  const probationEmps = employeesOnProbation();

  return `
  <div class="page-header">
    <div>
      <h1>ภาพรวมระบบ</h1>
      <div class="sub">ปีงบประมาณ ${fy.start.getFullYear()+543}-${fy.end.getFullYear()+543} (${buddhistDate(fy.start)} – ${buddhistDate(fy.end)})</div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" id="btnSyncTop">ซิงค์ข้อมูลล่าสุด</button>
    </div>
  </div>

  <div class="grid grid-4" style="margin-bottom:20px;">
    <div class="stat"><div class="label">พนักงานทั้งหมด</div><div class="value" id="statEmp" data-to="${totalEmp}" data-dec="0">0</div><div class="foot">${Object.entries(byDept).map(([k,v])=>k+' '+v).join(' · ')}</div></div>
    <div class="stat"><div class="label">วันลาสะสม (ปีงบประมาณนี้)</div><div class="value" id="statLeave" data-to="${leaveDaysTotal}" data-dec="1">0</div><div class="foot">วัน จากทั้งหมด ${leavesFY.length} รายการ</div></div>
    <div class="stat"><div class="label">เงินกู้คงค้าง</div><div class="value" id="statLoan" data-to="${loanOutstanding}" data-dec="0">0</div><div class="foot">${activeLoans.length} สัญญาที่ยังผ่อนอยู่ ${activeLoans.length?'('+loanBreakdownText+')':''}</div></div>
    <div class="stat"><div class="label">สวัสดิการเบิกใช้ (ปีงบนี้)</div><div class="value" id="statWelfare" data-to="${welfareUsed}" data-dec="0">0</div><div class="foot">${welfareFY.length} รายการเบิก</div></div>
  </div>

  <div class="grid grid-3" style="margin-bottom:20px;">
    <div class="stat"><div class="label">พนักงานลาวันนี้</div><div class="value" id="statOnLeave" data-to="${onLeaveToday.length}" data-dec="0">0</div><div class="foot">${onLeaveToday.length? 'ดูรายชื่อด้านล่าง' : 'ไม่มีใครลาวันนี้'}</div></div>
    <div class="stat"><div class="label">คะแนน KPI เฉลี่ย (ปี ${kpiYear})</div><div class="value" id="statKpi" data-to="${kpiAvg}" data-dec="1">0</div><div class="foot">ประเมินแล้ว ${kpiEvaluatedCount} จาก ${totalEmp} คน</div></div>
    <div class="stat"><div class="label">ชั่วโมงอบรมสะสม (ปีงบนี้)</div><div class="value" id="statTraining" data-to="${trainingHours}" data-dec="1">0</div><div class="foot">${trainingFY.length} รายการ · ${trainingEmpCount} คน</div></div>
  </div>

  ${pendingTotal>0 ? `
  <div class="panel" style="border-left:4px solid var(--amber); margin-bottom:20px;">
    <h2>รายการรออนุมัติ (${pendingTotal})</h2>
    <div class="table-wrap"><table class="reg">
      <thead><tr><th>ประเภท</th><th>พนักงาน</th><th>รายละเอียด</th><th class="num">วันที่ยื่น</th><th>จัดการ</th></tr></thead>
      <tbody>
        ${pendingLeaves.map(l=>`<tr class="row-clickable" data-pending-leave="${l.id}"><td><span class="tag tag-navy">วันลา</span></td><td>${esc(l.employeeName)}</td><td>${LEAVE_TYPES[l.leaveType]||''} ${l.days} วัน</td><td class="num">${buddhistDate(l.submitDate)}</td><td style="white-space:nowrap;">${approvalActionsHtml('leaves', l)}</td></tr>`).join('')}
        ${pendingLoans.map(l=>`<tr class="row-clickable" data-pending-loan="${l.id}"><td><span class="tag tag-navy">เงินกู้</span></td><td>${esc(l.employeeName)}</td><td>${esc(l.loanType)} ${money(l.approvedAmount)} บาท</td><td class="num">${buddhistDate(l.submitDate)}</td><td style="white-space:nowrap;">${approvalActionsHtml('loans', l)}</td></tr>`).join('')}
        ${pendingWelfare.map(w=>`<tr class="row-clickable" data-pending-welf="${w.id}"><td><span class="tag tag-navy">สวัสดิการ</span></td><td>${esc(w.employeeName)}</td><td>${esc(w.category)} ${money(w.approvedAmount)} บาท</td><td class="num">${buddhistDate(w.submitDate)}</td><td style="white-space:nowrap;">${approvalActionsHtml('welfare', w)}</td></tr>`).join('')}
      </tbody>
    </table></div>
    ${!isAdminUser() ? '<div class="muted" style="font-size:12.5px; margin-top:10px;">เข้าสู่โหมดแอดมินเพื่ออนุมัติ/ไม่อนุมัติรายการเหล่านี้</div>' : ''}
  </div>` : ''}

  <div class="grid grid-2" style="align-items:start;">
    <div class="panel">
      <h2>วันลาแยกตามประเภท (ปีงบประมาณนี้)</h2>
      <div style="position:relative; height:220px;">
        <canvas id="chartLeaveType" role="img" aria-label="กราฟแท่งแสดงจำนวนวันลาแยกตามประเภท">ลาป่วย ${leaveByType['ป']} วัน, ลาพักผ่อน ${leaveByType['พ']} วัน, ลากิจ ${leaveByType['ก']} วัน</canvas>
      </div>
    </div>
    <div class="panel">
      <h2>พนักงานแยกตามกลุ่มงาน</h2>
      <div style="position:relative; height:220px;">
        <canvas id="chartDept" role="img" aria-label="กราฟแท่งแสดงจำนวนพนักงานแยกตามกลุ่มงาน">${Object.entries(byDept).map(([k,v])=>k+' '+v+' คน').join(', ')}</canvas>
      </div>
    </div>
  </div>

  <div class="grid grid-2" style="align-items:start;">
    <div class="panel">
      <h2>แนวโน้มวันลารายเดือน (ปีงบประมาณนี้)</h2>
      <div style="position:relative; height:220px;">
        <canvas id="chartLeaveTrend" role="img" aria-label="กราฟเส้นแสดงแนวโน้มวันลารายเดือน">${leaveTrend.map(b=>THAI_MONTHS_SHORT[b.m]+' '+b.total+' วัน').join(', ')}</canvas>
      </div>
    </div>
    <div class="panel">
      <h2>สวัสดิการแยกตามหมวด (ปีงบนี้)</h2>
      <div style="position:relative; height:220px;">
        <canvas id="chartWelfareCat" role="img" aria-label="กราฟแท่งแสดงยอดเบิกสวัสดิการแยกตามหมวด">${Object.entries(welfareByCat).map(([k,v])=>k+' '+money(v)+' บาท').join(', ')}</canvas>
      </div>
    </div>
  </div>

  <div class="grid grid-3" style="align-items:start;">
    <div class="panel">
      <h2>ใกล้เกษียณอายุ (12 เดือนข้างหน้า)</h2>
      ${upcomingRetire.length? upcomingRetire.map(e=>`
        <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
          <span>${esc(e.name)}</span><span class="muted">${buddhistDate(e.retireDate)}</span>
        </div>`).join('') : '<div class="muted" style="font-size:13.5px;">ไม่มีพนักงานใกล้เกษียณ</div>'}
    </div>
    <div class="panel">
      <h2>วันเกิดเดือนนี้</h2>
      ${birthdays.length? birthdays.map(e=>`
        <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
          <span>${esc(e.name)}</span><span class="muted">${new Date(e.birthDate).getDate()} ${THAI_MONTHS_SHORT[new Date(e.birthDate).getMonth()]}</span>
        </div>`).join('') : '<div class="muted" style="font-size:13.5px;">ไม่มีพนักงานเกิดเดือนนี้</div>'}
    </div>
    <div class="panel">
      <h2>รายการลาล่าสุด</h2>
      ${recentLeaves.length? recentLeaves.map(l=>`
        <div class="row-clickable" data-recent-leave="${l.id}" style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
          <span>${esc(l.employeeName)}</span>${leaveTypeTag(l.leaveType)}
        </div>`).join('') : '<div class="muted" style="font-size:13.5px;">ยังไม่มีรายการลา</div>'}
    </div>
  </div>

  <div class="grid grid-3" style="align-items:start;">
    <div class="panel">
      <h2>พนักงานลาวันนี้ (${onLeaveToday.length})</h2>
      ${onLeaveToday.length? onLeaveToday.map(l=>`
        <div class="row-clickable" data-recent-leave="${l.id}" style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
          <span style="display:flex; align-items:center; gap:8px;">${avatarHtml(employeeById(l.employeeId),22)} ${esc(l.employeeName)}</span>${leaveTypeTag(l.leaveType)}
        </div>`).join('') : '<div class="muted" style="font-size:13.5px;">ไม่มีใครลาวันนี้</div>'}
    </div>
    <div class="panel">
      <h2>วันลาใกล้หมด/เกินสิทธิ์</h2>
      ${balanceWarnings.length? balanceWarnings.slice(0,8).map(b=>`
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
          <span style="display:flex; align-items:center; gap:8px;">${avatarHtml(b.emp,22)} ${esc(b.emp.name)} <span class="muted">(${esc(b.label)})</span></span>
          <span class="tag ${b.remaining<0?'tag-red':'tag-amber'}">${b.remaining<0? 'เกิน '+Math.abs(b.remaining)+' วัน' : 'เหลือ '+b.remaining+' วัน'}</span>
        </div>`).join('') : '<div class="muted" style="font-size:13.5px;">ไม่มีใครใกล้หมดสิทธิ์วันลา</div>'}
    </div>
    <div class="panel">
      <h2>บรรจุใหม่ / ทดลองงาน (≤${PROBATION_DAYS} วัน)</h2>
      ${probationEmps.length? probationEmps.map(e=>`
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
          <span style="display:flex; align-items:center; gap:8px;">${avatarHtml(e,22)} ${esc(e.name)}</span><span class="muted">${buddhistDate(e.hireDate)}</span>
        </div>`).join('') : '<div class="muted" style="font-size:13.5px;">ไม่มีพนักงานอยู่ระหว่างทดลองงาน</div>'}
    </div>
  </div>
  `;
}

function renderDashboardCharts(){
  const fy = fiscalYearRange();
  const leavesFY = state.leaves.filter(l=>l.startDate && inRange(l.startDate, fy.start, fy.end) && isApproved(l));
  const leaveByType = {'ป':0,'พ':0,'ก':0};
  leavesFY.forEach(l=>{ if(leaveByType[l.leaveType]!==undefined) leaveByType[l.leaveType]+=Number(l.days||0); });

  const c1 = document.getElementById('chartLeaveType');
  if(c1){
    if(charts.leaveType) charts.leaveType.destroy();
    charts.leaveType = new Chart(c1, {
      type:'bar',
      data:{ labels:['ลาป่วย','ลาพักผ่อน','ลากิจ'], datasets:[{ label:'วันลา', data:[leaveByType['ป'],leaveByType['พ'],leaveByType['ก']], backgroundColor:['#16303C','#B08A3E','#3F6B4E'], borderRadius:3, maxBarThickness:46 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true, ticks:{precision:0}} } }
    });
  }
  const byDept = {};
  state.employees.forEach(e=>{ byDept[e.department||'ไม่ระบุ'] = (byDept[e.department||'ไม่ระบุ']||0)+1; });
  const c2 = document.getElementById('chartDept');
  if(c2){
    if(charts.dept) charts.dept.destroy();
    charts.dept = new Chart(c2, {
      type:'bar',
      data:{ labels:Object.keys(byDept), datasets:[{ label:'จำนวนพนักงาน', data:Object.values(byDept), backgroundColor:'#1F4152', borderRadius:3, maxBarThickness:46 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{beginAtZero:true, ticks:{precision:0}} } }
    });
  }

  const trend = monthlyLeaveTrend(fy);
  const c3 = document.getElementById('chartLeaveTrend');
  if(c3){
    if(charts.leaveTrend) charts.leaveTrend.destroy();
    charts.leaveTrend = new Chart(c3, {
      type:'line',
      data:{ labels:trend.map(b=>THAI_MONTHS_SHORT[b.m]), datasets:[{ label:'วันลา', data:trend.map(b=>b.total), borderColor:'#6C5CE7', backgroundColor:'rgba(108,92,231,0.12)', fill:true, tension:.35, pointRadius:3 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true, ticks:{precision:0}} } }
    });
  }

  const welfareFY = state.welfare.filter(w=>w.submitDate && inRange(w.submitDate, fy.start, fy.end) && isApproved(w));
  const welfareByCat = {};
  WELFARE_CATS.forEach(c=>{ welfareByCat[c.label] = 0; });
  welfareFY.forEach(w=>{ if(welfareByCat[w.category]!==undefined) welfareByCat[w.category]+=Number(w.approvedAmount||0); });
  const c4 = document.getElementById('chartWelfareCat');
  if(c4){
    if(charts.welfareCat) charts.welfareCat.destroy();
    charts.welfareCat = new Chart(c4, {
      type:'bar',
      data:{ labels:Object.keys(welfareByCat), datasets:[{ label:'บาท', data:Object.values(welfareByCat), backgroundColor:'#B08A3E', borderRadius:3, maxBarThickness:36 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{beginAtZero:true, ticks:{precision:0}} } }
    });
  }
}

