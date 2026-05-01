import puppeteer from "@cloudflare/puppeteer";

const INFO = {
  VISITORS: [
    { name: "한준석", birth: "1977-01-03", laptop_sn: null },
    { name: "최선국", birth: "1979-05-03", laptop_sn: "PF35R8Y6" },
    { name: "조영택", birth: "1985-01-20", laptop_sn: "PF410726" },
    { name: "신영재", birth: "1985-04-05", laptop_sn: "PF46LP6P" },
    { name: "이영훈", birth: "1988-06-20", laptop_sn: "PF123456" },
    { name: "강정규", birth: "1990-03-07", laptop_sn: "PF3AWQP1" },
    { name: "변정호", birth: "1990-08-12", laptop_sn: "PF46CER0" },
    { name: "김시준", birth: "1992-01-08", laptop_sn: "PG46FEY5" },
    { name: "권이건", birth: "1994-12-10", laptop_sn: "PF3YV1PX" },
    { name: "장덕수", birth: "1996-04-14", laptop_sn: "5CG4255D3R" },
    { name: "백한빈", birth: "1996-08-31", laptop_sn: "PF3YAA2F" },
    { name: "박찬순", birth: "1999-04-07", laptop_sn: "PF4SLTEF" },
  ],
  VISITOR_PHONE: "01038020065",
  VISITOR_COMPANY: "ASML",
  MANAGER_NAME: "채명주",
  MANAGER_DEPT_KOR: "구매팀",
  MANAGER_DEPT_ENG: "Procurement",
  LOCATION_CODE: "3000",   // 3000 = DB HiTek Sangwoo Cam.
  PLACE_CODE: "4 ",        // 4 = Sangwoo Admin (상우캠퍼스 어드민동)
  PURPOSE_CODE: "0",       // 0 = Meeting
  VISIT_START_HOUR: "9",
  VISIT_START_MINUTE: "0",
  VISIT_END_HOUR: "18",
  VISIT_END_MINUTE: "0",
  TARGET_URL: "https://ims.dbhitek.com",
};

// esbuild가 번들링할 때 __name() 유틸리티를 주입하여 브라우저 컨텍스트에서 오류 발생.
// page.evaluate(string) 방식은 번들러 변환 없이 브라우저에서 직접 실행되므로 안전.

function buildFillFormScript(runtimeInfo) {
  const infoJson = JSON.stringify(runtimeInfo).replace(
    /[^\x00-\x7F]/g,
    c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
  return `(async () => {
    const info = ${infoJson};
    try {
      // (필수) 동의만 체크, (선택) 동의는 건드리지 않음
      Array.from(document.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
        const container = cb.closest('label,tr,li,div') || cb.parentElement;
        const text = container ? container.innerText : '';
        const isOptional = text.includes('(선택)') || text.includes('선택사항');
        const isRequired = cb.required || text.includes('(필수)') || text.includes('필수항목');
        if (isRequired && !isOptional && !cb.checked) cb.click();
      });
      await new Promise(r => setTimeout(r, 300));

      function setVal(el, value) {
        if (!el) return false;
        try {
          const proto = el.tagName === 'SELECT'
            ? window.HTMLSelectElement.prototype
            : el.tagName === 'TEXTAREA'
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
          if (descriptor && descriptor.set) descriptor.set.call(el, value);
          else el.value = value;
        } catch (_) { el.value = value; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      function qs(name) {
        return Array.from(document.querySelectorAll('input, select, textarea'))
          .find(el => el.name === name) || null;
      }
      function qsAll(name) {
        return Array.from(document.querySelectorAll('input, select, textarea'))
          .filter(el => el.name === name);
      }

      setVal(qs('Location'), info.LOCATION_CODE);
      await new Promise(r => setTimeout(r, 800));
      setVal(qs('PlaceCodeID'), info.PLACE_CODE);
      setVal(qs('ContactName'), info.MANAGER_NAME);
      setVal(qs('ContactOrgNameKor'), info.MANAGER_DEPT_KOR);
      setVal(qs('ContactOrgNameEng'), info.MANAGER_DEPT_ENG);
      setVal(qs('VisitStartDate'), info.VISIT_START_DATE);
      setVal(qs('VisitStartDateHour'), info.VISIT_START_HOUR);
      setVal(qs('VisitStartDateMinute'), info.VISIT_START_MINUTE);
      setVal(qs('VisitEndDate'), info.VISIT_END_DATE);
      setVal(qs('VisitEndDateHour'), info.VISIT_END_HOUR);
      setVal(qs('VisitEndDateMinute'), info.VISIT_END_MINUTE);
      setVal(qs('VisitPurposeCodeID'), info.PURPOSE_CODE);

      // 방문객 행 먼저 모두 추가
      for (let i = 1; i < info.VISITORS.length; i++) {
        const addBtn = Array.from(document.querySelectorAll('button, a')).find(b => {
          const t = (b.innerText || '').trim();
          return t === 'Add Visitor' || t === '방문객 추가' || t === '방문객추가';
        });
        if (addBtn) { addBtn.click(); await new Promise(r => setTimeout(r, 600)); }
      }

      // Name[] 제외한 방문객 필드 채우기 (생년월일은 개인별 적용)
      const birthInputs   = qsAll('BirthDate[]');
      const mobileInputs  = qsAll('Mobile[]');
      const companyInputs = qsAll('CompanyName[]');
      for (let i = 0; i < info.VISITORS.length; i++) {
        setVal(birthInputs[i],   info.VISITORS[i].birth);
        setVal(mobileInputs[i],  info.VISITOR_PHONE);
        setVal(companyInputs[i], info.VISITOR_COMPANY);
      }

      return { success: true, error: null, rowCount: qsAll('Name[]').length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  })()`;
}

function buildFillNamesScript(visitors) {
  function jsStr(s) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
  }
  const visitorLiterals = "[" + visitors.map(jsStr).join(", ") + "]";
  return `(() => {
    const visitors = ${visitorLiterals};
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const nameInputs = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter(el => el.name === 'Name[]');
    for (let i = 0; i < visitors.length; i++) {
      if (nameInputs[i]) nativeSetter.set.call(nameInputs[i], visitors[i]);
    }
  })()`;
}

// 휴대물품 섹션에 노트북 S/N 입력
// laptopVisitors: [{name, birth, laptop_sn}, ...] (laptop_sn이 null이 아닌 것만)
function buildEquipmentScript(laptopVisitors) {
  const json = JSON.stringify(laptopVisitors).replace(
    /[^\x00-\x7F]/g,
    c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
  return `(async () => {
    const visitors = ${json};
    const ITEM_NAME = '노트북'; // 노트북

    try {
      function setVal(el, value) {
        if (!el) return false;
        try {
          const proto = el.tagName === 'SELECT'
            ? window.HTMLSelectElement.prototype
            : window.HTMLInputElement.prototype;
          const d = Object.getOwnPropertyDescriptor(proto, 'value');
          if (d && d.set) d.set.call(el, value);
          else el.value = value;
        } catch (_) { el.value = value; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      // 1. 휴대물품 체크박스 찾아서 활성화
      const goodsCb = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(cb => {
        const container = cb.closest('label,tr,li,div') || cb.parentElement;
        const text = (container ? container.innerText : '') + ' ' + (cb.id || '') + ' ' + (cb.name || '');
        return text.includes('휴대물품') || text.includes('반입물품') ||
               text.toLowerCase().includes('goods') || text.toLowerCase().includes('carry');
      });
      if (goodsCb && !goodsCb.checked) {
        goodsCb.click();
        await new Promise(r => setTimeout(r, 1000));
      }

      // 디버그: 현재 페이지의 모든 입력 필드 수집
      const allFields = Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea'))
        .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .map(el => ({ name: el.name, id: el.id, placeholder: el.placeholder, type: el.type }));

      // 2. 각 방문객별 물품 행 추가 및 입력
      for (let i = 0; i < visitors.length; i++) {
        if (i > 0) {
          // 물품 추가 버튼
          const addBtn = Array.from(document.querySelectorAll('button,a,input[type=button]')).find(b => {
            const t = (b.innerText || b.value || '').trim();
            return t === '추가' ||
                   t.includes('물품') ||
                   t.toLowerCase() === 'add' ||
                   t.toLowerCase().includes('add item') ||
                   t.toLowerCase().includes('add goods');
          });
          if (addBtn) { addBtn.click(); await new Promise(r => setTimeout(r, 600)); }
        }

        // 물품명 필드 탐색 (name 또는 placeholder 기반)
        const allInputs = Array.from(document.querySelectorAll('input:not([type=hidden]),select'));
        const goodsNameInputs = allInputs.filter(el => {
          const n = (el.name || '').toLowerCase();
          const p = (el.placeholder || '').toLowerCase();
          return n.includes('goodsname') || n.includes('goodname') || n.includes('itemname') ||
                 n.includes('carryname') || n.includes('goods_name') || n.includes('product') ||
                 p.includes('물품명') || p.includes('item name') || p.includes('product name');
        });

        // S/N 필드 탐색
        const snInputs = allInputs.filter(el => {
          const n = (el.name || '').toLowerCase();
          const p = (el.placeholder || '').toLowerCase();
          return n === 'sn' || n.includes('serialno') || n.includes('serial_no') ||
                 n.includes('serialnum') || n.includes('goods_sn') || n.includes('goodssn') ||
                 n.includes('snumber') || n.includes('s_n') ||
                 p === 's/n' || p.includes('serial') || p.includes('시리얼') ||
                 p.includes('일련번호');
        });

        setVal(goodsNameInputs[i], ITEM_NAME);
        setVal(snInputs[i], visitors[i].laptop_sn);
      }

      return { success: true, count: visitors.length, allFields };
    } catch (e) {
      return { success: false, error: e.message };
    }
  })()`;
}

async function takeScreenshot(page) {
  try {
    const shot = await page.screenshot({ type: "jpeg", quality: 70, fullPage: true });
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

// 429 rate limit 시 최대 3회 재시도 (3s → 6s → 9s 대기)
async function launchBrowser(myBrowser, onRetry) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await puppeteer.launch(myBrowser);
    } catch (e) {
      const is429 = e.message.includes('429') || e.message.includes('Rate limit');
      if (is429 && attempt < 3) {
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
      return jsonRes({
        ok: true,
        browser_ok: !!env.MY_BROWSER,
        assets_ok: !!env.ASSETS,
      });
    }

    // ── /debug ───────────────────────────────────────────────────
    if (path === "/debug") {
      let browser = null;
      let page = null;
      try {
        browser = await launchBrowser(env.MY_BROWSER);
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });

        await page.goto(INFO.TARGET_URL, { waitUntil: "networkidle0", timeout: 20000 });
        await page.waitForTimeout(1500);
        const shot1 = await takeScreenshot(page);

        const clickResult = await page.evaluate(`(() => {
          const btn = Array.from(document.querySelectorAll('button, a')).find(b => {
            const t = (b.innerText || '').trim();
            return t === '방문신청' || t === 'Apply Visit';
          });
          if (btn) {
            btn.scrollIntoView({ behavior: 'instant', block: 'center' });
            btn.click();
            return { clicked: true, text: btn.innerText.trim(), tag: btn.tagName };
          }
          const candidates = Array.from(document.querySelectorAll('button, a'))
            .map(b => (b.innerText || '').trim())
            .filter(t => t.length > 0 && t.length < 60);
          return { clicked: false, candidates };
        })()`);

        await page.waitForTimeout(2500);
        const shot2 = await takeScreenshot(page);
        const url2 = page.url();

        const visibleInputs = await page.evaluate(`(() =>
          Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea'))
            .filter(i => {
              const r = i.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            })
            .map(i => ({
              tag: i.tagName, type: i.type, id: i.id,
              name: i.name, placeholder: i.placeholder,
              options: i.tagName === 'SELECT'
                ? Array.from(i.options).map(o => ({ val: o.value, text: o.text.trim() })).slice(0, 15)
                : undefined
            }))
        )()`);

        const placeOptionsAfterSangwoo = await page.evaluate(`(() => {
          const loc = document.querySelector('[name="Location"]');
          if (!loc) return { error: 'Location select not found' };
          loc.value = '3000';
          loc.dispatchEvent(new Event('change', { bubbles: true }));
          return { locationSet: true };
        })()`);
        await page.waitForTimeout(1500);
        const sangwooPlaceOptions = await page.evaluate(`(() => {
          const sel = document.querySelector('[name="PlaceCodeID"]');
          if (!sel) return [];
          return Array.from(sel.options).map(o => ({ val: o.value, text: o.text.trim() }));
        })()`);

        const addVisitorResult = await page.evaluate(`(() => {
          const btn = Array.from(document.querySelectorAll('button, a')).find(b => {
            const t = (b.innerText || '').trim();
            return t === 'Add Visitor' || t === '방문객 추가' || t === '방문객추가';
          });
          if (btn) { btn.click(); return true; }
          return false;
        })()`);

        await page.waitForTimeout(1500);
        const shot3 = await takeScreenshot(page);

        const visitorFields = await page.evaluate(`(() =>
          Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea'))
            .filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
            .map(i => ({
              tag: i.tagName, type: i.type, id: i.id,
              name: i.name, placeholder: i.placeholder,
              options: i.tagName === 'SELECT'
                ? Array.from(i.options).map(o => ({ val: o.value, text: o.text.trim() })).slice(0, 10)
                : undefined
            }))
        )()`);

        await browser.close();
        return jsonRes({
          step1_initial: { screenshot: shot1 },
          step2_after_apply_visit: { url: url2, clickResult, visibleInputs, screenshot: shot2 },
          step2b_sangwoo_place_options: { placeOptionsAfterSangwoo, sangwooPlaceOptions },
          step3_after_add_visitor: { addVisitorClicked: addVisitorResult, visitorFields, screenshot: shot3 },
        });
      } catch (e) {
        if (browser) try { await browser.close(); } catch {}
        return jsonRes({ error: `${e.constructor.name}: ${e.message}` });
      }
    }

    // ── /debug-goods: 휴대물품 섹션 구조 탐색 ─────────────────────
    if (path === "/debug-goods") {
      let browser = null;
      let page = null;
      try {
        browser = await launchBrowser(env.MY_BROWSER);
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });

        await page.goto(INFO.TARGET_URL, { waitUntil: "networkidle0", timeout: 20000 });
        await page.waitForTimeout(1500);

        // 방문신청 클릭
        await page.evaluate(`(() => {
          const btn = Array.from(document.querySelectorAll('button, a')).find(b => {
            const t = (b.innerText || '').trim();
            return t === '방문신청' || t === 'Apply Visit';
          });
          if (btn) { btn.scrollIntoView({ behavior: 'instant', block: 'center' }); btn.click(); }
        })()`);
        await page.waitForTimeout(3000);

        const shot1 = await takeScreenshot(page);

        // 페이지 전체 텍스트에서 휴대물품 관련 요소 탐색
        const goodsAnalysis = await page.evaluate(`(() => {
          // 모든 체크박스와 주변 텍스트 수집
          const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).map(cb => {
            const container = cb.closest('label,tr,li,div') || cb.parentElement;
            return {
              id: cb.id, name: cb.name, checked: cb.checked,
              labelText: container ? container.innerText.trim().slice(0, 100) : ''
            };
          });

          // 모든 버튼/링크 텍스트 수집
          const buttons = Array.from(document.querySelectorAll('button,a,input[type=button]'))
            .map(b => ({ tag: b.tagName, text: (b.innerText || b.value || '').trim(), id: b.id, class: b.className }))
            .filter(b => b.text.length > 0 && b.text.length < 80);

          // 모든 visible 입력 필드
          const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea'))
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
            .map(el => ({ tag: el.tagName, type: el.type, name: el.name, id: el.id, placeholder: el.placeholder }));

          // 페이지에서 '물품', '휴대', 'goods' 텍스트가 포함된 요소
          const goodsElements = Array.from(document.querySelectorAll('*'))
            .filter(el => {
              if (el.children.length > 5) return false;
              const t = el.innerText || '';
              return t.includes('물품') || t.includes('휴대') || t.toLowerCase().includes('goods') || t.toLowerCase().includes('carry');
            })
            .slice(0, 20)
            .map(el => ({ tag: el.tagName, id: el.id, class: el.className, text: (el.innerText || '').trim().slice(0, 80) }));

          return { checkboxes, buttons, inputs, goodsElements };
        })()`);

        // 휴대물품 체크박스가 있으면 클릭해서 섹션 활성화
        const clickedGoods = await page.evaluate(`(() => {
          const cb = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(c => {
            const container = c.closest('label,tr,li,div') || c.parentElement;
            const text = (container ? container.innerText : '') + ' ' + (c.id || '') + ' ' + (c.name || '');
            return text.includes('휴대물품') || text.includes('반입물품') ||
                   text.toLowerCase().includes('goods') || text.toLowerCase().includes('carry');
          });
          if (cb) { cb.click(); return { found: true, id: cb.id, name: cb.name }; }
          return { found: false };
        })()`);

        await page.waitForTimeout(1000);
        const shot2 = await takeScreenshot(page);

        // 활성화 후 나타난 필드
        const afterGoodsFields = await page.evaluate(`(() =>
          Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea'))
            .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
            .map(el => ({ tag: el.tagName, type: el.type, name: el.name, id: el.id, placeholder: el.placeholder }))
        )()`);

        await browser.close();
        return jsonRes({
          shot_before_goods: shot1,
          goods_analysis: goodsAnalysis,
          clicked_goods_checkbox: clickedGoods,
          shot_after_goods: shot2,
          fields_after_goods_enabled: afterGoodsFields,
        });
      } catch (e) {
        if (browser) try { await browser.close(); } catch {}
        return jsonRes({ error: `${e.constructor.name}: ${e.message}` });
      }
    }

    // ── /run ─────────────────────────────────────────────────────
    if (path === "/run" && request.method === "POST") {
      const body = await request.json();
      const { start: startDate, end: rawEndDate, visitorIndices, mode } = body;

      if (!startDate) {
        return jsonRes({ ok: false, error: "방문시작일이 누락되었습니다." });
      }
      if (!Array.isArray(visitorIndices) || visitorIndices.length === 0) {
        return jsonRes({ ok: false, error: "visitorIndices(방문객 인덱스 배열)가 누락되었습니다." });
      }

      const endDate = rawEndDate && rawEndDate >= startDate ? rawEndDate : startDate;
      const selectedVisitors = visitorIndices.map(i => INFO.VISITORS[i]).filter(Boolean);
      if (selectedVisitors.length === 0) {
        return jsonRes({ ok: false, error: "유효한 방문객 인덱스가 없습니다." });
      }

      const isMulti = mode === 'multi';
      const laptopVisitors = isMulti ? selectedVisitors.filter(v => v.laptop_sn) : [];

      // SSE 스트리밍
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const enc = new TextEncoder();

      const TOTAL_STEPS = isMulti ? 7 : 5;
      const send = async (step, msg, extra = {}) => {
        const line = JSON.stringify({ step, total: TOTAL_STEPS, msg, ...extra });
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
          await page.waitForTimeout(1000);

          stage = "방문신청 버튼 클릭";
          await send(3, "방문신청 버튼 클릭 중...");
          const clicked = await page.evaluate(`(() => {
            const btn = Array.from(document.querySelectorAll('button, a')).find(b => {
              const t = (b.innerText || '').trim();
              return t === '방문신청' || t === 'Apply Visit';
            });
            if (btn) { btn.scrollIntoView({ behavior: 'instant', block: 'center' }); btn.click(); return true; }
            return false;
          })()`);
          if (!clicked) throw new Error("'방문신청'/'Apply Visit' 버튼 미발견");
          await page.waitForTimeout(3000);

          stage = "방문객 정보 입력";
          await send(4, `방문객 정보 입력 중... (${selectedVisitors.length}명)`);
          const runtimeInfo = {
            ...INFO,
            VISITORS: selectedVisitors,
            VISIT_START_DATE: startDate,
            VISIT_END_DATE: endDate,
          };
          const result = await page.evaluate(buildFillFormScript(runtimeInfo));
          if (!result.success) throw new Error(result.error);
          await page.evaluate(buildFillNamesScript(selectedVisitors.map(v => v.name)));

          // 인원추가 모드: 휴대물품 섹션 입력
          if (isMulti && laptopVisitors.length > 0) {
            stage = "휴대물품 입력";
            await send(5, `휴대물품 입력 중... (노트북 ${laptopVisitors.length}대)`);
            const eqResult = await page.evaluate(buildEquipmentScript(laptopVisitors));
            console.log(`[equipment] result: ${JSON.stringify(eqResult)}`);
            if (!eqResult.success) {
              // 실패해도 방문객 입력은 완료됐으므로 경고만
              console.error(`[equipment] failed: ${eqResult.error}`);
            }

            stage = "스크린샷 (휴대물품)";
            await send(6, "휴대물품 입력 결과 확인 중...");
          } else if (isMulti) {
            await send(5, "휴대물품 정보 없음, 건너뜀...");
            await send(6, "스크린샷 촬영 중...");
          }

          stage = "완료";
          await send(isMulti ? 7 : 5, "스크린샷 촬영 중...");

          const formState = await page.evaluate(`(() => {
            const all = Array.from(document.querySelectorAll('input, select, textarea'));
            const get = name => { const el = all.find(e => e.name === name); return el ? el.value : null; };
            const getAll = name => all.filter(e => e.name === name).map(e => e.value);
            return {
              Location: get('Location'),
              PlaceCodeID: get('PlaceCodeID'),
              ContactName: get('ContactName'),
              VisitStartDate: get('VisitStartDate'),
              VisitEndDate: get('VisitEndDate'),
              Names: getAll('Name[]'),
              BirthDates: getAll('BirthDate[]'),
            };
          })()`);

          const screenshot = await takeScreenshot(page);
          await send(TOTAL_STEPS, "완료!", { done: true, ok: true, formState, screenshot });

        } catch (e) {
          console.error(`[ERROR] ${stage}: ${e.message}`);
          const screenshot = page ? await takeScreenshot(page) : null;
          await send(0, `오류: ${e.message}`, { done: true, ok: false, stage, error: e.message, screenshot });
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
