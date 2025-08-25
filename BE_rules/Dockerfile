FROM node:20-alpine
WORKDIR /app

# 1) deps
COPY package*.json ./
RUN npm ci

# 2) prisma 스키마 복사 + 클라이언트 생성
COPY prisma ./prisma
RUN npx prisma generate

# 3) 앱 소스
COPY . .

EXPOSE 3001
CMD ["node", "server.js"]