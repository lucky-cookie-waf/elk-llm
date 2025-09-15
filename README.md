1. 사이드 바 크기(넓이 조정, 디자인 조정)
2. 로그 리스트 표시 항목 수정, 정렬 조정, URI, user agent 더보기 기능
3. 로그리스트 order 모달 크기, 정렬 수정
4. 룰셋 관리 테이블 정렬, 항목 수정
5. 로그인, 로그아웃 페이지 생성
6. 전체적인 디자인 통일

Client
1. npm install로 node_modules 생성
2. npm start

## ModSecurity + PostgreSQL + 세션화
이 프로젝트는 ModSecurity 로그를 수집하여 PostgreSQL 데이터베이스에 저장하고, 저장된 로그들을 세션 단위로 그룹화(sessionizing) 하는 Node.js 기반 시스템입니다.
Prisma ORM을 통해 DB 스키마를 정의하고, Docker Compose로 PostgreSQL과 함께 구동합니다.

## 주요 구성 요소
PostgreSQL

로그와 세션 데이터를 저장하는 데이터베이스

log_collector (Node.js)

parser.js: ModSecurity 로그 파일을 읽어 RawLog 테이블에 저장

sessionizing.js: 저장된 로그를 세션 단위로 묶고, Session 테이블에 저장 후 RawLog와 매핑

Prisma ORM

DB 스키마 정의 및 마이그레이션 관리

## 실행 방법
1. 레포지토리 클론

git clone https://github.com/your-org/elk-llm.git
cd elk-llm
2. 환경변수 설정

cp log_collector/.env.example log_collector/.env
.env 파일 예시:


DATABASE_URL=
3. Docker 컨테이너 실행

docker-compose up -d
이 명령어는 다음 컨테이너를 실행합니다:

PostgreSQL DB

Node.js 기반 log_collector

4. Prisma 설정

# log_collector 컨테이너 접속
docker-compose exec log_collector sh

# Prisma 스키마 DB 반영 및 클라이언트 생성
npx prisma db push
npx prisma generate

## 로그 수집 & 세션화
1. 로그 파서 실행 (parser.js)

docker-compose exec log_collector sh
node parser.js
/var/log/apache2/modsec_audit.log에서 ModSecurity 로그를 읽어 RawLog 테이블에 저장

2. 세션화 실행 (sessionizing.js)

docker-compose exec log_collector sh
node sessionizing.js
RawLog 테이블에서 미처리 로그를 읽어 세션 단위로 묶음

Session 테이블에 저장하고, 각 로그(RawLog)에 sessionId를 매핑

중복 세션 생성 방지: 이미 세션화된 로그는 건너뜀

## 데이터 조회 (예시)
1. 전체 세션 수 확인

SELECT COUNT(*) FROM "Session";
2. 특정 세션 정보 확인

SELECT * FROM "Session" WHERE id = 1;
3. 특정 세션에 포함된 로그 조회


SELECT * FROM "RawLog" WHERE "sessionId" = 1;
테스트 방법
ModSecurity가 작동하는 웹서버에 요청을 보내 로그 생성:


curl "http://localhost:8080/?test=../../etc/passwd"
→ 로그 파일 기록 → parser.js로 DB 저장 → sessionizing.js 실행 시 세션화
