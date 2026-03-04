# ELK-LLM

ModSecurity에서 수집한 HTTP 요청 로그를 저장하고, AI 기반 분류를 통해 세션 라벨을 부여한 뒤, 악성 세션을 바탕으로 ModSecurity WAF 룰을 생성하는 시스템입니다.

현재 `main` 브랜치 기준으로 서버 구성은 다음 흐름으로 동작합니다.

1. `modsec-proxy`가 요청을 처리하고 ModSecurity audit log를 남깁니다.
2. `log_collector`가 audit log를 읽어 `RawLog`에 적재합니다.
3. `sessionizing.js`가 미분류 로그를 `ai_classifier`에 보내 세션 라벨을 생성합니다.
4. 분류 결과는 `Session` 테이블에 저장됩니다.
5. `gen_rule`이 라벨링된 공격 세션을 읽어 ModSecurity `SecRule`을 생성합니다.

## Demo

https://github.com/user-attachments/assets/fd711923-41ab-445d-85a3-f33a99e61640

https://github.com/user-attachments/assets/21e4d57d-7597-4f11-ad1e-c92a9378d783

https://github.com/user-attachments/assets/d236cf9e-f251-4561-beb1-e1ea30ac8866

## Architecture

```text
Client / External Request
        |
        v
  modsec-proxy (Apache + ModSecurity)
        |
        v
   modsec_logs (audit log files)
        |
        v
 log_collector
   - parser.js        -> RawLog
   - sessionizing.js  -> ai_classifier -> Session
        |
        v
    PostgreSQL
        |
        v
    gen_rule
   - labeled attack session 조회
   - LLM 기반 SecRule 생성
   - generated_rules 저장
   - /rules/REQUEST-999-AUTO.conf export
```

## Services

| Service | Role | Port | Notes |
|---|---|---:|---|
| `modsec-proxy` | ModSecurity 프록시 및 audit log 생성 | `8080` | Apache/ModSecurity |
| `flask-app` | 백엔드 대상 애플리케이션 | 내부통신 | `modsec-proxy` 뒤에서 동작 |
| `be_rules` | 별도 Node.js API 서비스 | `3001` | 프로젝트 내 규칙 관리용 |
| `log_collector` | 로그 파싱 및 세션 분류 루프 실행 | 내부통신 | `parser.js` + `sessionizing.js` 자동 루프 |
| `ai_classifier` | Hugging Face Endpoint 기반 공격 분류 | `3002` | FastAPI |
| `gen_rule` | 공격 세션 기반 WAF 룰 생성 배치 | 없음 | 필요 시 수동 실행 |
| `postgres` | 로컬 PostgreSQL | `5432` | `localdb` profile 사용 시만 실행 |
| `prisma-runner` | Prisma Studio 도구 컨테이너 | `5555` | `tools` profile 전용 |

## Directory Overview

```text
Server/
  ai_classifier/    # FastAPI 기반 분류 서비스
  BE_rules/         # Node.js API
  flask_app/        # 대상 애플리케이션
  gen_rule/         # LLM 기반 ModSecurity 룰 생성
  log_collector/    # ModSecurity 로그 파싱 및 세션화
  modsec-proxy/     # Apache + ModSecurity
  docker-compose.yml
```

## Prerequisites

- Docker Desktop
- Docker Compose
- 사용 가능한 포트
  - `8080`
  - `3001`
  - `3002`
  - `5432` (로컬 DB 사용 시)
  - `5555` (Prisma Studio 사용 시)
- 외부 API/LLM 키
  - Hugging Face Inference Endpoint
  - Anthropic API Key

## 실행 방법

**서버(백엔드)**
- `cd Server`
- 한 번 빌드/실행: `docker compose up -d --build`
  - 이미지 최신화 필요 없으면 `docker compose up -d`
- 상태 확인: `docker compose ps`
- 종료: `docker compose down`
  - 볼륨 유지
- 완전 초기화: `docker compose down -v`

**클라이언트(프론트)**
- `cd Client`
- 최초 의존성 설치: `npm install`
- 개발 서버: `npm start`
  - 기본 주소는 `http://localhost:3000`

필수 전제
- Docker Desktop + WSL 통합이 켜져 있어야 합니다.
- `8080`, `3001`, `3002`, `3000` 포트를 사용할 수 있어야 합니다.
- 서버를 먼저 올리고 헬스 체크 후 클라이언트를 실행하는 순서를 권장합니다.

## Environment Variables

`main` 브랜치 기준으로 각 서비스는 아래 환경변수를 사용합니다.

### 1. `Server/.env.shared`

공통 DB 연결 정보를 정의합니다. `log_collector` 등에서 사용합니다.

```env
DATABASE_URL=postgresql://username:password@host:port/dbname?schema=public
```

로컬 PostgreSQL을 `docker compose --profile localdb`로 사용할 경우 예시는 다음과 같습니다.

```env
DATABASE_URL=postgresql://luckycookie:luckycookie@postgres:5432/modsec_logs?schema=public
```

### 2. `Server/log_collector/.env`

`log_collector` 전용 설정입니다.

```env
BATCH_SIZE=1000
CLASSIFIER_ENDPOINT=http://ai_classifier:3002/api/classify
CLASSIFIER_TIMEOUT_MS=120000
DEBUG_CLASSIFIER=0
MAX_BODY_CHARS=300
MAX_UA_CHARS=120
MIGRATE_ON_START=0
```

### 3. `Server/ai_classifier/.env`

`ai_classifier`는 로컬 모델이 아니라 Hugging Face Inference Endpoint를 호출합니다.

```env
HF_ENDPOINT_URL=https://your-hf-inference-endpoint
HF_API_KEY=your_hf_api_key
```

### 4. `Server/gen_rule/.env`

`gen_rule`은 Anthropic 기반으로 ModSecurity `SecRule`을 생성합니다.

```env
DATABASE_URL=postgresql://username:password@host:port/dbname?schema=public
ANTHROPIC_API_KEY=your_anthropic_api_key

GEN_RULE_MODEL=claude-sonnet-4-6
GEN_RULE_TEMPERATURE=0.1
GEN_RULE_MAX_EXAMPLES=12
GEN_RULE_MAX_BODY_CHARS=1500

BATCH_SIZE=5000
WINDOW_HOURS=24
MAX_WINDOWS_PER_RUN=1

BASE_RULE_ID=200000
N_CLUSTERS=10
INCLUDE_BODY_IN_REPR=0

RULE_OUTPUT_DIR=/rules
```

### 5. 필요 시 서비스별 추가 `.env`

아래 서비스는 별도 `.env`를 참조합니다.

- `Server/BE_rules/.env`
- `Server/flask_app/.env`

프로젝트 운영 환경에 맞게 별도로 작성해야 합니다.

## Run

### 1. 저장소 클론

```bash
git clone <REPOSITORY_URL>
cd elk-llm/Server
```

### 2. 환경변수 파일 준비

최소한 아래 파일들은 준비되어 있어야 합니다.

- `.env.shared`
- `log_collector/.env`
- `ai_classifier/.env`
- `gen_rule/.env`

### 3. 로컬 PostgreSQL까지 함께 실행하는 경우

```bash
docker compose --profile localdb up -d --build
```

### 4. 외부 PostgreSQL을 사용하는 경우

```bash
docker compose up -d --build
```

### 5. 상태 확인

```bash
docker compose ps
```

### 6. 종료

```bash
docker compose down
```

볼륨까지 제거하려면:

```bash
docker compose down -v
```

## Operational Flow

### `log_collector`

`log_collector` 컨테이너는 시작 후 두 루프를 자동으로 실행합니다.

- `parser.js`
  - ModSecurity audit log를 읽어서 `RawLog`에 적재
- `sessionizing.js`
  - 아직 `sessionId`가 없는 `RawLog`를 가져와 `ai_classifier`로 분류 요청
  - 분류 결과를 기반으로 `Session` 생성 및 `RawLog.sessionId` 연결

즉, 기본 운영에서는 `parser.js`와 `sessionizing.js`를 매번 수동 실행할 필요가 없습니다.

### `ai_classifier`

`ai_classifier`는 FastAPI 서버이며 `/api/classify` 엔드포인트를 제공합니다.

입력 예시:

```json
{
  "session": [
    {
      "request_http_method": "GET",
      "request_http_request": "/?id=1",
      "request_body": "",
      "user_agent": "curl/8.0"
    }
  ]
}
```

출력 예시:

```json
{
  "classification": "SQL Injection",
  "confidence": "high",
  "raw_response": "SQL Injection"
}
```

분류 결과는 `sessionizing.js`에서 내부 enum으로 매핑됩니다.

- `NORMAL`
- `SQL_INJECTION`
- `CODE_INJECTION`
- `PATH_TRAVERSAL`
- `MALICIOUS`

### `gen_rule`

`gen_rule`은 상시 실행 서비스가 아니라 배치성 작업입니다.

라벨링된 공격 세션을 읽어 LLM에 전달하고, ModSecurity `SecRule`을 생성한 뒤 다음 위치에 저장합니다.

- DB: `generated_rules`
- 파일: `rules_out/REQUEST-999-AUTO.conf`

수동 실행 예시:

```bash
docker compose run --rm gen_rule
```

## Health Check

### `ai_classifier`

```bash
curl http://localhost:3002/health
curl http://localhost:3002/ready
```

정상 응답 예시:

```json
{"status":"alive"}
```

```json
{"status":"ok"}
```

## Prisma Studio

Prisma Studio가 필요하면 `tools` profile로 실행합니다.

```bash
docker compose --profile tools up prisma-runner
```

실행 후 브라우저에서 `http://localhost:5555`로 접속합니다.

## Useful Commands

로그 확인:

```bash
docker compose logs -f log_collector
docker compose logs -f ai_classifier
docker compose logs -f gen_rule
```

특정 서비스 재빌드:

```bash
docker compose build ai_classifier
docker compose up -d ai_classifier
```

로컬 DB 포함 전체 재빌드:

```bash
docker compose --profile localdb up -d --build
```

## 오류

- 낡은 이미지/캐시:
  - 코드를 바꿨는데 `docker compose up -d`만 해서 오래된 이미지로 뜨면 모듈 누락이나 의존성 불일치가 날 수 있습니다.
  - 해결: 필요한 서비스만 `docker compose build <svc>` 후 `docker compose up -d <svc>`
- 마운트/경로 누락:
  - Dockerfile의 `COPY` 경로나 볼륨 설정이 잘못되면 새 파일이 이미지에 들어가지 않아 런타임에 `MODULE_NOT_FOUND` 또는 `ENOENT`가 발생할 수 있습니다.
  - 해결: 변경한 폴더가 실제 `COPY` 대상인지 확인
- 환경변수 불일치:
  - `.env.shared`나 서비스별 `.env` 값이 최신이 아니면 DB 또는 외부 엔드포인트 연결 실패로 헬스체크가 계속 실패할 수 있습니다.
  - 해결: 환경변수 변경 후 `docker compose up -d`로 재시작
- 포트 충돌:
  - `3001`, `3002`, `8080` 등을 다른 프로세스가 사용하면 서비스가 바로 종료되거나 `502`, `ECONNREFUSED`가 발생할 수 있습니다.
  - 해결: Windows에서는 `netstat -ano`로 점검
- DB 스키마 미반영:
  - Prisma 스키마 변경 후 `prisma generate` 또는 `db push` 없이 컨테이너만 올리면 쿼리 에러가 날 수 있습니다.
  - 해결: 스키마를 바꿨다면 `docker compose run --rm prisma-runner npx prisma db push`
- WSL/네트워크 문제:
  - WSL 통합이 꺼져 있거나 VPN, 회사 방화벽이 Supabase, Hugging Face 같은 외부 주소를 막으면 서비스 헬스가 계속 떨어질 수 있습니다.
  - 해결: `wsl --status`와 네트워크 허용 여부 확인

## Troubleshooting

### 1. `ai_classifier`가 뜨지 않음

확인할 것:

- `ai_classifier/.env`에 `HF_ENDPOINT_URL`이 있는지
- `ai_classifier/.env`에 `HF_API_KEY`가 있는지
- Hugging Face Endpoint가 실제로 응답하는지

### 2. `log_collector`가 시작 직후 종료됨

확인할 것:

- `.env.shared`에 `DATABASE_URL`이 있는지
- DB가 실제로 접근 가능한지
- Prisma schema와 DB가 호환되는지

### 3. `gen_rule` 실행 시 실패함

확인할 것:

- `gen_rule/.env`에 `DATABASE_URL`이 있는지
- `gen_rule/.env`에 `ANTHROPIC_API_KEY`가 있는지
- 최근 24시간 window 안에 라벨링된 공격 세션이 존재하는지

### 4. `gen_rule`이 실행되지만 룰이 생성되지 않음

가능한 원인:

- 아직 처리 가능한 24시간 window가 완성되지 않음
- 해당 구간에 공격 세션이 없음
- LLM 응답에서 유효한 `SecRule` 한 줄을 추출하지 못함

### 5. 포트 충돌

다음 포트가 이미 사용 중이면 서비스가 정상 기동하지 않을 수 있습니다.

- `8080`
- `3001`
- `3002`
- `5432`
- `5555`

### 6. Docker 이미지/캐시 문제

코드 변경 후 반영이 안 되는 경우:

```bash
docker compose build <service>
docker compose up -d <service>
```

필요 시 전체 재시작:

```bash
docker compose down
docker compose up -d --build
```

## Notes

- `postgres` 서비스는 `localdb` profile일 때만 실행됩니다.
- `gen_rule`은 현재 LLM 기반으로 ModSecurity 룰을 생성합니다.
- `ai_classifier`는 Hugging Face Inference Endpoint를 호출하는 구조입니다.
- 운영 환경에서는 실제 API 키와 DB 접속 정보를 각 `.env` 파일에 안전하게 관리해야 합니다.
