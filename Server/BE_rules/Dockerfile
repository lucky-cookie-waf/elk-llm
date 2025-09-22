FROM node:20-bookworm-slim

ENV NODE_ENV=production
# ★ 루트 컨텍스트를 쓰므로 앱 작업 폴더를 BE_rules로
WORKDIR /app/BE_rules

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*

# 1) 공유 스키마 먼저 복사(경로는 루트 기준!)
COPY log_collector/prisma /app/log_collector/prisma

# 2) 의존성 설치 (postinstall 스킵, 나중에 수동 generate)
COPY BE_rules/package.json BE_rules/package-lock.json ./
ARG PRISMA_DUMMY_DB_URL="postgresql://user:pass@localhost:5432/postgres?schema=public"
ENV DATABASE_URL=$PRISMA_DUMMY_DB_URL
RUN npm ci --ignore-scripts

# 3) Prisma Client 생성 (공유 스키마로)
RUN npx prisma -v && npx prisma generate --schema /app/log_collector/prisma/schema.prisma
ENV DATABASE_URL=""

# 4) 앱 소스
COPY BE_rules/ ./

# 5) 슬림화
RUN npm prune --omit=dev

ENTRYPOINT ["/usr/bin/dumb-init","--"]
EXPOSE 3001
CMD ["node","server.js"]
