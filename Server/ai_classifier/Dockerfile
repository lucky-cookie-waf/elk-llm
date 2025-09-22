FROM node:18-slim

WORKDIR /app

# Python과 필요한 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python 가상환경 생성 및 의존성 설치
COPY requirements.txt ./
RUN python3 -m venv /app/venv
RUN /app/venv/bin/pip install --no-cache-dir -r requirements.txt

# 허깅페이스 토큰 환경변수 (빌드 시 설정 또는 런타임에 설정)
# ENV HUGGINGFACE_TOKEN=your_token_here

# Python 추론 스크립트 복사 (모델 폴더는 제거)
COPY model_inference.py ./

# Node.js 패키지 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm install --omit=dev

# 소스 코드 복사
COPY . .

# 포트 노출
EXPOSE 3002

# 사용자 생성 및 권한 설정
RUN groupadd -g 1001 nodejs
RUN useradd -r -u 1001 -g nodejs nodejs

# 앱 디렉터리 권한 설정
RUN chown -R nodejs:nodejs /app

USER nodejs

# 서비스 실행
CMD ["npm", "start"]