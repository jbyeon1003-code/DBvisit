from js import Response, fetch
import json
import base64

INFO = {
    "VISITORS": ["한준석", "최선국", "신영재", "이영훈", "강정규", "변정호", "김시준", "권이건", "장덕수", "백한빈", "박찬순"],
    "VISITOR_BIRTH": "1990-08-12",
    "VISITOR_PHONE": "01038020065",
    "VISITOR_COMPANY": "ASML",
    "MANAGER_NAME": "채명주",
    "VISIT_AREA": "상우캠퍼스 어드민동",
    "VISIT_PURPOSE": "업무협의",
    "SITE_COMPANY": "상우 캠퍼스",
    "TARGET_URL": "https://ims.dbhitek.com"
}

# f-string 밖에 별도 상수로 분리 → JavaScript true/false 정상 사용 (원래 코드의 True/False 버그 수정)
FILL_FORM_JS = """
async (info, start, end) => {
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
}
"""

FIND_APPLY_BTN_JS = """
() => {
    const btns = Array.from(document.querySelectorAll('button, a'));
    const applyBtn = btns.find(b => b.innerText && b.innerText.includes('방문신청'));
    if (applyBtn) { applyBtn.click(); return true; }
    return false;
}
"""

GET_BUTTONS_JS = """
() => JSON.stringify(
    Array.from(document.querySelectorAll('button, a'))
        .map(b => (b.innerText || '').trim())
        .filter(t => t.length > 0 && t.length < 30)
        .slice(0, 25)
)
"""

# JSON.stringify를 사용해 Python에서 안전하게 문자열로 받음
GET_PAGE_INFO_JS = "() => JSON.stringify({ url: window.location.href, title: document.title })"


def json_res(data):
    """Python Workers에서 안전한 JSON 응답 생성."""
    return Response.new(json.dumps(data))


async def take_screenshot(page):
    try:
        shot = await page.screenshot({"type": "jpeg", "quality": 75, "fullPage": True})
        return base64.b64encode(shot).decode('utf-8')
    except Exception:
        return None


async def on_fetch(request, env):
    url_obj = request.url

    # ── /health: 바인딩 및 Worker 상태 확인 ──────────────────────
    if "/health" in url_obj:
        browser_attrs = []
        if hasattr(env, "MY_BROWSER"):
            try:
                browser_attrs = [a for a in dir(env.MY_BROWSER) if not a.startswith("_")]
            except Exception as e:
                browser_attrs = [f"dir() error: {e}"]
        return json_res({
            "ok": True,
            "browser_ok": hasattr(env, "MY_BROWSER"),
            "assets_ok": hasattr(env, "ASSETS"),
            "browser_attrs": browser_attrs,
        })

    # ── /browser-test: 브라우저 바인딩 방식 진단 ────────────────────
    if "/browser-test" in url_obj:
        results = {}
        # 방법 1: puppeteer.launch(env.MY_BROWSER) — JS Workers 표준 방식
        try:
            from js import puppeteer
            browser = await puppeteer.launch(env.MY_BROWSER)
            results["puppeteer_launch"] = "SUCCESS"
            page = await browser.newPage()
            results["newPage"] = "SUCCESS"
            await browser.close()
        except Exception as e:
            results["puppeteer_launch"] = f"FAIL: {type(e).__name__}: {e}"
        # 방법 2: env.MY_BROWSER.connect() — Python Workers 직접 방식
        try:
            browser2 = await env.MY_BROWSER.connect()
            attrs = [a for a in dir(browser2) if not a.startswith("_")]
            results["connect"] = f"SUCCESS - attrs: {attrs[:10]}"
            await browser2.close()
        except Exception as e:
            results["connect"] = f"FAIL: {type(e).__name__}: {e}"
        return json_res(results)

    # ── /run: 자동화 실행 ─────────────────────────────────────────
    if "/run" in url_obj and request.method == "POST":
        browser = None
        page = None
        stage = "초기화"

        try:
            # 1단계: 요청 파싱
            stage = "요청 데이터 파싱"
            raw_body = await request.text()
            body = json.loads(raw_body)
            start_date = body.get("start")
            end_date = body.get("end")
            selected_visitors = body.get("visitors", [])

            if not start_date or not end_date:
                return json_res({"ok": False, "stage": stage, "error": "날짜 정보가 누락되었습니다.", "screenshot": None})
            if not selected_visitors:
                return json_res({"ok": False, "stage": stage, "error": "선택된 방문객이 없습니다.", "screenshot": None})

            # 2단계: 브라우저 실행
            stage = "브라우저 실행"
            if not hasattr(env, "MY_BROWSER"):
                return json_res({
                    "ok": False, "stage": stage,
                    "error": "MY_BROWSER 바인딩 없음. Cloudflare Dashboard > Workers > Browser Rendering 활성화 필요",
                    "screenshot": None
                })

            browser = await env.MY_BROWSER.launch()
            page = await browser.newPage()

            # 3단계: 사이트 접속
            stage = "사이트 접속"
            print(f"DEBUG: Navigating to {INFO['TARGET_URL']}")
            await page.goto(INFO["TARGET_URL"])
            await page.waitForTimeout(2000)

            # JS에서 JSON.stringify로 직렬화 → Python str로 안전하게 수신
            page_info_str = await page.evaluate(GET_PAGE_INFO_JS)
            page_info = json.loads(str(page_info_str))
            page_url = page_info.get("url", "?")
            page_title = page_info.get("title", "?")
            print(f"DEBUG: Page loaded - URL: {page_url}, Title: {page_title}")

            screenshot_b64 = await take_screenshot(page)

            # 4단계: 방문신청 버튼 클릭
            stage = "방문신청 버튼 클릭"
            clicked = await page.evaluate(FIND_APPLY_BTN_JS)

            if not clicked:
                screenshot_b64 = await take_screenshot(page)
                buttons_str = await page.evaluate(GET_BUTTONS_JS)
                buttons_list = json.loads(str(buttons_str))
                print(f"DEBUG: Apply button not found. Buttons: {buttons_list}")
                await browser.close()
                browser = None
                return json_res({
                    "ok": False,
                    "stage": stage,
                    "error": f"'방문신청' 버튼 미발견\n현재 URL: {page_url}\n감지된 버튼: {buttons_list}",
                    "screenshot": screenshot_b64
                })

            await page.waitForTimeout(3000)
            screenshot_b64 = await take_screenshot(page)

            # 5단계: 폼 입력
            stage = "폼 입력"
            print(f"DEBUG: Filling form for {len(selected_visitors)} visitors")
            runtime_info = INFO.copy()
            runtime_info["VISITORS"] = selected_visitors

            result_proxy = await page.evaluate(FILL_FORM_JS, runtime_info, start_date, end_date)
            # JsProxy → Python: 속성으로 직접 접근
            success = bool(result_proxy.success) if result_proxy else False
            form_error = str(result_proxy.error) if result_proxy and not success and result_proxy.error else None

            # 6단계: 최종 스크린샷
            stage = "스크린샷 촬영"
            screenshot_b64 = await take_screenshot(page)

            await browser.close()
            browser = None

            print(f"DEBUG: Form fill result - success: {success}, error: {form_error}")
            return json_res({
                "ok": success,
                "stage": "완료" if success else "폼 입력",
                "error": form_error,
                "screenshot": screenshot_b64
            })

        except Exception as e:
            print(f"DEBUG: Exception at stage '{stage}' - {type(e).__name__}: {str(e)}")
            screenshot_b64 = await take_screenshot(page) if page else None
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass
            return json_res({
                "ok": False,
                "stage": stage,
                "error": f"[{type(e).__name__}] {str(e)}",
                "screenshot": screenshot_b64
            })

    # ── 정적 파일 서빙 ─────────────────────────────────────────────
    try:
        return await env.ASSETS.fetch(request)
    except Exception as e:
        return Response.new(f"Asset Error: {str(e)}", status=500)
