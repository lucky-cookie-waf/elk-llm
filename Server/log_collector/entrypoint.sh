#!/usr/bin/env sh
set -eu

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

log "[log_collector] starting..."

# IPv4 우선 (DNS가 IPv6 먼저 줄 때 접속 오류 예방)
if [ -z "${NODE_OPTIONS:-}" ]; then
  export NODE_OPTIONS="--dns-result-order=ipv4first"
else
  case "$NODE_OPTIONS" in
    *"--dns-result-order="*) : ;;
    *) export NODE_OPTIONS="$NODE_OPTIONS --dns-result-order=ipv4first" ;;
  esac
fi

# 필수 환경 확인 (Pooler 6543 URL이어야 함)
if [ -z "${DATABASE_URL:-}" ]; then
  log "[fatal] DATABASE_URL is not set. Make sure .env.shared is loaded."
  exit 1
fi
case "$DATABASE_URL" in
  *db.*.supabase.co:5432* )
    log "[warn] DATABASE_URL이 Direct(5432)로 보입니다. 런타임은 Pooler(6543) URL을 권장합니다."
  ;;
esac

# ===== (옵션) Prisma 마이그레이션 =====
# 기본적으로 실행하지 않음. 필요 시 MIGRATE_ON_START=1 로 켜기
if [ "${MIGRATE_ON_START:-0}" = "1" ]; then
  if command -v npx >/dev/null 2>&1; then
    SCHEMA_PATH="${PRISMA_SCHEMA_PATH:-prisma/schema.prisma}"
    log "[migrate] prisma migrate deploy (schema: $SCHEMA_PATH)"
    npx -y prisma migrate deploy --schema "$SCHEMA_PATH"
    log "[migrate] done."
  else
    log "[migrate] npx not found, skipping migrate."
  fi
else
  log "[migrate] skipped (MIGRATE_ON_START!=1)"
fi

# 정상 종료시 자식 프로세스 정리
trap 'log "[log_collector] stopping..."; kill 0 2>/dev/null || true; exit 0' TERM INT

# ===== 파서 루프 (RawLog 적재) =====
parser_loop() {
  log "[parser] loop start"
  while true; do
    node /app/log_collector/parser.js || log "[parser] exited ($?)"
    sleep 5
  done
}

# ===== 세션화 루프 (Sessionize) =====
session_loop() {
  log "[sessionizing] loop start"
  while true; do
    node /app/log_collector/sessionizing.js || log "[sessionizing] exited ($?)"
    sleep 30
  done
}

# 하나는 백그라운드, 하나는 포그라운드로 실행
parser_loop &
session_loop

# 모든 잡이 끝날 때까지 대기
wait
