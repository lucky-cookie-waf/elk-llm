# (필요시 더 안정적인 베이스를 원하면 아래 주석을 풀고 bookworm로 변경)
# FROM python:3.11-bookworm
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    gfortran \
    liblapack-dev \
    libopenblas-dev \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# arm64 환경에서 빌드 최소화를 위해 바이너리 휠 우선
RUN pip install --upgrade pip && pip install --prefer-binary -r requirements.txt

COPY . .

CMD ["gunicorn", "--workers", "4", "--bind", "0.0.0.0:5000", "run:app"]
