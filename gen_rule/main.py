import json
import psycopg2
from gpt_generator import generate_modsec_rule
import re
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

RULE_FILE_PATH = os.getenv("RULE_FILE_PATH")
DATABASE_URL = os.getenv("DATABASE_URL")

def fetch_malicious_logs_from_db():
    """
    MALICIOUS로 라벨링된 세션의 로그를 데이터베이스에서 가져옵니다.
    """
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # MALICIOUS 세션과 연결된 RawLog들을 가져오는 쿼리
    query = """
    SELECT 
        rl.method,
        rl.uri,
        rl.request_headers,
        rl.request_body,
        rl.matched_rules,
        rl.audit_summary,
        rl.full_log,
        s.session_id,
        s.ip_address,
        s.user_agent
    FROM "RawLog" rl
    JOIN "Session" s ON rl.sessionId = s.id
    WHERE s.label = 'MALICIOUS'
    ORDER BY rl.timestamp ASC
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

def save_rule_to_db(rule: str):
    """
    생성된 룰을 데이터베이스의 Rule 테이블에 저장합니다.
    """
    rule_lines = rule.strip().split('\n')
    if len(rule_lines) < 2:
        print("❌ Invalid rule format.")
        return

    # 1. 타겟과 오퍼레이터 추출
    sec_rule_match = re.match(r'SecRule\s+(.+?)\s+"(@\w+ .+?)"', rule_lines[0])
    if not sec_rule_match:
        print("❌ Could not parse SecRule line.")
        return

    target = sec_rule_match.group(1).strip()
    operator = sec_rule_match.group(2).strip()

    # 2. 속성 파싱
    attributes_line = rule_lines[1].strip().strip('"').replace('\\', '')
    attributes = dict()
    for attr in attributes_line.split(','):
        key_value = attr.strip().split(':', 1)
        if len(key_value) == 2:
            key, value = key_value
            attributes[key.strip()] = value.strip().strip("'")

    # 3. 필요한 필드 추출
    rule_id = int(attributes.get("id"))
    rule_name = attributes.get("msg", "Unnamed Rule")
    phase = int(attributes.get("phase", 2))
    action = "block" if "block" in attributes_line else "deny" if "deny" in attributes_line else "pass"
    transformation = attributes.get("t", None)
    severity_level = attributes.get("severity", "UNKNOWN")
    logdata = attributes.get("logdata", None)

    # 4. 전체 rule 원본 백업
    rule_template = {
        "raw": rule,
        "generated_at": datetime.now().isoformat()
    }

    # 5. DB에 저장
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    insert_sql = """
        INSERT INTO "Rule" (
            rule_id, rule_name, target, operator, phase,
            action, transformation, severity_level, logdata, rule_template
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (rule_id) DO UPDATE SET
            rule_name = EXCLUDED.rule_name,
            target = EXCLUDED.target,
            operator = EXCLUDED.operator,
            phase = EXCLUDED.phase,
            action = EXCLUDED.action,
            transformation = EXCLUDED.transformation,
            severity_level = EXCLUDED.severity_level,
            logdata = EXCLUDED.logdata,
            rule_template = EXCLUDED.rule_template
    """
    cur.execute(insert_sql, (
        rule_id, rule_name, target, operator, phase,
        action, transformation, severity_level, logdata, json.dumps(rule_template)
    ))
    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Rule {rule_id} saved to database.")

def main():
    print("🔍 Fetching malicious logs from database...")
    logs_data, session_info = fetch_malicious_logs_from_db()
    
    if not logs_data:
        print("❌ No malicious logs found in database.")
        return
    
    print(f"📊 Found {len(logs_data)} malicious requests from session: {session_info.get('session_id', 'Unknown')}")
    
    attack_logs = format_logs_for_prompt(logs_data, session_info)
    
    print("🤖 Generating ModSecurity rule using GPT...")
    rule = generate_modsec_rule(attack_logs, "MALICIOUS_SESSION")

    print("💾 Saving rule to file...")
    save_rule_to_file(rule)

    print("💾 Saving rule to database...")
    save_rule_to_db(rule)

    print("✅ ModSecurity rule generated and saved successfully!")

if __name__ == "__main__":
    main()
