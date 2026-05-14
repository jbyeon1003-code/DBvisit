import puppeteer from "@cloudflare/puppeteer";

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 테스트 중 신청 버튼 클릭 비활성화 — true로 변경하면 실제 신청 진행
const SUBMIT_ENABLED = true;

const INFO = {
  VISITORS: [
    { name: "한준석", birth: "1977-01-03", phone: "010-2299-0880", laptop_sn: null },
    { name: "최선국", birth: "1979-05-03", phone: "010-9431-4524", laptop_sn: "PF35R8Y6(SK)" },
    { name: "조영택", birth: "1985-01-20", phone: "010-9104-1369", laptop_sn: "PF410726(YT)" },
    { name: "신영재", birth: "1985-04-05", phone: "010-9506-9327", laptop_sn: "PF46LP6P(YJ)" },
    { name: "이영훈", birth: "1988-06-20", phone: "010-5113-9792", laptop_sn: "PF123456(YH)" },
    { name: "강정규", birth: "1990-03-07", phone: "010-9747-2803", laptop_sn: "PF3AWQP1(JG)" },
    { name: "변정호", birth: "1990-08-12", phone: "010-3802-0065", laptop_sn: "PF46CER0(JH)" },
    { name: "김시준", birth: "1992-01-08", phone: "010-2785-8026", laptop_sn: "PG46FEY5(SJ)" },
    { name: "권이건", birth: "1994-12-10", phone: "010-7184-3984", laptop_sn: "PF3YV1PX(LK)" },
    { name: "장덕수", birth: "1996-04-14", phone: "010-9377-7379", laptop_sn: "5CG4255D3R(DS)" },
    { name: "백한빈", birth: "1996-08-31", phone: "010-8669-3444", laptop_sn: "PF3YAA2F(HB)" },
    { name: "박찬순", birth: "1999-04-07", phone: "010-5815-6911", laptop_sn: "PF4SLTEF(CS)" },
  ],
  VISITOR_COMPANY: "ASML",
  MANAGER_NAME: "채명주",
  LOCATION_CODE: "3000",
  PLACE_CODE: "4 ",
  VISIT_START_HOUR: "9",
  VISIT_START_MINUTE: "0",
  VISIT_END_HOUR: "18",
  VISIT_END_MINUTE: "0",
  TARGET_URL: "https://ims.dbhitek.com",
};

// 콘솔 스크립트와 동일한 로직을 page.evaluate(string)으로 실행
// page.evaluate(function(){}) 방식은 esbuild가 __name 헬퍼를 주입해 오류 발생
// page.evaluate(string) 방식은 번들러 변환 없이 브라우저에서 직접 실행
function buildScript(visitors, extraVisitors, startDate, endDate, laptopAll, managerName) {
  function esc(obj) {
    return JSON.stringify(obj).replace(/[^\x00-\x7F]/g, c =>
      '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
    );
  }
  const V  = esc(visitors);
  const EV = esc(extraVisitors);
  const LA = esc(laptopAll || extraVisitors);
  const I = esc({
    LOCATION_CODE: INFO.LOCATION_CODE,
    PLACE_CODE: INFO.PLACE_CODE,
    MANAGER_NAME: managerName || INFO.MANAGER_NAME,
    VISITOR_COMPANY: INFO.VISITOR_COMPANY,
    VISIT_START_DATE: startDate,
    VISIT_END_DATE: endDate,
    VISIT_START_HOUR: INFO.VISIT_START_HOUR,
    VISIT_START_MINUTE: INFO.VISIT_START_MINUTE,
    VISIT_END_HOUR: INFO.VISIT_END_HOUR,
    VISIT_END_MINUTE: INFO.VISIT_END_MINUTE,
  });

  return `(async () => {
  const V  = ${V};
  const EV = ${EV};
  const LA = ${LA};
  const I  = ${I};

  function setVal(el, v) {
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const qs    = n => Array.from(document.querySelectorAll('input,select,textarea')).find(e => e.name === n);
  const qsAll = n => Array.from(document.querySelectorAll('input,select,textarea')).filter(e => e.name === n);

  try {
    // 전체 동의 체크
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => { if (!cb.checked) cb.click(); });
    await new Promise(r => setTimeout(r, 300));

    setVal(qs('Location'), I.LOCATION_CODE);
    await new Promise(r => setTimeout(r, 400));

    setVal(qs('VisitStartDate'),       I.VISIT_START_DATE);
    setVal(qs('VisitStartDateHour'),   I.VISIT_START_HOUR);
    setVal(qs('VisitStartDateMinute'), I.VISIT_START_MINUTE);
    setVal(qs('VisitEndDate'),         I.VISIT_END_DATE);
    setVal(qs('VisitEndDateHour'),     I.VISIT_END_HOUR);
    setVal(qs('VisitEndDateMinute'),   I.VISIT_END_MINUTE);

    // 담당자 검색 팝업
    document.querySelector('input[name="ContactName"]')?.click();
    await new Promise(r => setTimeout(r, 500));
    const nameInp = document.querySelector('#popSelectPerson input[name="Name"]');
    if (nameInp) {
      nameInp.focus();
      nameInp.value = I.MANAGER_NAME;
      nameInp.dispatchEvent(new Event('input',  { bubbles: true }));
      nameInp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.querySelector('button[onclick="searchPerson();"]')?.click();
    await new Promise(r => setTimeout(r, 1500));
    const personRow = Array.from(document.querySelectorAll('#dvSearchPersonList tbody tr'))
      .find(r => r.innerText.includes(I.MANAGER_NAME));
    if (personRow) (personRow.querySelector('a') || personRow.querySelector('td') || personRow).click();
    await new Promise(r => setTimeout(r, 500));

    setVal(qs('PlaceCodeID'), I.PLACE_CODE);
    const purposeSel = qs('VisitPurposeCodeID');
    if (purposeSel) {
      const opt = Array.from(purposeSel.options).find(o =>
        o.text.includes('공사') || o.text.includes('수리') || o.text.toLowerCase().includes('setup')
      );
      if (opt) setVal(purposeSel, opt.value);
    }
    await new Promise(r => setTimeout(r, 400));

    // 방문객 입력
    for (let i = 0; i < V.length; i++) {
      const nameInputs = qsAll('Name[]');
      if (nameInputs[i]) {
        nameInputs[i].focus();
        nameInputs[i].value = V[i].name;
        nameInputs[i].dispatchEvent(new Event('input',  { bubbles: true }));
        nameInputs[i].dispatchEvent(new Event('change', { bubbles: true }));
      }
      const births = qsAll('BirthDate[]');
      setVal(births[i], V[i].birth);
      // closest('tr')로 행 전체를 잡아야 다른 td의 확인 버튼도 탐색됨
      const row = births[i] && (births[i].closest('tr') || births[i].closest('div') || births[i].parentElement);
      const confirmBtn = row && Array.from(row.querySelectorAll('button,input[type=button],a')).find(b => {
        const t = (b.innerText || b.value || '').trim();
        return t === '확인' || t === 'Confirm' || t === 'Check';
      });
      if (confirmBtn) { confirmBtn.click(); await new Promise(r => setTimeout(r, 800)); }
      const cos = qsAll('CompanyName[]');
      setVal(cos[i], I.VISITOR_COMPANY);
      const mobiles = qsAll('Mobile[]');
      if (mobiles[i] && V[i].phone) setVal(mobiles[i], V[i].phone);
      await new Promise(r => setTimeout(r, 400));
    }
    // 모든 방문객 입력 완료 후 fullPage 스크린샷 (검증 1)
    console.log('__SHOT__:visitors:방문객 ' + V.length + '명 입력 완료');
    await new Promise(r => setTimeout(r, 800));

    // 휴대물품: 추가인원의 노트북 S/N을 휴대물품 팝업에 입력
    const withLaptop = LA.filter(v => v && v.laptop_sn);
    if (withLaptop.length > 0) {
      if (typeof goCarryItem === 'function') goCarryItem(0);
      await new Promise(r => setTimeout(r, 1500));
      for (let i = 0; i < withLaptop.length; i++) {
        const expected = i + 1;
        for (let w = 0; w < 10; w++) {
          if (document.querySelectorAll('input[name="ItemName"]').length >= expected) break;
          await new Promise(r => setTimeout(r, 300));
        }
        const itemNames = document.querySelectorAll('input[name="ItemName"]');
        const last = itemNames.length - 1;
        if (itemNames[last]) {
          setVal(itemNames[last], '노트북');
          setVal(document.querySelectorAll('input[name="ItemSN"]')[last], withLaptop[i].laptop_sn);
          setVal(document.querySelectorAll('input[name="Quantity"]')[last], '1');
        }
        await new Promise(r => setTimeout(r, 400));
        if (i === withLaptop.length - 1) {
          // 모든 항목 입력 완료 → 팝업 닫기 전에 스크린샷 (검증 2)
          console.log('__SHOT__:equipment:노트북 ' + withLaptop.length + '/' + withLaptop.length + ' 입력 완료 (팝업 확인)');
          await new Promise(r => setTimeout(r, 1500));
          document.querySelector('.pop-btn-green')?.click();
        } else {
          (document.getElementById('btn-add-carryitem') || document.querySelector('[onclick*="addCarryItem"]'))?.click();
          await new Promise(r => setTimeout(r, 600));
        }
      }
    }

    // (선택) 동의 해제
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const p = cb.closest('label,tr,li,div') || cb.parentElement;
      const t = p ? p.innerText : '';
      if ((t.includes('(선택)') || t.includes('선택사항')) && cb.checked) cb.click();
    });
    console.log('__SHOT__:submit_result:최종 상태 (신청 직전)');
    await new Promise(r => setTimeout(r, 800));

    return { ok: true, count: V.length, hasLaptop: withLaptop.length > 0 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
})()`;
}

async function takeScreenshot(page, fullPage = true) {
  try {
    const shot = await page.screenshot({ type: "jpeg", quality: 70, fullPage });
    const bytes = new Uint8Array(shot);
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.slice(i, i + CHUNK));
    }
    return btoa(binary);
  } catch (e) {
    console.error(`[screenshot] ${e.message}`);
    return null;
  }
}

async function launchBrowser(myBrowser, onRetry) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await puppeteer.launch(myBrowser, { keep_alive: 10000 });
    } catch (e) {
      const isRetryable =
        e.message.includes('429') ||
        e.message.includes('Rate limit') ||
        e.message.includes('/v1/acquire') ||
        e.message.includes('acquire') ||
        e.message.includes('session');
      if (isRetryable && attempt < 3) {
        const wait = attempt * 3000;
        if (onRetry) await onRetry(attempt, wait);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── /health ──────────────────────────────────────────────────
    if (path === "/health") {
      return jsonRes({ ok: true, browser_ok: !!env.MY_BROWSER, assets_ok: !!env.ASSETS });
    }

    // ── /debug ───────────────────────────────────────────────────
    if (path === "/debug") {
      let browser = null, page = null;
      try {
        browser = await launchBrowser(env.MY_BROWSER);
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.goto(INFO.TARGET_URL, { waitUntil: "networkidle0", timeout: 20000 });
        await sleep(1500);
        const shot1 = await takeScreenshot(page);

        const clickResult = await page.evaluate(`(() => {
          const btn = Array.from(document.querySelectorAll('button, a')).find(b => {
            const t = (b.innerText || '').trim();
            return (t === '방문신청' || t === 'Apply Visit') && t.length <= 10;
          });
          if (btn) { btn.scrollIntoView({ behavior: 'instant', block: 'center' }); btn.click(); return { clicked: true, text: btn.innerText.trim() }; }
          return { clicked: false, candidates: Array.from(document.querySelectorAll('button,a')).map(b => (b.innerText||'').trim()).filter(t => t.length > 0 && t.length < 60) };
        })()`);

        await sleep(3000);
        const shot2 = await takeScreenshot(page);
        const visibleInputs = await page.evaluate(`(() =>
          Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea'))
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
            .map(el => ({ tag: el.tagName, type: el.type, id: el.id, name: el.name, placeholder: el.placeholder }))
        )()`);

        await browser.close();
        return jsonRes({ shot1, clickResult, shot2, visibleInputs });
      } catch (e) {
        if (browser) try { await browser.close(); } catch {}
        return jsonRes({ error: `${e.constructor.name}: ${e.message}` });
      }
    }

    // ── /debug-goods ─────────────────────────────────────────────
    if (path === "/debug-goods") {
      let browser = null, page = null;
      try {
        browser = await launchBrowser(env.MY_BROWSER);
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.goto(INFO.TARGET_URL, { waitUntil: "networkidle0", timeout: 20000 });
        await sleep(1500);
        await page.evaluate(`(() => {
          const btn = Array.from(document.querySelectorAll('button,a')).find(b => {
            const t = (b.innerText||'').trim();
            return (t==='방문신청'||t==='Apply Visit') && t.length <= 10;
          });
          if (btn) { btn.scrollIntoView({behavior:'instant',block:'center'}); btn.click(); }
        })()`);
        await sleep(3000);
        const shot1 = await takeScreenshot(page);
        const analysis = await page.evaluate(`(() => {
          const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).map(cb => {
            const c = cb.closest('label,tr,li,div') || cb.parentElement;
            return { id: cb.id, name: cb.name, checked: cb.checked, label: c ? c.innerText.trim().slice(0,100) : '' };
          });
          const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea'))
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
            .map(el => ({ tag: el.tagName, name: el.name, id: el.id, placeholder: el.placeholder }));
          return { checkboxes, inputs };
        })()`);
        await browser.close();
        return jsonRes({ shot1, analysis });
      } catch (e) {
        if (browser) try { await browser.close(); } catch {}
        return jsonRes({ error: `${e.constructor.name}: ${e.message}` });
      }
    }

    // ── /debug-autofill ──────────────────────────────────────────
    // 확인 버튼 클릭 전후 필드 상태를 비교해 자동완성 여부 진단
    if (path === "/debug-autofill") {
      let browser = null, page = null;
      try {
        browser = await launchBrowser(env.MY_BROWSER);
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.goto(INFO.TARGET_URL, { waitUntil: "networkidle0", timeout: 20000 });
        await sleep(1000);
        // 교육 팝업 닫기
        await page.evaluate(`(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').trim() === '취소');
          if (btn) btn.click();
        })()`);
        await sleep(800);
        // 방문신청 버튼 클릭
        await page.evaluate(`(() => {
          const btn = Array.from(document.querySelectorAll('button,a')).find(b => {
            const t = (b.textContent||'').replace(/\\s+/g,' ').trim();
            return t === '방문신청' || t === 'Apply Visit';
          });
          if (btn) btn.click();
        })()`);
        // 폼 열릴 때까지 대기
        for (let i = 0; i < 16; i++) {
          await sleep(500);
          const opened = await page.evaluate(`(()=>!!document.querySelector('select[name="Location"],input[name="VisitStartDate"]'))()`);
          if (opened) break;
        }
        // 전체 동의 체크
        await page.evaluate(`(() => {
          document.querySelectorAll('input[type="checkbox"]').forEach(cb => { if (!cb.checked) cb.click(); });
        })()`);
        await sleep(300);

        // 첫 번째 방문객 이름·생년월일 입력
        const testVisitor = INFO.VISITORS[0];
        await page.evaluate(`((name, birth) => {
          function setVal(el, v) {
            if (!el) return;
            el.value = v;
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const nameEl = Array.from(document.querySelectorAll('input[name="Name[]"]'))[0];
          if (nameEl) { nameEl.focus(); setVal(nameEl, name); }
          const birthEl = Array.from(document.querySelectorAll('input[name="BirthDate[]"]'))[0];
          if (birthEl) setVal(birthEl, birth);
        })("${testVisitor.name}", "${testVisitor.birth}")`);
        await sleep(500);

        // 확인 버튼 탐색 결과 및 클릭 전 필드 상태
        const beforeClick = await page.evaluate(`(() => {
          const birthEl = document.querySelectorAll('input[name="BirthDate[]"]')[0];
          const row = birthEl && (birthEl.closest('tr') || birthEl.closest('div'));
          const confirmBtn = row && Array.from(row.querySelectorAll('button,input[type=button],a')).find(b => {
            const t = (b.innerText||b.value||'').trim();
            return t==='확인'||t==='Confirm'||t==='Check';
          });
          const allInputs = Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea'))
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
            .map(el => ({ name: el.name, value: el.value, placeholder: el.placeholder }));
          return {
            confirmBtnFound: !!confirmBtn,
            confirmBtnText: confirmBtn ? (confirmBtn.innerText||confirmBtn.value||'').trim() : null,
            rowTag: row ? row.tagName : null,
            allInputs,
          };
        })()`);

        // 확인 버튼 클릭
        await page.evaluate(`(() => {
          const birthEl = document.querySelectorAll('input[name="BirthDate[]"]')[0];
          const row = birthEl && (birthEl.closest('tr') || birthEl.closest('div'));
          const btn = row && Array.from(row.querySelectorAll('button,input[type=button],a')).find(b => {
            const t = (b.innerText||b.value||'').trim();
            return t==='확인'||t==='Confirm'||t==='Check';
          });
          if (btn) btn.click();
        })()`);
        await sleep(2000); // 자동완성 응답 대기

        // 클릭 후 필드 상태
        const afterClick = await page.evaluate(`(() => {
          return Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea'))
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
            .map(el => ({ name: el.name, value: el.value, placeholder: el.placeholder }));
        })()`);

        const shot = await takeScreenshot(page, false);
        await browser.close();
        return jsonRes({ beforeClick, afterClick, shot });
      } catch (e) {
        if (browser) try { await browser.close(); } catch {}
        return jsonRes({ error: `${e.constructor.name}: ${e.message}` });
      }
    }

    // ── /debug-scroll ────────────────────────────────────────────
    // 사용법: GET /debug-scroll?y=800  → 방문신청 폼을 열고 y픽셀로 스크롤 후 스크린샷 반환
    if (path === "/debug-scroll") {
      const scrollY = parseInt(url.searchParams.get("y") ?? "0", 10);
      let browser = null, page = null;
      try {
        browser = await launchBrowser(env.MY_BROWSER);
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.goto(INFO.TARGET_URL, { waitUntil: "networkidle0", timeout: 20000 });
        await sleep(1000);
        // 교육 팝업 닫기
        await page.evaluate(`(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').trim() === '취소');
          if (btn) btn.click();
        })()`);
        await sleep(800);
        // 방문신청 버튼 클릭
        await page.evaluate(`(() => {
          const btn = Array.from(document.querySelectorAll('button,a')).find(b => {
            const t = (b.textContent||'').replace(/\\s+/g,' ').trim();
            return t === '방문신청' || t === 'Apply Visit';
          });
          if (btn) btn.click();
        })()`);
        // 폼 열릴 때까지 대기
        for (let i = 0; i < 16; i++) {
          await sleep(500);
          const opened = await page.evaluate(`(()=>!!document.querySelector('select[name="Location"],input[name="VisitStartDate"]'))()`);
          if (opened) break;
        }
        // 지정 y 위치로 스크롤
        await page.evaluate(`(()=>{
          window.scrollTo(0, ${scrollY});
          document.documentElement.scrollTop = ${scrollY};
          document.body.scrollTop = ${scrollY};
        })()`);
        await sleep(600);
        const shot = await takeScreenshot(page, false);
        await browser.close();
        return new Response(`<!DOCTYPE html><html><body style="margin:0;background:#111">
<p style="color:#fff;font-family:sans-serif;padding:8px">y=${scrollY} — 원하는 화면이면 이 y값을 알려주세요</p>
<img src="data:image/jpeg;base64,${shot}" style="max-width:100%;display:block">
</body></html>`, { headers: { "Content-Type": "text/html" } });
      } catch (e) {
        if (browser) try { await browser.close(); } catch {}
        return new Response(`<pre style="color:red">${e.message}</pre>`, { headers: { "Content-Type": "text/html" } });
      }
    }

    // ── /run ─────────────────────────────────────────────────────
    if (path === "/run" && request.method === "POST") {
      const body = await request.json();
      const { start: startDate, end: rawEndDate, singleIndex, extraIndices, laptopIndices, managerName } = body;

      if (!startDate) return jsonRes({ ok: false, error: "방문시작일이 누락되었습니다." });

      const endDate = rawEndDate && rawEndDate >= startDate ? rawEndDate : startDate;
      const singleVisitor = singleIndex != null ? INFO.VISITORS[singleIndex] : null;
      const extraVisitors = (Array.isArray(extraIndices) ? extraIndices.map(i => INFO.VISITORS[i]) : []).filter(Boolean);
      // 폼 입력은 선택된 1명만, 완료 메시지에는 전체 인원 표시
      const formVisitors = [singleVisitor].filter(Boolean);
      const allVisitors = [singleVisitor, ...extraVisitors].filter(Boolean);
      // 휴대물품: 노트북추가에서 체크된 전체 목록 (단일 방문객 포함)
      const laptopBase = Array.isArray(laptopIndices) ? laptopIndices.map(i => INFO.VISITORS[i]).filter(Boolean) : extraVisitors;
      const laptopVisitors = laptopBase.filter(v => v.laptop_sn);

      if (!singleVisitor) return jsonRes({ ok: false, error: "방문객을 선택해주세요." });

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const enc = new TextEncoder();
      const TOTAL = 5;

      const send = async (step, msg, extra = {}) => {
        const line = JSON.stringify({ step, total: TOTAL, msg, ...extra });
        await writer.write(enc.encode(`data: ${line}\n\n`));
      };

      (async () => {
        let browser = null, page = null, stage = "초기화";
        try {
          stage = "브라우저 실행";
          await send(1, "브라우저를 실행하는 중...");
          if (!env.MY_BROWSER) throw new Error("MY_BROWSER 바인딩 없음");
          browser = await launchBrowser(env.MY_BROWSER, async (attempt, waitMs) => {
            await send(1, `브라우저 사용량 초과 — ${waitMs / 1000}초 후 재시도 (${attempt}/3)...`);
          });
          page = await browser.newPage();
          await page.setViewport({ width: 1280, height: 900 });

          stage = "사이트 접속";
          await send(2, "사이트에 접속하는 중...");
          await page.goto(INFO.TARGET_URL, { waitUntil: "networkidle0", timeout: 20000 });
          await sleep(1000);

          // 교육 팝업 닫기 — '취소' 버튼만 정확히 클릭
          await page.evaluate(`(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b =>
              (b.textContent||'').trim() === '취소'
            );
            if (btn) btn.click();
          })()`);
          await sleep(1000);

          stage = "방문신청 버튼 클릭";
          await send(3, "방문신청 버튼 클릭 중...");
          const clicked = await page.evaluate(`(() => {
            const btn = Array.from(document.querySelectorAll('button,a')).find(b => {
              const t = (b.textContent||'').replace(/\\s+/g, ' ').trim();
              return t === '방문신청' || t === 'Apply Visit';
            });
            if (btn) { btn.scrollIntoView({behavior:'instant',block:'center'}); btn.click(); return true; }
            return false;
          })()`);
          if (!clicked) throw new Error("'방문신청'/'Apply Visit' 버튼 미발견");

          // 폼 필드 등장 여부로 실제 버튼 클릭 성공 검증 (최대 8초 폴링)
          let formOpened = false;
          for (let i = 0; i < 16; i++) {
            await sleep(500);
            formOpened = await page.evaluate(`(()=>!!document.querySelector('select[name="Location"],input[name="VisitStartDate"]'))()`);
            if (formOpened) break;
          }

          if (!formOpened) {
            const errShot = await takeScreenshot(page);
            await send(3, "방문신청 폼이 열리지 않았습니다", { screenshot: errShot, shotKey: "error", done: true, ok: false, stage, error: "방문신청 버튼 클릭 후 폼이 열리지 않음 — 페이지를 직접 확인해주세요." });
            throw new Error("방문신청 버튼 클릭 후 폼이 열리지 않음");
          }
          await send(3, "방문신청 폼 열림 확인 완료");

          stage = "양식 자동 입력";
          await send(4, `양식 자동 입력 중... (${singleVisitor.name})`);

          const waitForNoLoading = async () => {
            for (let i = 0; i < 20; i++) {
              const loading = await page.evaluate(`(() => {
                const sel = '.loading, .spinner, [class*="loading"], [class*="spinner"], [id*="loading"], [id*="spinner"]';
                const el = document.querySelector(sel);
                return el ? window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden' : false;
              })()`).catch(() => false);
              if (!loading) break;
              await new Promise(r => setTimeout(r, 300));
            }
          };

          page.on('console', async msg => {
            const text = msg.text();
            if (!text.startsWith('__SHOT__:')) return;
            const [shotKey, ...labelParts] = text.slice(9).split(':');
            const label = labelParts.join(':');
            await new Promise(r => setTimeout(r, 600));
            await waitForNoLoading();
            if (shotKey === 'visitors') {
              const fields = await page.evaluate(`(() => {
                const qs = n => document.querySelector('[name="' + n + '"]');
                const qsAll = n => Array.from(document.querySelectorAll('input,select,textarea')).filter(e => e.name === n);
                const selText = n => {
                  const el = qs(n);
                  if (!el) return '';
                  if (el.tagName === 'SELECT') return (el.options[el.selectedIndex]?.text || el.value).trim();
                  return el.value;
                };
                const pad = v => String(v || '0').padStart(2, '0');
                return {
                  visit: {
                    location: selText('Location'),
                    startDate: (qs('VisitStartDate')?.value || '') + ' ' + (qs('VisitStartDateHour')?.value || '') + ':' + pad(qs('VisitStartDateMinute')?.value),
                    endDate:   (qs('VisitEndDate')?.value   || '') + ' ' + (qs('VisitEndDateHour')?.value   || '') + ':' + pad(qs('VisitEndDateMinute')?.value),
                    contact:   selText('ContactName'),
                    place:     selText('PlaceCodeID'),
                    purpose:   selText('VisitPurposeCodeID'),
                  },
                  visitors: qsAll('Name[]').map((el, i) => ({
                    name:    el.value,
                    birth:   (qsAll('BirthDate[]')[i]   || { value: '' }).value,
                    company: (qsAll('CompanyName[]')[i]  || { value: '' }).value,
                    phone:   (qsAll('Mobile[]')[i]       || { value: '' }).value,
                  })),
                };
              })()`).catch(() => null);
              await send(4, label, { fields, shotKey });
            } else if (shotKey === 'equipment') {
              const fields = await page.evaluate(`(() => {
                const names = Array.from(document.querySelectorAll('input[name="ItemName"]')).map(e => e.value);
                const sns   = Array.from(document.querySelectorAll('input[name="ItemSN"]')).map(e => e.value);
                const qtys  = Array.from(document.querySelectorAll('input[name="Quantity"]')).map(e => e.value);
                return names.map((name, i) => ({ item: name, sn: sns[i] || '', qty: qtys[i] || '' }))
                             ;
              })()`).catch(() => null);
              await send(4, label, { fields, shotKey });
            }
          });

          const fillResult = await page.evaluate(buildScript(formVisitors, extraVisitors, startDate, endDate, laptopBase, managerName));
          if (!fillResult || !fillResult.ok) throw new Error(fillResult?.error || "폼 입력 실패");

          if (fillResult.hasLaptop) {
            await sleep(1000);
            await send(4, "휴대물품 입력 완료");
          }
          // [스크린샷 꺼짐 — 켜달라고 하면 다시 활성화]

          // 신청 버튼 클릭 (SUBMIT_ENABLED = false 이면 스킵)
          stage = "신청 버튼 클릭";
          if (!SUBMIT_ENABLED) {
            await sleep(500);
            await send(5, "[테스트] 입력 완료", {
              done: true, ok: true, submitOk: false,
              msg: `[테스트 모드] 입력 완료 (${allVisitors.map(v => v.name).join(', ')}) — 신청 버튼은 클릭하지 않음`,
            });
          } else {
            await send(5, "신청 버튼 클릭 중...");
            let submitOk = false;
            let submitBtnText = null;
            let navShot = null;

            // 네이티브 confirm() 다이얼로그 자동 수락
            page.once('dialog', async dialog => {
              await sleep(300);
              await dialog.accept();
            });

            // 페이지 이동 후 스크린샷 등록
            page.once('framenavigated', async () => {
              navShot = await takeScreenshot(page, true).catch(() => null);
            });

            try {
              const submitResult = await page.evaluate(`(() => {
                const el = document.evaluate(
                  '/html/body/div[1]/div[4]/div/div[3]/button[2]',
                  document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
                ).singleNodeValue;
                if (el) {
                  el.scrollIntoView({behavior:'instant',block:'center'});
                  el.click();
                  return { clicked: true, text: (el.innerText||'').trim() };
                }
                return { clicked: false, candidates: [] };
              })()`);
              submitOk = submitResult.clicked;
              submitBtnText = submitResult.clicked ? submitResult.text : '버튼 미발견(XPath)';
            } catch (e) {
              if (e.message.includes('Target closed') || e.message.includes('Session closed') || e.message.includes('Execution context')) {
                submitOk = true;
                submitBtnText = '(페이지 전환으로 확인)';
              } else {
                throw e;
              }
            }

            // 팝업(방문신청하시겠습니까?) 대기
            await sleep(800);

            // HTML 팝업 확인 버튼 클릭 (방문신청하시겠습니까?)
            await page.evaluate(`(() => {
              // 팝업/모달 안의 확인 버튼 우선 탐색
              const popups = document.querySelectorAll('.modal,.popup,.pop-wrap,[class*="modal"],[class*="popup"],[id*="modal"],[id*="popup"]');
              for (const popup of popups) {
                const btn = Array.from(popup.querySelectorAll('button,a')).find(el => {
                  const t = (el.innerText||el.textContent||'').trim();
                  return t==='확인'||t==='예'||t==='Yes'||t==='OK'||t==='Confirm';
                });
                if (btn) { btn.click(); return; }
              }
              // 팝업 못 찾으면 전체에서 탐색
              const btn = Array.from(document.querySelectorAll('button,a')).find(el => {
                const t = (el.innerText||el.textContent||'').trim();
                return t==='확인'||t==='예'||t==='Yes'||t==='OK';
              });
              if (btn) btn.click();
            })()`).catch(() => {});

            await sleep(2000);
            await send(5, submitOk ? `신청 버튼 클릭됨 (${submitBtnText})` : `신청 버튼 미발견`, {
              done: true, ok: true, submitOk,
              msg: submitOk
                ? `방문신청 완료 (${allVisitors.map(v => v.name).join(', ')})`
                : "신청 버튼을 찾을 수 없습니다.",
            });
          }

        } catch (e) {
          console.error(`[ERROR] ${stage}: ${e.message}`);
          const screenshot = page ? await takeScreenshot(page) : null;
          await send(0, `오류: ${e.message}`, { done: true, ok: false, stage, error: e.message, screenshot, shotKey: "error" });
        } finally {
          if (browser) try { await browser.close(); } catch {}
          await writer.close();
        }
      })();

      return new Response(readable, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // ── 정적 파일 서빙 ────────────────────────────────────────────
    return env.ASSETS.fetch(request);
  },
};
