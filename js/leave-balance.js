/* ===== leave-balance.js =====
   วันลาพักผ่อนสะสม (vacation carry-over)

   ยอด "สะสมยกมา" ของปีงบประมาณใด ๆ = ยอดคงเหลือของปีงบประมาณก่อนหน้า
   (สิทธิ์ปีนั้น + สะสมยกมาปีนั้น − ใช้ไปจริงที่อนุมัติแล้ว) โดยไม่ติดลบ
   และไม่เกินเพดานตามนโยบายด้านล่าง ระบบคำนวณต่อเนื่องเป็นลูกโซ่ทุกปี
   ตั้งแต่ "ปีงบประมาณฐาน" ซึ่งใช้ค่าที่กรอกไว้ในช่อง "ลาพักผ่อนสะสมยกมา"
   ของพนักงานแต่ละคนเป็นยอดตั้งต้น

   นโยบายนี้อยู่ในโค้ดเพื่อให้ทุกเครื่อง/ทุกเบราว์เซอร์คำนวณได้ตรงกัน
   (การตั้งค่าในหน้า "ตั้งค่า" ถูกเก็บแยกในแต่ละเบราว์เซอร์) หากต้องการ
   เปลี่ยนนโยบาย ให้แก้ค่าใน VACATION_CARRY_POLICY แล้ว deploy ใหม่
   ================================================================== */
const VACATION_CARRY_POLICY = {
  enabled: true,        // false = กลับไปใช้ค่า "ลาพักผ่อนสะสมยกมา" ที่กรอกเองแบบเดิมทุกปี
  baseFY: 2569,         // ปีงบประมาณ (พ.ศ.) ที่ใช้ค่า carryVacation ที่กรอกไว้เป็นยอดตั้งต้น
  capMode: 'gov',       // 'none'  = ยกยอดคงเหลือทั้งหมด
                        // 'fixed' = ยกได้ไม่เกิน capDays วัน
                        // 'gov'   = แบบระเบียบราชการ: สิทธิ์ปีนี้ + สะสม รวมไม่เกิน govTotal
                        //           (อายุงานครบ govSeniorYears ปี รวมไม่เกิน govTotalSenior)
  capDays: 10,
  govTotal: 20,
  govTotalSenior: 30,
  govSeniorYears: 10
};

function vacationPolicy(){ return VACATION_CARRY_POLICY; }

/* ---------- fiscal-year helpers (ปีงบประมาณ ต.ค. – ก.ย.) ---------- */
function fiscalYearBE(ref){
  const r = fiscalYearRange(ref);
  return r.end.getFullYear() + 543;
}
function fiscalRangeOfBE(be){
  const endY = Number(be) - 543;
  return { start: new Date(endY-1, 9, 1), end: new Date(endY, 8, 30) };
}
function fiscalYearLabel(be){ return 'ปีงบประมาณ ' + be; }

function approvedLeaveDays(empId, typeKey, range){
  let sum = 0;
  state.leaves.forEach(l=>{
    if(l.employeeId!==empId || l.leaveType!==typeKey || !isApproved(l) || !l.startDate) return;
    if(inRange(l.startDate, range.start, range.end)) sum += safeNum(l.days);
  });
  return sum;
}

function serviceYearsAt(emp, date){
  const h = localDate(emp && emp.hireDate);
  if(!h) return 0;
  return (date - h) / (1000*60*60*24*365.25);
}

/* Applies the carry ceiling to "what's left over" from the previous year. */
function applyVacationCap(leftover, emp, targetFY, right){
  const p = vacationPolicy();
  leftover = Math.max(0, leftover);
  if(p.capMode==='fixed') return { carry: Math.min(leftover, safeNum(p.capDays)), cap: safeNum(p.capDays) };
  if(p.capMode==='gov'){
    const yrs = serviceYearsAt(emp, fiscalRangeOfBE(targetFY).start);
    const totalCap = yrs >= p.govSeniorYears ? p.govTotalSenior : p.govTotal;
    const cap = Math.max(0, totalCap - right);
    return { carry: Math.min(leftover, cap), cap };
  }
  return { carry: leftover, cap: null };
}

function roundDays(n){ return Math.round(n*100)/100; }

/* Full vacation picture for one employee in one fiscal year, plus the chain
   of earlier years it was derived from (shown in reports so HR can audit). */
function vacationBalance(emp, fyBE){
  const p = vacationPolicy();
  fyBE = Number(fyBE) || fiscalYearBE();
  const right = safeNum(emp.vacationRight);
  const manualCarry = safeNum(emp.carryVacation);
  const empBase = Number(emp.carryVacationBaseFY) || p.baseFY;

  const used = approvedLeaveDays(emp.id, 'พ', fiscalRangeOfBE(fyBE));

  // legacy / pre-base years: keep the hand-entered carry exactly as before
  if(!p.enabled || fyBE <= empBase){
    const carry = fyBE===empBase || !p.enabled ? manualCarry : 0;
    return { fy: fyBE, right, carry, total: roundDays(right+carry), used, remaining: roundDays(right+carry-used),
             auto:false, history:[], prev:null };
  }

  const hireDate = localDate(emp.hireDate);
  const hireFY = hireDate ? fiscalYearBE(hireDate) : null;
  let startFY = empBase, carry = manualCarry;
  if(hireFY && hireFY > empBase){ startFY = hireFY; carry = 0; }

  const history = [];
  for(let y = startFY; y < fyBE; y++){
    const u = approvedLeaveDays(emp.id, 'พ', fiscalRangeOfBE(y));
    const remaining = right + carry - u;
    const capped = applyVacationCap(remaining, emp, y+1, right);
    history.push({ fy:y, right, carry:roundDays(carry), used:u, remaining:roundDays(remaining),
                   carriedOut:roundDays(capped.carry), cap:capped.cap, lost: roundDays(Math.max(0,remaining)-capped.carry) });
    carry = capped.carry;
  }
  if(hireFY && fyBE < hireFY) carry = 0;
  carry = roundDays(carry);
  return { fy: fyBE, right, carry, total: roundDays(right+carry), used, remaining: roundDays(right+carry-used),
           auto:true, history, prev: history.length ? history[history.length-1] : null };
}

function vacationCarryNote(vb){
  if(!vb || !vb.auto) return 'ยอดยกมาตามที่บันทึกไว้';
  if(!vb.prev) return 'เริ่มงานในปีนี้ ยังไม่มียอดยกมา';
  const p = vb.prev;
  let s = `คงเหลือจากปีงบ ${p.fy}: ${p.right} + ${p.carry} − ${p.used} = ${p.remaining} วัน`;
  if(p.lost > 0) s += ` (เกินเพดาน ตัดออก ${p.lost} วัน)`;
  return s;
}
