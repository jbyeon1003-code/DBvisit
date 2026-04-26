"""
DBHitek 방문신청 자동화 - 로컬 서버
실행: python app.py
브라우저에서 http://localhost:5050 접속
"""

from flask import Flask, request, jsonify, render_template
import subprocess
import sys
import os

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/run", methods=["POST"])
def run_automation():
    data = request.get_json()
    start = data.get("start", "")
    end   = data.get("end",   "")

    if not start or not end:
        return jsonify({"ok": False, "error": "날짜가 없습니다."})

    script_path = os.path.join(os.path.dirname(__file__), "automate.py")

    try:
        # 별도 프로세스로 비동기 실행 (브라우저가 백그라운드에서 열림)
        subprocess.Popen(
            [sys.executable, script_path, "--start", start, "--end", end],
            creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == "win32" else 0
        )
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


if __name__ == "__main__":
    print("=" * 50)
    print("  DBHitek 방문신청 자동화 서버")
    print("  브라우저에서 http://localhost:5050 접속")
    print("=" * 50)
    app.run(host="127.0.0.1", port=5050, debug=False)
