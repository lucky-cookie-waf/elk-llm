# Modsecurity+PostgreSQL
ModSecurity 로그를 수집하고 PostgreSQL에 저장하는 Node.js 기반의 Log Collector입니다.
Prisma ORM을 통해 DB 스키마를 정의하고, Docker Compose로 PostgreSQL과 함께 구동합니다.

# 실행 방법
1. 레포 클론

git clone https://github.com/your-org/elk-llm.git
cd elk-llm

2. .env 파일 설정
.env.example을 복사해 .env를 만드세요.

cp log_collector/.env.example log_collector/.env
내용 예시:
DATABASE_URL="postgresql://luckycookie:luckycookie@postgres:5432/modsec_logs"

3. Docker 컨테이너 실행

docker-compose up -d
이 명령어는 다음을 실행합니다:

PostgreSQL DB 컨테이너

Node.js 기반 log_collector 컨테이너

4. Prisma 설정
컨테이너 내부에 Prisma를 적용하려면 아래 명령어를 실행합니다:

# log_collector 컨테이너 안으로 진입
docker-compose exec log_collector sh

# 컨테이너 안에서 아래 실행
npx prisma db push
npx prisma generate
5. 로그 파서 실행
컨테이너 내부에서 로그 파서를 수동 실행:

node parser.js
또는 CMD에 포함되어 자동 실행되도록 설정해도 됩니다.

- 테스트용 로그 생성
웹 브라우저 또는 curl로 요청을 보내면
ModSecurity가 /var/log/apache2/modsec_audit.log에 기록하고
parser.js가 이를 DB에 저장합니다.

curl "http://localhost:8080/?test=../../etc/passwd"
