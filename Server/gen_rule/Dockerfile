# gen_rule/Dockerfile
# - src/main.py 를 실행하는 gen_rule 컨테이너용
# - requirements.txt 기반 설치
# - python -m src.main 형태로 실행 (패키지 import 안정화)

FROM python:3.11-slim

# (선택) sklearn/pandas 빌드 시 필요한 최소 시스템 패키지
# slim 환경에서 문제 생기면 아래 유지 권장
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 의존성 먼저 설치(레이어 캐시)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# 앱 코드 복사
COPY src /app/src

# 기본 출력 디렉토리(볼륨 마운트로 덮어써짐)
ENV RULE_OUTPUT_DIR=/rules

# 기본 실행 (docker-compose에서 command로 덮어쓸 수도 있음)
CMD ["python", "-u", "-m", "src.main"]

