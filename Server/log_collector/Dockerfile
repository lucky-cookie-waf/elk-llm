# Node.js LTS (Debian 기반: OpenSSL/Prisma 호환 안정)
FROM node:20-bookworm-slim

ENV NODE_ENV=production

# DB 클라이언트 / init / 개행 변환 / CA
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      postgresql-client dumb-init dos2unix ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/log_collector

# ------------------------------
# 1) 의존성 설치 (캐시 레이어)
# ------------------------------
COPY package*.json ./
# devDeps 포함 설치 (prisma CLI는 devDep에 있음)
RUN npm ci

# ------------------------------
# 2) Prisma Client 생성
#    - generate 는 DB 접속을 안 하지만 env 존재는 확인하므로
#      더미 DATABASE_URL 을 잠깐 넣어준다.
# ------------------------------
ARG PRISMA_DUMMY_DB_URL="postgresql://user:pass@localhost:5432/postgres?schema=public"
ENV DATABASE_URL=$PRISMA_DUMMY_DB_URL

COPY prisma ./prisma
RUN npx prisma -v && npx prisma generate --schema prisma/schema.prisma

# 이후 런타임에 compose의 .env.shared가 진짜 URL을 주입하므로 빈 값으로 되돌림(이미지에 비밀 안 남김)
ENV DATABASE_URL=""

# ------------------------------
# 3) 앱 소스 복사
# ------------------------------
COPY . .

# 엔트리포인트 권한/개행 정리
RUN dos2unix /app/log_collector/entrypoint.sh \
 && chmod +x /app/log_collector/entrypoint.sh

# ------------------------------
# 4) 이미지 슬림화
# ------------------------------
RUN npm prune --omit=dev
ENV NODE_ENV=production

# PID1 문제 방지
ENTRYPOINT ["/usr/bin/dumb-init","--"]

# 컨테이너 시작 커맨드
CMD ["/app/log_collector/entrypoint.sh"]
