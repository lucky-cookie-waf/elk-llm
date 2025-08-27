# Node.js LTS (Debian 기반: OpenSSL/Prisma 호환 안정)
FROM node:20-bookworm-slim

ENV NODE_ENV=production

# DB 클라이언트 / init / 개행 변환 / CA
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client dumb-init dos2unix ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/log_collector

# 의존성 먼저 설치(캐시 레이어)
COPY package*.json ./
# 프로덕션 의존성만 설치 (axios는 반드시 dependencies에 있어야 함!)
# RUN npm ci --omit=dev
## generate 위해 devDeps도 설치(여기에 prisma CLI가 있음)
RUN npm ci

# Prisma 스키마 복사 후 generate (로컬에 prisma CLI가 devDep여도 npx로 실행)
COPY prisma ./prisma
# RUN npx -y prisma generate || true
RUN npx prisma -v && npx prisma generate

# 앱 소스 복사
COPY . .

# 엔트리포인트 권한/개행 정리
RUN dos2unix /app/log_collector/entrypoint.sh \
 && chmod +x /app/log_collector/entrypoint.sh

## 이미지 슬림화: devDeps 제거 후 prod 모드
RUN npm prune --omit=dev
ENV NODE_ENV=production

# PID1 문제 방지
ENTRYPOINT ["/usr/bin/dumb-init","--"]

# 컨테이너 시작 커맨드
CMD ["/app/log_collector/entrypoint.sh"]
