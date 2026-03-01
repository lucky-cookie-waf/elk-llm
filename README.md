
https://github.com/user-attachments/assets/fd711923-41ab-445d-85a3-f33a99e61640


https://github.com/user-attachments/assets/21e4d57d-7597-4f11-ad1e-c92a9378d783



## 실행 방법

**서버(백엔드)**  
- `cd Server`
- 한 번 빌드/실행: `docker compose up -d --build`  
  (이미지 최신화 필요 없으면 `docker compose up -d`만)
- 상태 확인: `docker compose ps`
- 종료: `docker compose down` (볼륨 유지), 완전 초기화 `docker compose down -v`

**클라이언트(프론트)**  
- `cd Client`
- 최초 의존성 설치: `npm install`
- 개발 서버: `npm start`  (기본 http://localhost:3000)

필수 전제  
- Docker Desktop + WSL 통합 켜짐  
- 포트 8080(모의 웹앱), 3001(API), 3002(모델), 3000(프론트) 사용 가능해야 함.

순서대로 서버 먼저 올리고, 헬스 체크 후 클라이언트 띄우면 실행됨.


## 오류
- 낡은 이미지/캐시:
      코드 바꿨는데 docker compose up -d만 해서 오래된 이미지로 뜨면, 이번처럼 모듈 누락·의존성 불일치가 납니다. 해결: 필요한 서비스만 docker compose build <svc> 후 up -d.
- 마운트/경로 누락:
      Dockerfile에서 소스 COPY 경로나 볼륨이 잘못돼 새 파일이 이미지에 안 들어가면 런타임에 MODULE_NOT_FOUND/ENOENT 터집니다. 변경한 폴더가 COPY 대상인지 확인.
- 환경변수 불일치:
      .env.shared나 서비스별 .env 값이 최신이 아니면 DB/HF 엔드포인트 연결 실패로 헬스체크가 계속 실패할 수 있습니다. 변경 후 up -d 재시작 필요.
- 포트 충돌:
      3001/3002/8080 등을 다른 프로세스가 사용하면 서비스가 곧바로 종료되거나 502/ECONNREFUSED가 납니다. netstat -ano(Windows)로 점검.
- DB 스키마 미반영:
      Prisma 스키마 업데이트 후 prisma generate/db push 없이 컨테이너만 올리면 쿼리 에러가 납니다. 스키마 바꿨으면 docker compose run --rm prisma-runner npx prisma db push.
- WSL/네트워크 문제:
      WSL 통합이 꺼지거나 VPN/회사 방화벽이 Supabase/HF 등 외부 주소를 막으면 서비스 헬스가 계속 떨어집니다. WSL 상태(wsl --status)와 네트워크 허용 여부 확인.


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
