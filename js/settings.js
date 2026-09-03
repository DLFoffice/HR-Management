/* ===== settings.js ===== */
/* ================= SETTINGS ================= */
function viewSettings(){
  return `
  <div class="page-header"><div><h1>ตั้งค่าเชื่อมต่อ Google Sheet</h1><div class="sub">เชื่อมระบบเข้ากับ Google Sheet ของคุณผ่าน Google Apps Script Web App</div></div></div>

  <div class="panel">
    <h2>1. Web App URL</h2>
    <div class="setting-row">
      <input id="gasUrlInput" placeholder="https://script.google.com/macros/s/xxxxx/exec" value="${esc(state.settings.gasUrl)}">
      <button class="btn btn-primary" id="btnSaveUrl">บันทึก URL</button>
    </div>
    <div class="status-line">
      <span class="sync-dot ${state.settings.gasUrl?'sync-none':'sync-none'}" id="settingsDot"></span>
      <span id="settingsStatusText">${state.settings.gasUrl? (state.lastSync? 'ซิงค์ล่าสุด '+fmtDateTime(state.lastSync) : 'ยังไม่เคยซิงค์') : 'ยังไม่ได้ตั้งค่า URL'}</span>
    </div>
    <div style="display:flex; gap:8px; margin-top:14px;">
      <button class="btn" id="btnTestConn">ทดสอบการเชื่อมต่อ</button>
      <button class="btn btn-primary" id="btnManualSync">ซิงค์ข้อมูลตอนนี้</button>
      <button class="btn btn-gold" id="btnRepairDates">ซ่อมข้อมูลวันที่ผิดพลาด</button>
    </div>
    <div class="muted" style="font-size:12px; margin-top:8px;">
      กด "ซ่อมข้อมูลวันที่ผิดพลาด" หากพบว่าบางเซลล์ในชีตแสดงวันที่แบบยาวผิดปกติ (เช่น 2018-05-31T17:00:00.000Z) ปุ่มนี้จะแก้ไขให้เหลือแค่วันที่ล้วนโดยไม่กระทบข้อมูลอื่น</div>
  </div>

  <div class="panel">
    <h2>2. วิธีสร้าง Web App (ทำครั้งเดียว)</h2>
    <div class="steps">
      <ol>
        <li>เปิด Google Sheet ที่ต้องการใช้เป็นฐานข้อมูล (สร้างไฟล์ใหม่ก็ได้)</li>
        <li>เมนู <code class="inline">ส่วนขยาย (Extensions)</code> → <code class="inline">Apps Script</code></li>
        <li>ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดจากไฟล์ <code class="inline">Code.gs</code> ที่ได้รับแทน</li>
        <li>กด <code class="inline">Deploy</code> → <code class="inline">New deployment</code> → เลือกประเภท <code class="inline">Web app</code></li>
        <li>ตั้งค่า Execute as: <code class="inline">Me</code> และ Who has access: <code class="inline">Anyone</code></li>
        <li>กด Deploy แล้วคัดลอก Web app URL มาวางที่ช่องด้านบน แล้วกด "บันทึก URL"</li>
        <li>กด "ซิงค์ข้อมูลตอนนี้" ระบบจะสร้างชีตย่อยทั้ง 4 หมวดให้อัตโนมัติ</li>
      </ol>
    </div>
  </div>

  <div class="panel">
    <h2>3. โลโก้องค์กรและการอัปโหลดรูปภาพ (Cloudinary)</h2>
    <div style="font-size:13.5px; color:var(--ink-soft); margin-bottom:14px;">
      ระบบใช้ <a href="https://cloudinary.com" target="_blank" rel="noopener">Cloudinary</a> สำหรับอัปโหลดรูปภาพ (โลโก้องค์กร / รูปพนักงาน) จำเป็นต้องมี Cloud name และ Upload preset แบบ <b>Unsigned</b> จากบัญชี Cloudinary ของคุณก่อน (ดูวิธีตั้งค่าด้านล่าง)
    </div>
    <div class="field-grid" style="margin-bottom:8px;">
      <div class="field"><label>Cloudinary Cloud name</label><input id="cldCloud" placeholder="เช่น dxxxxxxxx" value="${esc(state.settings.cloudinaryCloud)}"></div>
      <div class="field"><label>Upload preset (Unsigned)</label><input id="cldPreset" placeholder="เช่น hr_uploads" value="${esc(state.settings.cloudinaryPreset)}"></div>
    </div>
    <button class="btn btn-primary btn-sm" id="btnSaveCloudinary">บันทึกการตั้งค่า Cloudinary</button>
    <div class="steps" style="margin-top:16px;">
      <ol>
        <li>สมัคร/เข้าสู่ระบบที่ <code class="inline">cloudinary.com</code> แล้วไปที่หน้า Dashboard เพื่อคัดลอก <code class="inline">Cloud name</code></li>
        <li>ไปที่ <code class="inline">Settings → Upload → Upload presets</code> แล้วกด <code class="inline">Add upload preset</code></li>
        <li>ตั้งค่า <code class="inline">Signing Mode</code> เป็น <code class="inline">Unsigned</code> แล้วบันทึก คัดลอกชื่อ preset มาใส่ด้านบน</li>
      </ol>
    </div>

    <div style="border-top:1px solid var(--line); margin:18px 0 16px; padding-top:16px;">
      <label style="display:block; font-size:12.5px; color:var(--ink-soft); margin-bottom:8px; font-weight:500;">โลโก้องค์กร (แสดงที่แถบด้านซ้ายและหัวรายงาน)</label>
      <div style="display:flex; align-items:center; gap:14px;">
        <div id="logoPreviewBox" style="width:56px; height:56px; border-radius:14px; border:1px solid var(--line-strong); display:flex; align-items:center; justify-content:center; overflow:hidden; background:var(--lav-bg); flex-shrink:0;">
          ${state.settings.logoUrl? `<img src="${esc(state.settings.logoUrl)}" style="width:100%; height:100%; object-fit:contain;">` : '<span style="color:var(--lav-deep); font-weight:600;">บค</span>'}
        </div>
        <div style="flex:1;">
          <input id="logoUrlInput" placeholder="วางลิงก์รูปโลโก้ (URL)" value="${esc(state.settings.logoUrl)}" style="margin-bottom:8px;">
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-sm" id="btnSaveLogoUrl">บันทึกลิงก์โลโก้</button>
            <span class="muted" style="font-size:12.5px;">หรือ</span>
            <label class="btn btn-sm" style="cursor:pointer;">อัปโหลดไฟล์ใหม่<input type="file" id="logoFileInput" accept="image/*" style="display:none;"></label>
            <span id="logoUploadStatus" style="font-size:12.5px; color:var(--ink-soft);"></span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="panel">
    <h2>4. ข้อมูลที่เก็บในระบบ</h2>
    <div style="font-size:13.5px; color:var(--ink-soft);">
      พนักงาน ${state.employees.length} คน · รายการลา ${state.leaves.length} รายการ · เงินกู้ ${state.loans.length} สัญญา · สวัสดิการ ${state.welfare.length} รายการ
      <br>ข้อมูลจะถูกเก็บสำรองไว้ในเบราว์เซอร์นี้ด้วย เผื่อกรณีไม่ได้เชื่อมต่ออินเทอร์เน็ต
    </div>
  </div>

  <div class="panel">
    <h2>5. นำเข้าข้อมูลพนักงาน</h2>
    <div style="font-size:13.5px; color:var(--ink-soft); margin-bottom:12px;">
      ระบบตรวจพบข้อมูลพนักงานจากไฟล์ Excel ที่เคยแนบไว้ 2 ชุด เลือกนำเข้าชุดที่ต้องการ (แนะนำให้ตั้งค่า Google Sheet ก่อน เพื่อให้ข้อมูลถูกส่งขึ้นชีตไปพร้อมกัน)
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
      <button class="btn btn-gold" id="btnImportSeed">นำเข้าชุดข้อมูลเดิม (35 คน พร้อมประวัติวันลา/เงินกู้/สวัสดิการ)</button>
      <button class="btn btn-primary" id="btnImportSeed2569">นำเข้าทะเบียนพนักงานล่าสุด (133 คน จากไฟล์ ข้อมูลพนักงาน_2569)</button>
    </div>
    <div style="font-size:12.5px; color:var(--ink-faint);">
      หมายเหตุ: ทะเบียน 133 คน มีเฉพาะข้อมูลชื่อ-ตำแหน่ง-สังกัด-วันเกิด-วันเข้างาน-วันเกษียณ (วันเกษียณคำนวณเป็นวันที่ 30 กันยายนของปีที่ระบุในไฟล์) ส่วนสิทธิ์ลา/วงเงินกู้/วงเงินสวัสดิการตั้งค่าเริ่มต้นมาตรฐานไว้ให้ สามารถแก้ไขเป็นรายคนได้ภายหลัง<br>
      หากเคยนำเข้าชุด 35 คนไปแล้ว การนำเข้าชุด 133 คนเพิ่มจะทำให้มีชื่อซ้ำกันบางส่วน แนะนำให้ตรวจสอบและลบรายการซ้ำที่หน้า "ข้อมูลพนักงาน" หลังนำเข้า
    </div>
  </div>

  <div class="panel">
    <h2>6. บัญชีผู้ดูแลระบบและสิทธิ์เข้าระบบรายบุคคล</h2>
    <div style="font-size:13.5px; color:var(--ink-soft); margin-bottom:12px;">
      ตั้งค่าชื่อผู้ใช้/รหัสผ่านสำหรับ<b>ผู้ดูแลระบบ</b> (ค่าเริ่มต้น Admin/Admin — แนะนำให้เปลี่ยนทันที) ส่วน<b>พนักงานทั่วไป</b>จะใช้เลขบัตรประชาชน 13 หลักของตัวเองเป็นทั้งชื่อผู้ใช้และรหัสผ่านโดยอัตโนมัติ (ต้องกรอกเลขบัตรประชาชนไว้ที่หน้า "ข้อมูลพนักงาน" ของแต่ละคนก่อน จึงจะล็อกอินได้)
    </div>
    <div class="field-grid" style="margin-bottom:10px;">
      <div class="field"><label>ชื่อผู้ใช้แอดมิน</label><input id="adminUsernameSetting" value="${esc(state.settings.adminUsername||'Admin')}"></div>
      <div class="field"><label>รหัสผ่านแอดมิน</label><input type="password" id="adminPasswordSetting" placeholder="รหัสผ่านใหม่" value=""></div>
    </div>
    <button class="btn btn-primary btn-sm" id="btnSaveAdminAuth">บันทึกบัญชีผู้ดูแลระบบ</button>
    <div class="muted" style="font-size:12px; margin-top:10px;">
      พนักงานที่ยังไม่มีเลขบัตรประชาชนในระบบจะยังเข้าสู่ระบบด้วยตนเองไม่ได้ — ไปที่หน้า "ข้อมูลพนักงาน" แล้วกดแก้ไขแต่ละคนเพื่อเพิ่มเลขบัตรประชาชน<br>
      ⚠️ นี่เป็นการควบคุมสิทธิ์ระดับหน้าจอสำหรับทีมงานภายใน ไม่ใช่ระบบความปลอดภัยข้อมูลระดับสูง เนื่องจากข้อมูลทั้งหมดยังซิงค์ผ่าน Google Sheet เดียวกัน
    </div>
  </div>

  <div class="panel">
    <h2>7. ตรวจสอบข้อมูลเลขบัตรประชาชน (แก้ปัญหาล็อกอินไม่ได้)</h2>
    <div style="font-size:13.5px; color:var(--ink-soft); margin-bottom:12px;">
      ถ้าพนักงานล็อกอินด้วยเลขบัตรประชาชนไม่ได้ ให้พิมพ์เลขบัตรที่นี่เพื่อตรวจสอบว่าระบบมีข้อมูลตรงกันหรือไม่ (ตรวจสอบแบบเดียวกับตอนล็อกอินจริงทุกประการ)
    </div>
    <div class="searchbar">
      <input type="text" id="idCardChecker" placeholder="พิมพ์เลขบัตรประชาชน 13 หลักเพื่อทดสอบ" maxlength="13">
    </div>
    <div id="idCardCheckResult"></div>

    <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--line);">
      <div class="muted" style="font-size:12.5px; margin-bottom:8px;">
        <b>ชื่อคอลัมน์จริงที่ระบบอ่านได้จากพนักงานคนแรก</b> (ใช้เทียบว่าคอลัมน์เลขบัตรประชาชนชื่อตรงกับ <code class="inline">idCard</code> หรือไม่ — เครื่องหมาย · แทนช่องว่างแฝงที่มองไม่เห็น)
      </div>
      <div style="background:var(--lav-bg); border-radius:10px; padding:10px 14px; font-family:monospace; font-size:12.5px; word-break:break-all;">
        ${state.employees[0] ? Object.keys(state.employees[0]).map(k=>`<span style="display:inline-block; margin:2px 6px 2px 0; padding:2px 8px; background:#fff; border-radius:6px; border:1px solid var(--line-strong); ${k==='idCard'?'color:var(--green); font-weight:700;':''}">${esc(k.replace(/ /g,'·'))}</span>`).join('') : 'ยังไม่มีข้อมูลพนักงานให้ตรวจสอบ'}
      </div>
      <div class="muted" style="font-size:12px; margin-top:8px;">
        ${state.employees[0] && state.employees[0].idCard!==undefined ? '✓ พบคอลัมน์ idCard ในข้อมูล (แต่ค่าอาจว่างสำหรับพนักงานคนนี้)' : '✗ ไม่พบคอลัมน์ชื่อ idCard เป๊ะๆ เลย — ดูรายการด้านบนว่าคอลัมน์เลขบัตรของคุณถูกอ่านมาเป็นชื่ออะไร แล้วไปแก้ชื่อหัวคอลัมน์ในชีตให้เป็น idCard เป๊ะๆ (ลบแล้วพิมพ์ใหม่จะชัวร์กว่าแก้ไขของเดิม เผื่อมีช่องว่างแฝง)'}
      </div>
    </div>

    <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--line);">
      <div class="muted" style="font-size:12.5px; margin-bottom:8px;">รายชื่อพนักงานที่มีเลขบัตรประชาชนในระบบแล้ว (${state.employees.filter(e=>e.idCard).length} / ${state.employees.length} คน)</div>
      <div class="table-wrap" style="max-height:260px; overflow-y:auto;">
        <table class="reg">
          <thead><tr><th>ชื่อ-นามสกุล</th><th>เลขบัตรที่ระบบอ่านได้</th></tr></thead>
          <tbody>
            ${state.employees.filter(e=>e.idCard).map(e=>`<tr><td>${esc(e.name)}</td><td class="num" style="font-family:monospace;">${esc(e.idCard)}</td></tr>`).join('') || '<tr class="empty-row"><td colspan="2">ยังไม่มีพนักงานคนไหนมีเลขบัตรประชาชนในระบบเลย</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  `;
}

async function importSeedDataGeneric(list, label){
  if(state.employees.length > 0){
    if(!confirm('ระบบมีข้อมูลพนักงานอยู่แล้ว ('+state.employees.length+' คน) การนำเข้าจะเพิ่มข้อมูลชุด "'+label+'" ต่อท้าย อาจมีชื่อซ้ำกันได้ ต้องการดำเนินการต่อหรือไม่?')) return;
  }
  toast('กำลังนำเข้าข้อมูล...');
  state.employees.push(...list);
  await saveCache();
  renderView();
  if(gasReady()){
    try{
      for(const e of list) await gasPost({action:'add', sheet:'employees', data:e});
      toast('นำเข้า '+list.length+' รายการ และส่งขึ้น Google Sheet สำเร็จ');
    }catch(e){
      toast('นำเข้าข้อมูลในระบบสำเร็จ แต่ส่งขึ้น Google Sheet ไม่สำเร็จ: '+e.message);
    }
  } else {
    toast('นำเข้า '+list.length+' รายการสำเร็จ (ยังไม่ได้เชื่อมต่อ Google Sheet)');
  }
}

async function importSeedData(){
  if(state.employees.length > 0){
    if(!confirm('ระบบมีข้อมูลพนักงานอยู่แล้ว การนำเข้าจะเพิ่มข้อมูลชุดเดิมต่อท้าย ต้องการดำเนินการต่อหรือไม่?')) return;
  }
  toast('กำลังนำเข้าข้อมูล...');
  state.employees.push(...SEED_DATA.employees);
  state.leaves.push(...SEED_DATA.leaves);
  state.loans.push(...SEED_DATA.loans);
  state.welfare.push(...SEED_DATA.welfare);
  await saveCache();
  renderView();
  if(gasReady()){
    try{
      for(const e of SEED_DATA.employees) await gasPost({action:'add', sheet:'employees', data:e});
      for(const l of SEED_DATA.leaves) await gasPost({action:'add', sheet:'leaves', data:l});
      for(const l of SEED_DATA.loans) await gasPost({action:'add', sheet:'loans', data:l});
      for(const w of SEED_DATA.welfare) await gasPost({action:'add', sheet:'welfare', data:w});
      toast('นำเข้าข้อมูลและส่งขึ้น Google Sheet สำเร็จ');
    }catch(e){
      toast('นำเข้าข้อมูลในระบบสำเร็จ แต่ส่งขึ้น Google Sheet ไม่สำเร็จ: '+e.message);
    }
  } else {
    toast('นำเข้าข้อมูลสำเร็จ (ยังไม่ได้เชื่อมต่อ Google Sheet)');
  }
}

