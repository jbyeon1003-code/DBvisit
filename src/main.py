from js import Response, fetch
import json

# 자동화에 사용할 고정 정보
INFO = {
    "VISITOR_NAME": "변정호",
    "VISITOR_BIRTH": "1990-08-12",
    "VISITOR_PHONE": "01038020065",
    "VISITOR_COMPANY": "ASML",
    "MANAGER_NAME": "채명주",
    "VISIT_AREA": "상우캠퍼스 어드민동",
    "VISIT_PURPOSE": "업무협의",
    "SITE_COMPANY": "상우 캠퍼스",
    "TARGET_URL": "https://ims.dbhitek.com"
}

async def on_fetch(request, env):
    url = request.url
    path = "/" + "/".join(url.split("/")[3:])

    # 1. 정적 파일 서빙 (메인 페이지)
    if path == "/" or path == "/index.html":
        try:
            # env.ASSETS (Cloudflare Pages/Assets binding)
            asset_res = await env.ASSETS.fetch(request)
            return asset_res
        except Exception as e:
            return Response.new(f"Error loading assets: {str(e)}", status=500)

    # 2. 자동화 실행 API
    if path == "/run" and request.method == "POST":
        try:
            body = await request.json()
            start_date = body.get("start")
            end_date = body.get("end")

            if not start_date or not end_date:
                return Response.json({"ok": False, "error": "날짜 정보가 없습니다."})

            # 브라우저 실행
            browser = await env.MY_BROWSER.launch()
            page = await browser.newPage()
            
            # 1. 메인 페이지 접속
            await page.goto(INFO["TARGET_URL"])
            await page.waitForTimeout(2000)

            # 2. 방문신청 버튼 클릭 (셀렉터 기반)
            # 사이트 구조에 맞춰 적절한 셀렉터나 텍스트 검색 필요
            # 여기서는 automate.py의 로직을 Puppeteer 방식으로 전환
            await page.evaluate("""
                async (info) => {
                    // 방문신청 버튼 찾기 및 클릭
                    const btns = Array.from(document.querySelectorAll('button, a'));
                    const applyBtn = btns.find(b => b.innerText.includes('방문신청'));
                    if (applyBtn) applyBtn.click();
                }
            """, INFO)
            await page.waitForTimeout(3000)

            # 3. 폼 입력 로직 (간소화된 예시)
            # Cloudflare Browser Rendering은 보안상 팝업 처리가 까다로울 수 있어, 
            # 가능한 메인 프레임에서 모든 입력을 시도합니다.
            
            # 실제 automate.py의 상세 로직(개인정보 동의, 날짜 입력 등)을 
            # page.evaluate 내의 JavaScript로 실행하는 것이 가장 안정적입니다.
            
            result = await page.evaluate(f"""
                async (info, start, end) => {{
                    try {{
                        // 개인정보 동의 (모든 체크박스 체크)
                        const cbs = document.querySelectorAll('input[type="checkbox"]');
                        cbs.forEach(cb => {{ if(!cb.checked) cb.click(); }});
                        
                        // 확인/다음 버튼 클릭
                        const nextBtn = Array.from(document.querySelectorAll('button, a')).find(b => 
                            ['확인', '동의', '다음'].some(t => b.innerText.includes(t))
                        );
                        if(nextBtn) nextBtn.click();
                        await new Promise(r => setTimeout(r, 2000));

                        // 폼 입력 (id/name 기반)
                        // 참고: 실제 사이트의 정확한 셀렉터를 확인해야 합니다.
                        // 여기서는 일반적인 필드 탐색 로직 적용
                        
                        const fill = (keywords, value) => {{
                            const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
                            const target = inputs.find(i => {{
                                const text = (i.id + i.name + i.placeholder).toLowerCase();
                                return keywords.some(k => text.includes(k.toLowerCase()));
                            }});
                            if(target) {{
                                if(target.tagName === 'SELECT') {{
                                    const opt = Array.from(target.options).find(o => o.text.includes(value));
                                    if(opt) target.value = opt.value;
                                }} else {{
                                    target.value = value;
                                }}
                                return true;
                            }}
                            return false;
                        }};

                        fill(['담당자', 'manager'], info.MANAGER_NAME);
                        fill(['지역', 'area'], info.VISIT_AREA);
                        fill(['목적', 'purpose'], info.VISIT_PURPOSE);
                        fill(['이름', 'name'], info.VISITOR_NAME);
                        fill(['생년월일', 'birth'], info.VISITOR_BIRTH);
                        fill(['연락처', 'phone'], info.VISITOR_PHONE);
                        fill(['회사', 'company'], info.VISITOR_COMPANY);
                        
                        // 마지막 신청 버튼 클릭 (실제 배포 시 주석 해제)
                        // const finalBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('신청'));
                        // if(finalBtn) finalBtn.click();

                        return {{ success: true }};
                    } catch (e) {{
                        return {{ success: false, error: e.message }};
                    }}
                }}
            """, INFO, start_date, end_date)

            await browser.close()
            return Response.json({"ok": result["success"], "error": result.get("error")})

        except Exception as e:
            return Response.json({"ok": False, "error": str(e)})

    return Response.new("Not Found", status=404)
