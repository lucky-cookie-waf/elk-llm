# ===== imports (모듈 상단) =====
import os, json, re
import psycopg2
from psycopg2 import sql

RULE_FILE_PATH = os.getenv("RULE_FILE_PATH", "rules/custom_rules.conf")
# Prisma 전용 파라미터(schema, pgbouncer, connection_limit)는 절대 넣지 말 것!
DEFAULT_DB_URL = ""

def get_conn():
    """
    psycopg2 연결을 만들고 search_path를 설정한다.
    """
    db_url = os.getenv("DATABASE_URL", DEFAULT_DB_URL)
    schema = os.getenv("DB_SCHEMA", "public")
    conn = psycopg2.connect(db_url)
    with conn.cursor() as cur:
        cur.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
    return conn

# ========== fetch_next_uncovered_session_and_logs ==========
def fetch_next_uncovered_session_and_logs():
    """
    아직 어떤 Rule에도 출처로 기록되지 않은 MALICIOUS 세션 1건과 그 세션의 로그를 가져온다.
    반환: (logs_data, session_info)
      - logs_data: format_logs_for_prompt()가 처리할 수 있는 딕셔너리 리스트
      - session_info: {"id", "session_id", "ip_address", "user_agent"}
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # 아직 어떤 Rule에도 출처로 기록되지 않은 MALICIOUS 세션 1건
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

            # 해당 세션의 RawLog들
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

            def _parse_headers(h):
                if not h:
                    return {}
                if isinstance(h, dict):
                    return h
                if isinstance(h, str):
                    try:
                        return json.loads(h)
                    except Exception:
                        return {}
                return {}

            logs_data = [{
                "method": r[0],
                "uri": r[1],
                "request_headers": _parse_headers(r[2]),
                "request_body": r[3],
                "matched_rules": r[4],
                "audit_summary": r[5],
                "full_log": r[6],
                "timestamp": r[7],
            } for r in rows]

            return logs_data, session_info
    finally:
        conn.close()

# ========== fetch_malicious_logs_from_db ==========
def fetch_malicious_logs_from_db():
    """
    MALICIOUS로 라벨링된 세션의 로그를 데이터베이스에서 가져옵니다.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
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
    finally:
        conn.close()

    def _parse_headers(h):
        if not h:
            return {}
        if isinstance(h, dict):
            return h
        if isinstance(h, str):
            try:
                return json.loads(h)
            except Exception:
                return {}
        return {}

    logs = []
    session_info = {}

    for row in rows:
        (method, uri, headers_json, body, matched_rules,
         audit_summary, full_log, session_id, ip_address, user_agent) = row

        if not session_info:
            session_info = {
                "session_id": session_id,
                "ip_address": ip_address,
                "user_agent": user_agent
            }

        log_entry = {
            "method": method,
            "uri": uri,
            "headers": _parse_headers(headers_json),
            "matched_rules": matched_rules,
            "audit_summary": audit_summary
        }
        if body:
            log_entry["body"] = body
        logs.append(log_entry)

    return logs, session_info

# ========== format_logs_for_prompt (무변경, 단 import json 상단 보장) ==========
def format_logs_for_prompt(logs: list, session_info: dict) -> str:
    result = f"Session ID: {session_info.get('session_id', 'Unknown')}\n"
    result += f"IP Address: {session_info.get('ip_address', 'Unknown')}\n"
    result += f"User Agent: {session_info.get('user_agent', 'Unknown')}\n\n"
    
    result += "Malicious Requests:\n"
    for i, log in enumerate(logs, 1):
        result += f"\n[{i}] {log['method']} {log['uri']}\n"
        if log.get('headers'):
            headers = "\n".join([f"  {k}: {v}" for k, v in log['headers'].items()])
            result += f"Headers:\n{headers}\n"
        if log.get('body'):
            result += f"Body:\n{log['body']}\n"
        if log.get('matched_rules'):
            result += f"Matched Rules: {json.dumps(log['matched_rules'], indent=2)}\n"
        if log.get('audit_summary'):
            result += f"Audit Summary: {json.dumps(log['audit_summary'], indent=2)}\n"
    return result

# ========== save_rule_to_db (DSN 정리 + search_path 통일) ==========
def save_rule_to_db(rule_text: str, source_sessions=None) -> int:
    import re, json  # 상단 import가 있지만, 로컬에서도 문제 없게 둠

    # Prisma 전용 파라미터 제거된 DSN 사용
    db_url = os.getenv("DATABASE_URL", DEFAULT_DB_URL)
    schema = os.getenv("DB_SCHEMA", "public")

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
        # search_path 통일
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))

                # 2) rule_id 결정
                if rid_m:
                    rule_id = int(rid_m.group(1))
                else:
                    cur.execute('SELECT COALESCE(MAX(rule_id), 1000000)+1 FROM "Rule";')
                    rule_id = cur.fetchone()[0]
                    # (옵션) rule_text 내 id 값도 업데이트하고 싶다면 여기를 유지
                    rule_text = re.sub(r'\bid\s*:\s*\d+\b', f'id:{rule_id}', rule_text)

                # 3) 기존 레코드가 있으면 source_sessions 병합
                cur.execute('SELECT rule_template FROM "Rule" WHERE rule_id=%s;', (rule_id,))
                row = cur.fetchone()
                merged_src = new_src
                if row:
                    try:
                        existing = row[0] or {}
                        # row[0]이 jsonb→dict로 올 수도, str로 올 수도 있으니 처리
                        if isinstance(existing, str):
                            existing = json.loads(existing)
                        exist_src = existing.get("source_sessions") or []
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
                        "source_sessions": merged_src,
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
