# Node.js 공식 이미지(슬림)
FROM node:18-slim

ENV NODE_ENV=production

# DB 대기/신호처리/줄바꿈 변환 유틸
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client dumb-init dos2unix ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 작업 디렉터리
WORKDIR /app/log_collector

# 의존성 먼저 설치(레이어 캐시 활용)
COPY package*.json ./
# 프로덕션 의존성만
RUN npm ci --omit=dev

# Prisma 스키마가 있다면 미리 복사 후 generate (postinstall이 이미 하면 생략 가능)
COPY prisma ./prisma
RUN npx prisma generate || true

# 앱 소스 복사
COPY . .

# 엔트리포인트 권한/줄바꿈 정리
RUN dos2unix /app/log_collector/entrypoint.sh \
 && chmod +x /app/log_collector/entrypoint.sh

# (선택) 권한 격하
# USER node

# PID1 문제 방지
ENTRYPOINT ["/usr/bin/dumb-init","--"]

# 컨테이너 시작 커맨드
CMD ["/app/log_collector/entrypoint.sh"]