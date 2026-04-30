import puppeteer from "@cloudflare/puppeteer";

const INFO = {
  VISITORS: ["한준석", "최선국", "신영재", "이영훈", "강정규", "변정호", "김시준", "권이건", "장덕수", "백한빈", "박찬순"],
  VISITOR_BIRTH: "1990-08-12",
  VISITOR_PHONE: "01038020065",
  VISITOR_COMPANY: "ASML",
  MANAGER_NAME: "채명주",
  VISIT_AREA: "상우캠퍼스 어드민동",
  VISIT_PURPOSE: "업무협의",
  TARGET_URL: "https://ims.dbhitek.com",
};

// esbuild가 번들링할 때 __name() 유틸리티를 주입하여 브라우저 컨텍스트에서 오류 발생.
// page.evaluate(string) 방식은 번들러 변환 없이 브라우저에서 직접 실행되므로 안전.
function buildFillFormScript(runtimeInfo) {
  const infoJson = JSON.stringify(runtimeInfo);
  return `(async () => {
    const info = ${infoJson};
    try {
      const cbs = document.querySelectorAll('input[type="checkbox"]');
      cbs.forEach(cb => { if (!cb.checked) cb.click(); });

      const nextBtn = Array.from(document.querySelectorAll('button, a')).find(b =>
        b.innerText && ['확인', '동의', '다음'].some(t => b.innerText.includes(t))
      );
      if (nextBtn) {
        nextBtn.click();
        await new Promise(r => setTimeout(r, 2000));
      }

      const fill = (keywords, value, parent) => {
        const root = parent || document;
        const inputs = Array.from(root.querySelectorAll('input, select, textarea'));
        const target = inputs.find(i => {
          const text = ((i.id || '') + (i.name || '') + (i.placeholder || '')).toLowerCase();
          return keywords.some(k => text.includes(k.toLowerCase()));
        });
        if (!target) return false;
        if (target.tagName === 'SELECT') {
          const opt = Array.from(target.options).find(o => o.text.includes(value));
          if (opt) target.value = opt.value;
        } else {
          target.value = value;
        }
        return true;
      };

      fill(['담당자', 'manager'], info.MANAGER_NAME, null);
      fill(['지역', 'area'], info.VISIT_AREA, null);
      fill(['목적', 'purpose'], info.VISIT_PURPOSE, null);
      fill(['회사', 'company'], info.VISITOR_COMPANY, null);

      for (let i = 0; i < info.VISITORS.length; i++) {
        const visitorName = info.VISITORS[i];
        if (i > 0) {
          const addBtn = Array.from(document.querySelectorAll('button, a')).find(b =>
            b.innerText && (b.innerText.trim() === '+' || b.innerText.includes('방문객 추가'))
          );
          if (addBtn) {
            addBtn.click();
            await new Promise(r => setTimeout(r, 800));
          }
        }
        const rows = document.querySelectorAll('tr, .visitor-row');
        const currentRow = rows.length > 0 ? rows[rows.length - 1] : null;
        fill(['이름', 'name'], visitorName, currentRow);
        fill(['생년월일', 'birth'], info.VISITOR_BIRTH, currentRow);
        fill(['연락처', 'phone'], info.VISITOR_PHONE, currentRow);
        fill(['소속', 'company'], info.VISITOR_COMPANY, currentRow);
      }
      return { success: true, error: null };
    } catch (e) {
      return { success: false, error: e.message };
    }
  })()`;
}

async function takeScreenshot(page) {
  try {
    const shot = await page.screenshot({ type: "jpeg", quality: 70 });
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

    // ── /run ─────────────────────────────────────────────────────
    if (path === "/run" && request.method === "POST") {
      let browser = null;
      let page = null;
      let stage = "초기화";

      try {
        // 1단계: 요청 파싱
        stage = "요청 데이터 파싱";
        const body = await request.json();
        const { start: startDate, end: endDate, visitors: selectedVisitors = [] } = body;

        if (!startDate || !endDate) {
          return jsonRes({ ok: false, stage, error: "날짜 정보가 누락되었습니다.", screenshot: null });
        }
        if (selectedVisitors.length === 0) {
          return jsonRes({ ok: false, stage, error: "선택된 방문객이 없습니다.", screenshot: null });
        }

        // 2단계: 브라우저 실행
        stage = "브라우저 실행";
        if (!env.MY_BROWSER) {
          return jsonRes({ ok: false, stage, error: "MY_BROWSER 바인딩 없음.", screenshot: null });
        }
        browser = await puppeteer.launch(env.MY_BROWSER);
        page = await browser.newPage();

        // 3단계: 사이트 접속
        stage = "사이트 접속";
        console.log(`[DEBUG] Navigating to ${INFO.TARGET_URL}`);
        await page.goto(INFO.TARGET_URL, { waitUntil: "networkidle0", timeout: 20000 });
        await page.waitForTimeout(1000);

        const pageUrl = page.url();
        const pageTitle = await page.title();
        console.log(`[DEBUG] Page: ${pageUrl} | ${pageTitle}`);
        let screenshotB64 = await takeScreenshot(page);

        // 4단계: 방문신청 버튼 클릭
        stage = "방문신청 버튼 클릭";
        const clicked = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button, a"))
            .find(b => b.innerText && b.innerText.includes("방문신청"));
          if (btn) { btn.click(); return true; }
          return false;
        });

        if (!clicked) {
          screenshotB64 = await takeScreenshot(page);
          const buttons = await page.evaluate(() =>
            Array.from(document.querySelectorAll("button, a"))
              .map(b => (b.innerText || "").trim())
              .filter(t => t.length > 0 && t.length < 30)
              .slice(0, 25)
          );
          await browser.close();
          browser = null;
          return jsonRes({
            ok: false,
            stage,
            error: `'방문신청' 버튼 미발견\n현재 URL: ${pageUrl}\n감지된 버튼: ${JSON.stringify(buttons)}`,
            screenshot: screenshotB64,
          });
        }

        await page.waitForTimeout(3000);
        screenshotB64 = await takeScreenshot(page);

        // 5단계: 폼 입력
        stage = "폼 입력";
        console.log(`[DEBUG] Filling form for ${selectedVisitors.length} visitors`);
        const runtimeInfo = { ...INFO, VISITORS: selectedVisitors };
        const result = await page.evaluate(buildFillFormScript(runtimeInfo));

        // 6단계: 최종 스크린샷
        stage = "스크린샷 촬영";
        screenshotB64 = await takeScreenshot(page);

        await browser.close();
        browser = null;

        console.log(`[DEBUG] Form fill result: success=${result.success}, error=${result.error}`);
        return jsonRes({
          ok: result.success,
          stage: result.success ? "완료" : "폼 입력",
          error: result.error ?? null,
          screenshot: screenshotB64,
        });

      } catch (e) {
        console.error(`[DEBUG] Exception at '${stage}': ${e.constructor.name}: ${e.message}`);
        const screenshotB64 = page ? await takeScreenshot(page) : null;
        if (browser) {
          try { await browser.close(); } catch {}
        }
        return jsonRes({
          ok: false,
          stage,
          error: `[${e.constructor.name}] ${e.message}`,
          screenshot: screenshotB64,
        });
      }
    }

    // ── 정적 파일 서빙 ────────────────────────────────────────────
    return env.ASSETS.fetch(request);
  },
};
