# ai_classifier/Dockerfile
FROM python:3.10-slim

# 작업 디렉토리
WORKDIR /app

# 필요한 패키지 설치
# requirements.txt 안에는 최소한 아래가 있어야 함:
# fastapi, uvicorn, requests, pydantic
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 앱 코드 복사
COPY model_inference.py server.py ./

# 환경 변수
ENV PYTHONUNBUFFERED=1 \
    PORT=3002

# FastAPI 포트
EXPOSE 3002

# 서버 실행
CMD ["python", "server.py"]
