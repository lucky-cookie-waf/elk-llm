# run.py
from helloSecurity import create_app

app = create_app()

if __name__ == "__main__":
    # 개발 단계에서는 debug=True 로 자동 재시작 활성화
    app.run(debug=True, host="0.0.0.0", port=5000)