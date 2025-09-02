FROM node:18-alpine

WORKDIR /app

# 패키지 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm install --omit=dev

# 소스 코드 복사
COPY . .

# 포트 노출
EXPOSE 3002

# 사용자 생성 (보안)
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# 서비스 실행
CMD ["npm", "start"]