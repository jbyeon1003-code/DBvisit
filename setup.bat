@echo off
echo ====================================
echo  DBHitek 방문신청 자동화 - 초기 설치
echo ====================================
echo.
echo [1/2] 패키지 설치 중...
pip install flask playwright
echo.
echo [2/2] Playwright 브라우저 설치 중...
playwright install chromium
echo.
echo ====================================
echo  설치 완료! start.bat 를 실행하세요.
echo ====================================
pause
