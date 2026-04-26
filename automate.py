"""
DBHitek 방문 신청 자동화 스크립트
Usage: python automate.py --start 2025-05-01 --end 2025-05-01
"""

import asyncio
import argparse
import sys
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# ── 고정 정보 ──────────────────────────────────────────────────
VISITOR_NAME    = "변정호"
VISITOR_BIRTH   = "1990-08-12"
VISITOR_PHONE   = "01038020065"
VISITOR_COMPANY = "ASML"
MANAGER_NAME    = "채명주"
VISIT_AREA      = "상우캠퍼스 어드민동"
VISIT_PURPOSE   = "업무협의"
SITE_COMPANY    = "상우 캠퍼스"
TARGET_URL      = "https://ims.dbhitek.com"
# ─────────────────────────────────────────────────────────────

async def run(start_date: str, end_date: str):
    print(f"[INFO] 방문 신청 자동화 시작: {start_date} ~ {end_date}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=400)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        # ── 1. 메인 페이지 방문 ──────────────────────────────────
        print("[1/8] 메인 페이지 접속 중...")
        await page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(1500)

        # ── 2. 방문신청 버튼 클릭 ────────────────────────────────
        print("[2/8] 방문신청 버튼 클릭...")
        try:
            btn = page.get_by_role("button", name="방문신청")
            if await btn.count() == 0:
                btn = page.locator("a:has-text('방문신청'), button:has-text('방문신청'), [onclick*='visit'], .btn-visit, #btnVisit")
            await btn.first.click(timeout=10000)
        except Exception as e:
            print(f"  [WARN] 버튼 탐색 실패, 텍스트 검색 시도: {e}")
            await page.get_by_text("방문신청").first.click()
        await page.wait_for_timeout(2000)

        # ── 3. 팝업 처리 - 개인정보 필수 동의만 체크 ─────────────
        print("[3/8] 개인정보 동의 처리...")
        # 팝업이 새 창으로 열릴 경우
        try:
            popup = await ctx.wait_for_event("page", timeout=5000)
            await popup.wait_for_load_state()
            print("  [INFO] 팝업 창 감지됨")
            await _handle_privacy(popup)
            form_page = popup
        except PlaywrightTimeoutError:
            # 같은 페이지 내 모달인 경우
            print("  [INFO] 인라인 모달로 처리")
            await _handle_privacy(page)
            form_page = page

        await form_page.wait_for_timeout(1500)

        # ── 4. 회사(사업장) 선택: 상우 캠퍼스 ──────────────────
        print("[4/8] 회사 선택: 상우 캠퍼스...")
        await _select_option(form_page, SITE_COMPANY)
        await form_page.wait_for_timeout(1000)

        # ── 5. 방문 시작일 / 종료일 입력 ─────────────────────────
        print(f"[5/8] 방문 기간 입력: {start_date} ~ {end_date}")
        await _fill_date(form_page, "start", start_date)
        await _fill_date(form_page, "end",   end_date)
        await form_page.wait_for_timeout(800)

        # ── 6. 담당자 입력: 채명주 ────────────────────────────────
        print("[6/8] 담당자 입력: 채명주...")
        await _fill_field(form_page, ["담당자", "manager", "contact", "host"], MANAGER_NAME)
        await form_page.wait_for_timeout(800)

        # ── 7. 출입지역 입력 ─────────────────────────────────────
        print("[7/8] 출입지역 입력...")
        await _fill_field(form_page, ["출입지역", "area", "location", "zone"], VISIT_AREA)
        await form_page.wait_for_timeout(800)

        # ── 8. 방문목적 입력 ─────────────────────────────────────
        print("[8/8] 방문목적 입력: 업무협의...")
        await _fill_field(form_page, ["방문목적", "purpose", "reason"], VISIT_PURPOSE)
        await form_page.wait_for_timeout(800)

        # ── 9. 방문객 정보 입력 ─────────────────────────────────
        print("[+] 방문객 정보 입력...")
        await _fill_visitor(form_page)

        print("\n✅ 모든 항목 자동 입력 완료!")
        print("   신청 버튼은 직접 확인 후 눌러주세요.")
        input("\n   [Enter] 를 누르면 브라우저가 닫힙니다...")
        await browser.close()


# ── 헬퍼 함수들 ───────────────────────────────────────────────

async def _handle_privacy(page):
    """개인정보 동의 - 필수 항목만 체크"""
    await page.wait_for_timeout(1000)

    # 전체 동의 체크박스가 있으면 그냥 클릭, 없으면 필수만 개별 체크
    try:
        all_agree = page.locator(
            "input[type='checkbox']:near(:text('전체동의')), "
            "input[type='checkbox']:near(:text('전체 동의')), "
            "label:has-text('전체동의') input, "
            "label:has-text('전체 동의') input"
        ).first
        if await all_agree.is_visible(timeout=2000):
            await all_agree.check()
            print("  [INFO] 전체동의 체크")
            return
    except Exception:
        pass

    # 필수 항목만 체크
    checkboxes = page.locator("input[type='checkbox']")
    count = await checkboxes.count()
    for i in range(count):
        cb = checkboxes.nth(i)
        label_text = ""
        try:
            parent = await cb.evaluate("el => el.closest('label,tr,div')?.innerText || ''")
            label_text = parent.lower()
        except Exception:
            pass
        # 선택 항목은 건너뜀
        if any(k in label_text for k in ["선택", "optional", "마케팅"]):
            continue
        if any(k in label_text for k in ["필수", "required", "개인정보", "동의"]):
            try:
                await cb.check()
                print(f"  [CHECKED] {label_text[:40]}")
            except Exception:
                pass

    # 확인/다음 버튼 클릭
    try:
        confirm = page.locator(
            "button:has-text('확인'), button:has-text('동의'), "
            "button:has-text('다음'), button:has-text('Next'), "
            "a:has-text('확인'), a:has-text('동의')"
        ).first
        if await confirm.is_visible(timeout=2000):
            await confirm.click()
            print("  [INFO] 동의 확인 버튼 클릭")
    except Exception:
        pass


async def _select_option(page, text):
    """드롭다운에서 텍스트로 옵션 선택"""
    try:
        # select 태그
        selects = page.locator("select")
        count = await selects.count()
        for i in range(count):
            sel = selects.nth(i)
            options = await sel.locator("option").all_text_contents()
            if any(text in opt for opt in options):
                await sel.select_option(label=text)
                print(f"  [SELECT] '{text}' 선택 완료")
                return
    except Exception as e:
        print(f"  [WARN] select 선택 실패: {e}")

    # 클릭형 드롭다운
    try:
        trigger = page.locator(f"*:has-text('{text}')").first
        await trigger.click()
        await page.wait_for_timeout(500)
        option = page.locator(f"li:has-text('{text}'), option:has-text('{text}')").first
        await option.click()
    except Exception as e:
        print(f"  [WARN] 드롭다운 선택 실패: {e}")


async def _fill_date(page, which: str, date_str: str):
    """날짜 입력 (YYYY-MM-DD 형식)"""
    y, m, d = date_str.split("-")
    # 다양한 날짜 포맷
    formats = [date_str, f"{y}{m}{d}", f"{y}/{m}/{d}", f"{m}/{d}/{y}"]

    keywords = {
        "start": ["방문시작", "시작일", "start", "from", "visitStart", "입실"],
        "end":   ["방문종료", "종료일", "end",   "to",   "visitEnd",   "퇴실"],
    }[which]

    filled = False
    inputs = page.locator("input[type='date'], input[type='text'][placeholder*='날짜'], input[type='text'][placeholder*='date'], input[class*='date'], input[id*='date'], input[name*='date']")
    count = await inputs.count()

    for i in range(count):
        inp = inputs.nth(i)
        attrs = {}
        for attr in ["id", "name", "placeholder", "class"]:
            try:
                val = await inp.get_attribute(attr) or ""
                attrs[attr] = val.lower()
            except Exception:
                attrs[attr] = ""
        combined = " ".join(attrs.values())
        if any(k.lower() in combined for k in keywords):
            try:
                inp_type = await inp.get_attribute("type") or "text"
                if inp_type == "date":
                    await inp.fill(date_str)
                else:
                    await inp.triple_click()
                    await inp.fill(formats[0])
                print(f"  [DATE/{which}] '{date_str}' 입력 완료")
                filled = True
                break
            except Exception as e:
                print(f"  [WARN] 날짜 입력 실패: {e}")

    if not filled:
        # 순서 기반 폴백: start=첫번째, end=두번째 날짜 필드
        idx = 0 if which == "start" else 1
        all_dates = page.locator("input[type='date'], input[placeholder*='년'], input[placeholder*='YYYY']")
        total = await all_dates.count()
        if total > idx:
            inp = all_dates.nth(idx)
            inp_type = await inp.get_attribute("type") or "text"
            if inp_type == "date":
                await inp.fill(date_str)
            else:
                await inp.triple_click()
                await inp.fill(formats[0])
            print(f"  [DATE/{which}] 폴백으로 입력: '{date_str}'")


async def _fill_field(page, keywords: list, value: str):
    """키워드로 인풋 찾아서 값 입력"""
    inputs = page.locator("input[type='text'], input[type='search'], textarea, select")
    count = await inputs.count()

    for i in range(count):
        inp = inputs.nth(i)
        combined = ""
        for attr in ["id", "name", "placeholder", "class"]:
            try:
                val = await inp.get_attribute(attr) or ""
                combined += val.lower() + " "
            except Exception:
                pass
        # 주변 라벨 텍스트도 확인
        try:
            label_text = await inp.evaluate(
                "el => { const lbl = document.querySelector(`label[for='${el.id}']`); return lbl ? lbl.innerText : el.closest('tr,div,td')?.innerText || ''; }"
            )
            combined += label_text.lower()
        except Exception:
            pass

        if any(k.lower() in combined for k in keywords):
            tag = await inp.evaluate("el => el.tagName.toLowerCase()")
            if tag == "select":
                await inp.select_option(label=value)
            else:
                await inp.triple_click()
                await inp.type(value, delay=50)
            print(f"  [FIELD] '{keywords[0]}' → '{value}' 입력 완료")
            return

    print(f"  [WARN] '{keywords[0]}' 필드를 찾지 못했습니다.")


async def _fill_visitor(page):
    """방문객 정보 입력"""
    # 방문객 추가 버튼이 있으면 클릭
    try:
        add_btn = page.locator(
            "button:has-text('추가'), button:has-text('+'), a:has-text('방문객 추가')"
        ).first
        if await add_btn.is_visible(timeout=2000):
            await add_btn.click()
            await page.wait_for_timeout(800)
            print("  [INFO] 방문객 추가 버튼 클릭")
    except Exception:
        pass

    await _fill_field(page, ["방문자명", "visitorName", "성명", "이름", "name"], VISITOR_NAME)
    await _fill_field(page, ["생년월일", "birth", "birthday", "dob"],             VISITOR_BIRTH)
    await _fill_field(page, ["연락처", "휴대폰", "phone", "mobile", "tel"],       VISITOR_PHONE)
    await _fill_field(page, ["소속", "회사명", "company", "organization"],         VISITOR_COMPANY)


def main():
    parser = argparse.ArgumentParser(description="DBHitek 방문신청 자동화")
    parser.add_argument("--start", required=True, help="방문 시작일 (YYYY-MM-DD)")
    parser.add_argument("--end",   required=True, help="방문 종료일 (YYYY-MM-DD)")
    args = parser.parse_args()
    asyncio.run(run(args.start, args.end))


if __name__ == "__main__":
    main()
