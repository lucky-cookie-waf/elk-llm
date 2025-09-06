# BE_rules/Dockerfile
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# 기본 CA만 있으면 충분 (openssl은 base에 포함)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*

# 1) 의존성 설치 (캐시 레이어)
COPY package.json package-lock.json ./
RUN npm ci

# 2) Prisma Client 생성
#    - generate는 스키마 파싱 시 env 존재만 확인하므로 더미 URL을 잠시 주입
#    - 실제 접속은 런타임에 .env.shared로 이뤄짐
ARG PRISMA_DUMMY_DB_URL="postgresql://user:pass@localhost:5432/postgres?schema=public"
ENV DATABASE_URL=$PRISMA_DUMMY_DB_URL
COPY prisma ./prisma
RUN npx prisma -v && npx prisma generate --schema prisma/schema.prisma
# 비밀/더미 흔적 제거
ENV DATABASE_URL=""

# 3) 앱 소스
COPY . .

# 4) 이미지 슬림화
RUN npm prune --omit=dev

# PID1 좀비 방지
ENTRYPOINT ["/usr/bin/dumb-init","--"]

EXPOSE 3001
CMD ["node","server.js"]
