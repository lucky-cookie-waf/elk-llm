import json
import psycopg2
from gpt_generator import generate_modsec_rule
import re
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

RULE_FILE_PATH = os.getenv("RULE_FILE_PATH", "rules/custom_rules.conf")
DATABASE_URL   = os.getenv("DATABASE_URL", "postgresql://luckycookie:luckycookie@postgres:5432/modsec_logs")

def fetch_next_uncovered_session_and_logs():
    """
    아직 어떤 Rule에도 출처로 기록되지 않은 MALICIOUS 세션 1건과 그 세션의 로그를 가져온다.
    반환: (logs_data, session_info)
      - logs_data: format_logs_for_prompt()가 처리할 수 있는 딕셔너리 리스트
      - session_info: {"id", "session_id", "ip_address", "user_agent"}
    """
    db_url = os.getenv("DATABASE_URL", "postgresql://luckycookie:luckycookie@postgres:5432/modsec_logs")
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            # 1) 아직 어떤 Rule에도 출처로 기록되지 않은 MALICIOUS 세션 1건
            cur.execute("""
                SELECT s.id, s.session_id, s.ip_address, s.user_agent
                  FROM "Session" s
                 WHERE s."label" = 'MALICIOUS'
                   AND EXISTS (SELECT 1 FROM "RawLog" rl WHERE rl."sessionId" = s.id)
                   AND NOT EXISTS (
                        SELECT 1
                          FROM "Rule" r
                         CROSS JOIN LATERAL jsonb_array_elements(r.rule_template->'source_sessions') e
                         WHERE e->>'session_id' = s.session_id
                   )
                 ORDER BY s.start_time NULLS LAST
                 LIMIT 1;
            """)
            row = cur.fetchone()
            if not row:
                return None, None

            sid, session_id, ip, ua = row
            session_info = {
                "id": sid,
                "session_id": session_id,
                "ip_address": ip,
                "user_agent": ua,
            }

            # 2) 해당 세션의 RawLog들
            cur.execute("""
                SELECT
                    rl."method", rl."uri", rl."request_headers", rl."request_body",
                    rl."matched_rules", rl."audit_summary", rl."full_log",
                    rl."timestamp"
                FROM "RawLog" rl
                WHERE rl."sessionId" = %s
                ORDER BY rl."timestamp" ASC
                LIMIT 200;
            """, (sid,))
            rows = cur.fetchall()

            logs_data = [{
                "method": r[0],
                "uri": r[1],
                "request_headers": r[2],
                "request_body": r[3],
                "matched_rules": r[4],
                "audit_summary": r[5],
                "full_log": r[6],
                "timestamp": r[7],
            } for r in rows]

            return logs_data, session_info
    finally:
        conn.close()

def fetch_malicious_logs_from_db():
    """
    MALICIOUS로 라벨링된 세션의 로그를 데이터베이스에서 가져옵니다.
    """
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # MALICIOUS 세션과 연결된 RawLog들을 가져오는 쿼리
    query = """
    SELECT 
        rl."method",
        rl."uri",
        rl."request_headers",
        rl."request_body",
        rl."matched_rules",
        rl."audit_summary",
        rl."full_log",
        s."session_id",
        s."ip_address",
        s."user_agent"
    FROM "RawLog" rl
    JOIN "Session" s ON rl."sessionId" = s."id"
    WHERE s."label" = 'MALICIOUS'
    ORDER BY rl."timestamp" ASC;
    """
    
    cur.execute(query)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    logs = []
    session_info = {}

    for row in rows:
        method, uri, headers_json, body, matched_rules, audit_summary, full_log, session_id, ip_address, user_agent = row
        
        # 세션 정보 저장
        if not session_info:
            session_info = {
                "session_id": session_id,
                "ip_address": ip_address,
                "user_agent": user_agent
            }
        
        # 헤더 파싱
        headers = json.loads(headers_json) if headers_json else {}
        
        log_entry = {
            "method": method,
            "uri": uri,
            "headers": headers,
            "matched_rules": matched_rules,
            "audit_summary": audit_summary
        }
        
        if body:
            log_entry["body"] = body
            
        logs.append(log_entry)

    return logs, session_info

def format_logs_for_prompt(logs: list, session_info: dict) -> str:
    """
    로그를 GPT 프롬프트용으로 포맷팅합니다.
    """
    result = f"Session ID: {session_info.get('session_id', 'Unknown')}\n"
    result += f"IP Address: {session_info.get('ip_address', 'Unknown')}\n"
    result += f"User Agent: {session_info.get('user_agent', 'Unknown')}\n\n"
    
    result += "Malicious Requests:\n"
    for i, log in enumerate(logs, 1):
        result += f"\n[{i}] {log['method']} {log['uri']}\n"
        
        # 헤더 정보
        if log.get('headers'):
            headers = "\n".join([f"  {k}: {v}" for k, v in log['headers'].items()])
            result += f"Headers:\n{headers}\n"
        
        # 요청 바디
        if log.get('body'):
            result += f"Body:\n{log['body']}\n"
        
        # 매칭된 룰 정보
        if log.get('matched_rules'):
            result += f"Matched Rules: {json.dumps(log['matched_rules'], indent=2)}\n"
        
        # 감사 요약 정보
        if log.get('audit_summary'):
            result += f"Audit Summary: {json.dumps(log['audit_summary'], indent=2)}\n"
    
    return result

def save_rule_to_file(rule: str):
    """
    생성된 룰을 파일에 저장합니다.
    """
    os.makedirs(os.path.dirname(RULE_FILE_PATH), exist_ok=True)
    with open(RULE_FILE_PATH, "w") as f:
        f.write(rule)

def _normalize_sessions(src):
    """
    다양한 형태의 session_info를 JSON 저장용으로 표준화.
    - dict 또는 객체: session_id/id/ip_address/user_agent만 뽑기
    - 문자열: session_id로 간주
    - 리스트/튜플: 각 원소에 재귀 적용
    """
    def one(x):
        if x is None:
            return None
        if isinstance(x, str):
            return {"session_id": x}
        if isinstance(x, dict):
            return {
                "session_id": x.get("session_id") or x.get("sessionId") or x.get("label"),
                "id": x.get("id"),
                "ip_address": x.get("ip_address") or x.get("ipAddress"),
                "user_agent": x.get("user_agent") or x.get("userAgent"),
            }
        # namedtuple/obj 등
        sid = getattr(x, "session_id", None) or getattr(x, "sessionId", None)
        return {
            "session_id": sid,
            "id": getattr(x, "id", None),
            "ip_address": getattr(x, "ip_address", None) or getattr(x, "ipAddress", None),
            "user_agent": getattr(x, "user_agent", None) or getattr(x, "userAgent", None),
        }

    if src is None:
        return []
    if isinstance(src, (list, tuple, set)):
        return [v for v in (one(i) for i in src) if v]
    return [v for v in [one(src)] if v]

# ========= REPLACE THIS WHOLE FUNCTION BODY =========
def save_rule_to_db(rule_text: str, source_sessions=None) -> int:
    import os, re, json, psycopg2

    db_url = os.getenv("DATABASE_URL", "postgresql://luckycookie:luckycookie@postgres:5432/modsec_logs")
    RULE_ID_RE  = re.compile(r'\bid\s*:\s*(\d+)\b', re.I)
    PHASE_RE    = re.compile(r'\bphase\s*:\s*(\d+)\b', re.I)
    SEVERITY_RE = re.compile(r"severity\s*:\s*'?(CRITICAL|HIGH|MEDIUM|LOW)'?", re.I)
    MSG_RE      = re.compile(r"msg\s*:\s*'([^']+)'", re.I)
    LOGDATA_RE  = re.compile(r"logdata\s*:\s*'([^']+)'", re.I)
    TRANS_RE    = re.compile(r'\bt\s*:\s*([A-Za-z0-9:,_-]+)', re.I)
    SEC_RULE_LINE = re.compile(r'^\s*SecRule\s+([^\s"]+)\s+"@([^"]+)"', re.I)

    def _norm_sessions(src):
        def one(x):
            if x is None: return None
            if isinstance(x, str): return {"session_id": x}
            if isinstance(x, dict):
                return {
                    "session_id": x.get("session_id") or x.get("sessionId") or x.get("label"),
                    "id": x.get("id"),
                    "ip_address": x.get("ip_address") or x.get("ipAddress"),
                    "user_agent": x.get("user_agent") or x.get("userAgent"),
                }
            sid = getattr(x, "session_id", None) or getattr(x, "sessionId", None)
            return {
                "session_id": sid,
                "id": getattr(x, "id", None),
                "ip_address": getattr(x, "ip_address", None) or getattr(x, "ipAddress", None),
                "user_agent": getattr(x, "user_agent", None) or getattr(x, "userAgent", None),
            }
        if src is None: return []
        if isinstance(src, (list, tuple, set)):
            out = [one(i) for i in src]
        else:
            out = [one(src)]
        return [v for v in out if v and v.get("session_id")]

    # 1) 체인 타겟/연산자 모으기
    targets, operators = [], []
    for ln in rule_text.splitlines():
        m = SEC_RULE_LINE.match(ln)
        if m:
            targets.append(m.group(1))
            operators.append('@' + m.group(2))
    target_s = "; ".join(targets) if targets else ""
    operator_s = "; ".join(operators) if operators else ""

    rid_m = RULE_ID_RE.search(rule_text)
    phase_m = PHASE_RE.search(rule_text)
    sev_m   = SEVERITY_RE.search(rule_text)
    msg_m   = MSG_RE.search(rule_text)
    log_m   = LOGDATA_RE.search(rule_text)
    trans_m = TRANS_RE.search(rule_text)
    new_src = _norm_sessions(source_sessions)

    conn = psycopg2.connect(db_url)
    try:
        with conn, conn.cursor() as cur:
            # 2) rule_id 결정
            if rid_m:
                rule_id = int(rid_m.group(1))
            else:
                cur.execute('SELECT COALESCE(MAX(rule_id), 1000000)+1 FROM "Rule";')
                rule_id = cur.fetchone()[0]
                # rule_text 안의 id도 맞춰주고 싶다면(옵션):
                rule_text = re.sub(r'\bid\s*:\s*\d+\b', f'id:{rule_id}', rule_text)

            # 3) 기존 레코드가 있으면 source_sessions 병합
            cur.execute('SELECT rule_template FROM "Rule" WHERE rule_id=%s;', (rule_id,))
            row = cur.fetchone()
            merged_src = new_src
            if row:
                try:
                    existing = row[0] or {}
                    exist_src = existing.get("source_sessions") or []
                    # session_id 기준 유니크 병합
                    seen = {e.get("session_id") for e in exist_src if isinstance(e, dict)}
                    for s in new_src:
                        if s["session_id"] not in seen:
                            exist_src.append(s); seen.add(s["session_id"])
                    merged_src = exist_src
                except Exception:
                    pass  # 실패해도 새 값만 사용

            payload = {
                "rule_id": rule_id,
                "rule_name": (msg_m.group(1) if msg_m else "Custom rule generated"),
                "target": target_s,
                "operator": operator_s,
                "phase": int(phase_m.group(1)) if phase_m else 2,
                "action": "block" if ((" block" in f" {rule_text}".lower()) or (" deny" in f" {rule_text}".lower())) else "deny",
                "transformation": trans_m.group(1).strip() if trans_m else "",
                "severity_level": (sev_m.group(1).upper() if sev_m else "MEDIUM"),
                "logdata": log_m.group(1) if log_m else "",
                "rule_template": json.dumps({
                    "raw": rule_text,
                    "chain": ("chain" in rule_text.lower()),
                    "phase": int(phase_m.group(1)) if phase_m else 2,
                    "targets": target_s,
                    "operators": operator_s,
                    "transformation": trans_m.group(1).strip() if trans_m else "",
                    "severity": (sev_m.group(1).upper() if sev_m else "MEDIUM"),
                    "logdata": log_m.group(1) if log_m else "",
                    "source_sessions": merged_src,  # ← 병합 결과 저장
                }),
            }

            # 4) 업서트
            cur.execute("""
                INSERT INTO "Rule"
                  (rule_id, rule_name, target, operator, phase, action, transformation, severity_level, logdata, rule_template)
                VALUES
                  (%(rule_id)s, %(rule_name)s, %(target)s, %(operator)s, %(phase)s, %(action)s, %(transformation)s, %(severity_level)s, %(logdata)s, %(rule_template)s::jsonb)
                ON CONFLICT (rule_id) DO UPDATE SET
                  rule_name      = EXCLUDED.rule_name,
                  target         = EXCLUDED.target,
                  operator       = EXCLUDED.operator,
                  phase          = EXCLUDED.phase,
                  action         = EXCLUDED.action,
                  transformation = EXCLUDED.transformation,
                  severity_level = EXCLUDED.severity_level,
                  logdata        = EXCLUDED.logdata,
                  rule_template  = EXCLUDED.rule_template
                RETURNING id;
            """, payload)
            new_id = cur.fetchone()[0]
            print(f"💾 Saved rule to DB: id={new_id}, rule_id={rule_id}")
            return new_id
    finally:
        conn.close()


def _strip_code_fences(s: str) -> str:
    s = s.strip()
    s = re.sub(r"^```[^\n]*\n", "", s)  # 시작 펜스 제거 (``` 또는 ```apache 등)
    s = re.sub(r"\n```$", "", s)        # 끝 펜스 제거
    return s.strip()

def main():
    # 한 번에 너무 많이 돌지 않게 안전장치 (환경변수로 조절 가능)
    MAX_SESSIONS_PER_RUN = int(os.getenv("MAX_SESSIONS_PER_RUN", "5"))

    processed = 0
    while processed < MAX_SESSIONS_PER_RUN:
        # 1) 아직 룰 미적용(미커버) 세션 1건과 그 로그 가져오기
        logs_data, session_info = fetch_next_uncovered_session_and_logs()
        if not logs_data:
            if processed == 0:
                print("❌ No uncovered MALICIOUS sessions. (All covered)")
            else:
                print(f"✅ All done. Newly covered sessions: {processed}")
            break

        print(f"📊 Found {len(logs_data)} malicious requests from session: {session_info.get('session_id')}")
        attack_logs = format_logs_for_prompt(logs_data, session_info)

        # 2) 룰 생성
        print("🤖 Generating ModSecurity rule using GPT...")
        rule = generate_modsec_rule(attack_logs, "MALICIOUS_SESSION")

        # 3) LLM이 붙여줄 수 있는 코드펜스 제거
        rule = _strip_code_fences(rule)

        # 4) 파일 저장
        print("💾 Saving rule to file...")
        save_rule_to_file(rule)

        # 5) DB 저장 (출처 세션 함께 기록)
        print("💾 Saving rule to database...")
        save_rule_to_db(rule, source_sessions=session_info)

        processed += 1

    if processed > 0:
        print("✅ ModSecurity rule(s) generated and saved successfully!")

if __name__ == "__main__":
    main()
