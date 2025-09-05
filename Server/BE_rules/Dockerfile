FROM node:20-bookworm-slim
WORKDIR /app
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1

# OpenSSL 3 준비
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 패키지/스키마 먼저 복사
COPY package*.json package-lock.json ./
COPY prisma ./prisma

# 의존성 설치
RUN npm ci

# 컨테이너 내부에서 Prisma Client 생성(리눅스용 엔진 포함)
RUN rm -rf node_modules/.prisma && npx prisma generate

# 앱 소스
COPY . .
EXPOSE 3001
CMD ["node","server.js"]