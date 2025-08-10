import json
import psycopg2
from gpt_generator import generate_modsec_rule
import re
from datetime import datetime


RULE_FILE_PATH = "rules/custom_rules.conf"
DATABASE_URL="postgresql://luckycookie:luckycookie@postgres:5432/modsec_logs"

def fetch_logs_from_db():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT method, uri, headers, body, attack_type FROM rawLog")
    rows = cur.fetchall()
    cur.close()
    conn.close()

    logs = []
    attack_type = None

    for row in rows:
        method, uri, headers_json, body, attack_type = row
        headers = json.loads(headers_json) if headers_json else {}
        log_entry = {
            "method": method,
            "uri": uri,
            "headers": headers
        }
        if body:
            log_entry["body"] = body
        logs.append(log_entry)

    return logs, attack_type

def format_logs_for_prompt(logs: list) -> str:
    result = ""
    for i, log in enumerate(logs, 1):
        result += f"\n[{i}] {log['method']} {log['uri']}\n"
        headers = "\n".join([f"{k}: {v}" for k, v in log.get("headers", {}).items()])
        result += f"Headers:\n{headers}\n"
        if "body" in log:
            result += f"Body:\n{log['body']}\n"
    return result

def save_rule_to_file(rule: str):
    with open(RULE_FILE_PATH, "w") as f:
        f.write(rule)

import re
from datetime import datetime

def save_rule_to_db(rule: str):
    # SecRule REQUEST_URI "@rx <script>alert\(1\)</script>" \
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
        "raw": rule
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
        ON CONFLICT (rule_id) DO NOTHING
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
    logs_data, attack_type = fetch_logs_from_db()
    attack_logs = format_logs_for_prompt(logs_data)
    
    rule = generate_modsec_rule(attack_logs, attack_type)

    save_rule_to_file(rule)

    with open(RULE_FILE_PATH, "r") as f:
        rule_text = f.read()
    save_rule_to_db(rule_text)

    print("✅ ModSecurity rule generated and saved to rules/custom_rules.conf")



if __name__ == "__main__":
    main()
