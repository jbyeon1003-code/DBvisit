import puppeteer from "@cloudflare/puppeteer";

const INFO = {
  VISITORS: [
    { name: "한준석", birth: "1977-01-03" },
    { name: "최선국", birth: "1979-05-03" },
    { name: "조영택", birth: "1985-01-20" },
    { name: "신영재", birth: "1985-04-05" },
    { name: "이영훈", birth: "1988-06-20" },
    { name: "강정규", birth: "1990-03-07" },
    { name: "변정호", birth: "1990-08-12" },
    { name: "김시준", birth: "1992-01-08" },
    { name: "권이건", birth: "1994-12-10" },
    { name: "장덕수", birth: "1996-04-14" },
    { name: "백한빈", birth: "1996-08-31" },
    { name: "박찬순", birth: "1999-04-07" },
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

// Name[] 제외한 모든 폼 필드를 채우고 방문객 행을 추가함
function buildFillFormScript(runtimeInfo) {
  const infoJson = JSON.stringify(runtimeInfo).replace(
    /[^\x00-\x7F]/g,
    c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
  return `(async () => {
    const info = ${infoJson};
    try {
      // (필수)동의 체크박스 전부 체크
      document.querySelectorAll('input[type="checkbox"]')
        .forEach(cb => { if (!cb.checked) cb.click(); });
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

// Name[] 필드에 이름 설정: 네이티브 setter로 DOM 값 직접 세팅
// \uXXXX 이스케이프 대신 한글 리터럴을 스크립트에 직접 삽입 (Worker 내부 INFO.VISITORS에서 온 값)
// 이벤트 미발생 — React onChange가 한글을 깨뜨리므로
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


async function takeScreenshot(page) {
  try {
    const shot = await page.screenshot({ type: "jpeg", quality: 70, fullPage: true });
    // @cloudflare/puppeteer는 Uint8Array 반환 — web API btoa() 사용
    const bytes = new Uint8Array(shot);
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.slice(i, i + CHUNK));
    }
    const b64 = btoa(binary);
    console.log(`[DEBUG] Screenshot: ${b64.length} chars`);
    return b64;
  } catch (e) {
    console.error(`[DEBUG] Screenshot failed: ${e.constructor.name}: ${e.message}`);
    return null;
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

    // ── /debug: 단계별 스크린샷으로 봇이 보는 화면 확인 ─────────────
    if (path === "/debug") {
      let browser = null;
      let page = null;
      try {
        browser = await puppeteer.launch(env.MY_BROWSER);
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });

        // 1) 초기 페이지
        await page.goto(INFO.TARGET_URL, { waitUntil: "networkidle0", timeout: 20000 });
        await page.waitForTimeout(1500);
        const shot1 = await takeScreenshot(page);

        // 2) "Apply Visit" / "방문신청" 정확한 텍스트 매칭으로 클릭
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

        // 클릭 후 표시된 input/select 필드 (hidden 제외)
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

        // 2b) Location을 3000(상우캠퍼스)로 변경 후 PlaceCodeID 옵션 확인
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

        // 3) "Add Visitor" 클릭 → 방문객 행 필드 확인
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
            .filter(i => {
              const r = i.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            })
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

    // ── /run ─────────────────────────────────────────────────────
    if (path === "/run" && request.method === "POST") {
      const body = await request.json();
      const { start: startDate, end: rawEndDate, visitorIndices } = body;

      if (!startDate) {
        return jsonRes({ ok: false, error: "방문시작일이 누락되었습니다." });
      }
      if (!Array.isArray(visitorIndices) || visitorIndices.length === 0) {
        return jsonRes({ ok: false, error: "visitorIndices(방문객 인덱스 배열)가 누락되었습니다." });
      }

      // 종료일 미지정 또는 시작일보다 이른 경우 시작일로 자동 설정
      const endDate = rawEndDate && rawEndDate >= startDate ? rawEndDate : startDate;

      // 선택된 방문객만 (INFO.VISITORS에서 인덱스로 조회 — 한글 인코딩 문제 없음)
      const selectedVisitors = visitorIndices.map(i => INFO.VISITORS[i]).filter(Boolean);
      if (selectedVisitors.length === 0) {
        return jsonRes({ ok: false, error: "유효한 방문객 인덱스가 없습니다." });
      }

      // SSE 스트리밍 설정
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const enc = new TextEncoder();

      const TOTAL_STEPS = 5;
      const send = async (step, msg, extra = {}) => {
        const line = JSON.stringify({ step, total: TOTAL_STEPS, msg, ...extra });
        await writer.write(enc.encode(`data: ${line}\n\n`));
      };

      // 자동화 비동기 실행 (응답 스트림은 즉시 반환)
      (async () => {
        let browser = null, page = null, stage = "초기화";
        try {
          stage = "브라우저 실행";
          await send(1, "브라우저를 실행하는 중...");
          if (!env.MY_BROWSER) throw new Error("MY_BROWSER 바인딩 없음");
          browser = await puppeteer.launch(env.MY_BROWSER);
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

          stage = "폼 입력";
          await send(4, `폼 입력 중... (방문객 ${selectedVisitors.length}명)`);
          const runtimeInfo = {
            ...INFO,
            VISITORS: selectedVisitors,
            VISIT_START_DATE: startDate,
            VISIT_END_DATE: endDate,
          };
          const result = await page.evaluate(buildFillFormScript(runtimeInfo));
          if (!result.success) throw new Error(result.error);
          await page.evaluate(buildFillNamesScript(selectedVisitors.map(v => v.name)));

          stage = "완료";
          await send(5, "스크린샷 촬영 중...");
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
              VisitPurposeCodeID: get('VisitPurposeCodeID'),
              Names: getAll('Name[]'),
              BirthDates: getAll('BirthDate[]'),
              Mobiles: getAll('Mobile[]'),
              Companies: getAll('CompanyName[]'),
            };
          })()`);
          const screenshot = await takeScreenshot(page);
          await browser.close(); browser = null;

          await send(5, "완료!", { done: true, ok: true, formState, screenshot });

        } catch (e) {
          console.error(`[ERROR] ${stage}: ${e.message}`);
          const screenshot = page ? await takeScreenshot(page) : null;
          if (browser) try { await browser.close(); } catch {}
          await send(0, `오류: ${e.message}`, { done: true, ok: false, stage, error: e.message, screenshot });
        } finally {
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
