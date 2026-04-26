@echo off
echo ====================================
echo  DBHitek 방문신청 자동화 서버 시작
echo ====================================
echo.
echo  브라우저에서 http://localhost:5050 을 열어주세요
echo.
start "" "http://localhost:5050"
python app.py
pause
