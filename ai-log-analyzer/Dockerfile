FROM python:3.9-slim-buster

WORKDIR /app

# 애플리케이션 의존성 설치
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY app.py ./

# Flask 앱의 기본 포트 노출
EXPOSE 5000

# Flask 앱 실행 명령어
CMD ["python", "app.py"]