# ELK + LLM
## 목적
- ELK (Elasticsearch + Kibana + Filebeat)와 LLM 서버 실행 환경을 Docker로 통합 관리합니다.
- Filebeat는 공유된 로그 디렉토리에서 ModSecurity 로그를 실시간 수집하여 Elasticsearch에 전달합니다.
- Flask API는 AI 모델 및 LLM 서버와 연동 가능한 API 포트를 제공합니다.

이 리포지토리는 **로그 수집 및 AI 연동 실험을 위한 환경 실행 전용**이며,  
AI 모델, 세션 분석 파이프라인, 프롬프트 템플릿 등은 별도 리포지토리에서 관리합니다.

## 구성 요소
- Filebeat: ModSecurity 로그 수집 (`modsec_audit.log`)
- Elasticsearch: 수집된 로그 저장 및 검색
- Kibana: 로그 시각화
- Flask API: LLM 및 AI 모델 연동용 중간 API 서버
- Ollama: LLM 실행서버

## 실행 방법
```
git clone https://github.com/lucky-cookie-waf/elk-llm.git
cd elk-llm
docker compose up --build
```
- ModSecurity 컨테이너에서 생성되는 로그 파일을 Filebeat가 자동 수집하여 Elasticsearch로 전달합니다.
- Kibana 대시보드: http://localhost:5601
- Flask API 서버: http://localhost:8000