import os
import json
import re
import psycopg2
from psycopg2 import sql

RULE_FILE_PATH = os.getenv("RULE_FILE_PATH", "rules/custom_rules.conf")
# Prisma 전용 파라미터(schema, pgbouncer, connection_limit)는 절대 넣지 말 것!
DEFAULT_DB_URL = "postgresql://postgres.nqpshpimhofnjxlcepop:luckycookiedb123@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require"


# ===== DB Helper =====
def get_conn():
    db_url = os.getenv("DATABASE_URL", DEFAULT_DB_URL)
    schema = os.getenv("DB_SCHEMA", "public")
    conn = psycopg2.connect(db_url)
    with conn.cursor() as cur:
        cur.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
    return conn


# ===== Fetch Logic =====
def fetch_next_uncovered_session_and_logs():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # 1. 세션 가져오기
            cur.execute(
                """
                SELECT s.id, s.session_id, s.ip_address, s.user_agent, s.classification
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
            """
            )
            row = cur.fetchone()
            if not row:
                return None, None

            sid, session_id, ip, ua, classification = row

            # [정의 위치 1] 여기서 session_info 딕셔너리가 만들어집니다.
            session_info = {
                "id": sid,
                "session_id": session_id,
                "ip_address": ip,
                "user_agent": ua,
                "attack_type": classification if classification else "Generic Attack",
            }

            # 2. 로그 가져오기
            cur.execute(
                """
                SELECT rl."method", rl."uri", rl."request_headers", rl."request_body",
                       rl."matched_rules", rl."audit_summary", rl."full_log", rl."timestamp"
                FROM "RawLog" rl
                WHERE rl."sessionId" = %s
                ORDER BY rl."timestamp" ASC
                LIMIT 50;
            """,
                (sid,),
            )
            rows = cur.fetchall()

            def _parse_headers(h):
                if not h:
                    return {}
                if isinstance(h, dict):
                    return h
                try:
                    return json.loads(h)
                except:
                    return {}

            logs_data = [
                {
                    "method": r[0],
                    "uri": r[1],
                    "headers": _parse_headers(r[2]),
                    "request_body": r[3],
                    "matched_rules": r[4],
                    "timestamp": r[7],
                }
                for r in rows
            ]

            return logs_data, session_info

    except Exception as e:
        print(f"❌ DB Fetch Error: {e}")
        conn.rollback()
        # [중요 수정] 에러 발생 시에도 안전하게 None을 반환해야 main에서 언패킹 에러가 안 납니다.
        return None, None

    finally:
        conn.close()


def format_logs_for_prompt(logs: list, session_info: dict) -> str:
    result = f"Session ID: {session_info.get('session_id')}\n"
    result += f"IP: {session_info.get('ip_address')}\n"
    result += f"User Agent: {session_info.get('user_agent')}\n\n"

    result += "=== Request Logs ===\n"
    for i, log in enumerate(logs, 1):
        result += f"\nRequest #{i}:\n"
        result += f"{log['method']} {log['uri']}\n"
        if log.get("request_body"):
            result += f"Body: {log['request_body']}\n"

        headers = log.get("headers", {})
        if headers:
            # 중요 헤더만 필터링하여 토큰 절약
            important_headers = [
                "host",
                "content-type",
                "cookie",
                "referer",
                "user-agent",
            ]
            header_str = "\n".join(
                [
                    f"  {k}: {v}"
                    for k, v in headers.items()
                    if k.lower() in important_headers
                ]
            )
            if header_str:
                result += f"Headers:\n{header_str}\n"

    return result


# ===== Save Logic =====
def save_rule_to_db(rule_text: str, source_session: dict) -> int:
    # ▲ 여기서 'session_info' 값을 'source_session'이라는 이름으로 받습니다.
    import re, json

    # 정규식 정의
    RULE_ID_RE = re.compile(r"\bid\s*:\s*(\d+)\b", re.I)
    PHASE_RE = re.compile(r"\bphase\s*:\s*(\d+)\b", re.I)
    SEVERITY_RE = re.compile(r"severity\s*:\s*'?(CRITICAL|HIGH|MEDIUM|LOW)'?", re.I)
    MSG_RE = re.compile(r"msg\s*:\s*'([^']+)'", re.I)
    LOGDATA_RE = re.compile(r"logdata\s*:\s*'([^']+)'", re.I)
    TRANS_RE = re.compile(r"\bt\s*:\s*([A-Za-z0-9:,_-]+)", re.I)
    SEC_RULE_LINE = re.compile(r'^\s*SecRule\s+([^\s"]+)\s+"@([^"]+)"', re.I)

    # 1. 룰 파싱
    rid_m = RULE_ID_RE.search(rule_text)
    phase_m = PHASE_RE.search(rule_text)
    sev_m = SEVERITY_RE.search(rule_text)
    msg_m = MSG_RE.search(rule_text)
    log_m = LOGDATA_RE.search(rule_text)
    trans_m = TRANS_RE.search(rule_text)
    sec_rule = SEC_RULE_LINE.match(rule_text.strip().splitlines()[0])

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # 2. Rule ID 결정
            if rid_m:
                rule_id = int(rid_m.group(1))
            else:
                cur.execute('SELECT COALESCE(MAX(rule_id), 9000000)+1 FROM "Rule";')
                rule_id = cur.fetchone()[0]
                if "id:" not in rule_text:
                    rule_text = (
                        rule_text.strip().rstrip('"') + f',\\\n    id:{rule_id}"'
                    )

            # 3. Source Session JSON 구조 생성
            src_sessions = [
                {
                    "session_id": source_session["session_id"],
                    "ip_address": source_session["ip_address"],
                    "user_agent": source_session["user_agent"],
                }
            ]

            template_json = json.dumps(
                {"raw": rule_text, "source_sessions": src_sessions}
            )

            target_val = sec_rule.group(1) if sec_rule else "UNKNOWN"
            op_val = "@" + sec_rule.group(2) if sec_rule else "UNKNOWN"
            severity = sev_m.group(1).upper() if sev_m else "MEDIUM"
            msg = msg_m.group(1) if msg_m else f"Auto-generated rule {rule_id}"

            query = """
                INSERT INTO "Rule" (
                    rule_id, rule_name, target, operator, phase, action, 
                    transformation, severity_level, logdata, rule_template, status
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, 
                    %s, %s, %s, %s::jsonb, 'Processing'
                )
                ON CONFLICT (rule_id) DO UPDATE SET
                    rule_template = EXCLUDED.rule_template,
                    rule_name = EXCLUDED.rule_name
                RETURNING id;
            """

            cur.execute(
                query,
                (
                    rule_id,
                    msg,
                    target_val,
                    op_val,
                    int(phase_m.group(1)) if phase_m else 2,
                    "deny",
                    trans_m.group(1) if trans_m else "",
                    severity,
                    log_m.group(1) if log_m else "",
                    template_json,
                ),
            )

            new_pk = cur.fetchone()[0]
            conn.commit()
            print(f"✅ Saved rule to DB (PK: {new_pk}, RuleID: {rule_id})")
            return new_pk

    except Exception as e:
        conn.rollback()
        print(f"❌ DB Error: {e}")
        return -1
    finally:
        conn.close()


# ===== Main Execution =====
def main():
    print("🔍 Searching for uncovered malicious sessions...")

    # [정의 위치 2] 여기서 값을 받아옵니다.
    logs, session_info = fetch_next_uncovered_session_and_logs()

    # logs가 None이면(DB 에러 혹은 데이터 없음) session_info도 None이므로 종료
    if not logs:
        print("🎉 No new malicious sessions found or DB Error.")
        return

    print(
        f"⚠️  Processing Session: {session_info['session_id']} (Type: {session_info['attack_type']})"
    )

    # 1. 프롬프트용 로그 포맷팅
    logs_text = format_logs_for_prompt(logs, session_info)

    # 2. 룰 생성
    print("⚙️  Generating Rule from LLM...")
    rule_content = generate_modsec_rule(logs_text, session_info["attack_type"])

    print("-" * 40)
    print("🔥 Generated Rule:")
    print(rule_content)
    print("-" * 40)

    # 3. DB 저장
    print("💾 Saving to Database...")
    # [사용 위치] 위에서 정의된 session_info를 함수로 넘겨줍니다.
    save_rule_to_db(rule_content, session_info)


if __name__ == "__main__":
    main()
