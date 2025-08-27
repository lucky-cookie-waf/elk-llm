#!/bin/sh
set -eu  # pipefail 제거, 오류(-e)와 미정의 변수 사용(-u)만 체크

echo "[log_collector] starting..."

# ===== DB 준비 대기 (환경변수 기본값 허용) =====
PGHOST="${POSTGRES_HOST:-postgres}"
PGPORT="${POSTGRES_PORT:-5432}"
PGUSER="${POSTGRES_USER:-postgres}"

if command -v pg_isready >/dev/null 2>&1; then
  echo "[log_collector] waiting for postgres at ${PGHOST}:${PGPORT} ..."
  i=0
  while ! pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; do
    i=$((i+1))
    if [ "$i" -ge 60 ]; then
      echo "[log_collector] pg_isready timeout, continue anyway"
      break
    fi
    sleep 1
  done
else
  echo "[log_collector] pg_isready not found, skipping DB wait."
fi

# ===== Prisma 마이그레이션 (DB 준비 후 1회) =====
if command -v npx >/dev/null 2>&1; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[migrate] ERROR: DATABASE_URL is not set. Aborting."
    exit 1
  fi
  echo "[migrate] applying Prisma migrations..."
  npx -y prisma migrate deploy
  echo "[migrate] done."
else
  echo "[migrate] npx not found, skipping prisma migrate deploy."
fi

# ===== 종료 시 자식 정리 =====
trap 'echo "[log_collector] stopping..."; kill 0 2>/dev/null || true; exit 0' TERM INT

# ===== 파서 루프 (RawLog 적재) =====
parser_loop() {
  echo "[parser] loop start"
  while true; do
    node /app/log_collector/parser.js || echo "[parser] exited ($?)"
    sleep 5
  done
}

# ===== 세션화 루프 (Sessionize) =====
session_loop() {
  echo "[sessionizing] loop start"
  while true; do
    node /app/log_collector/sessionizing.js || echo "[sessionizing] exited ($?)"
    sleep 30
  done
}

# 하나는 백그라운드, 하나는 포그라운드로 실행
parser_loop &
session_loop

# 모든 잡이 끝날 때까지 대기
wait
