# Node.js 기반 공식 이미지 사용
FROM node:18

# 작업 디렉토리 설정
WORKDIR /app/log_collector

# 의존성 먼저 복사 및 설치
COPY package*.json ./
RUN npm install

# 전체 소스 복사
COPY . .

# Prisma schema 적용 (필요시)
RUN chmod +x entrypoint.sh

# 컨테이너 시작 시 실행할 기본 명령
CMD ["./entrypoint.sh"]
