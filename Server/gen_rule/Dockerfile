# Python 베이스
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# psycopg2 빌드/실행에 필요한 라이브러리
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev gcc postgresql-client \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/gen_rule

# 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 소스 복사
COPY . .

# 기본 실행 (compose에 command가 있으면 이 CMD는 무시됩니다)
CMD ["python", "-u", "main.py"]
