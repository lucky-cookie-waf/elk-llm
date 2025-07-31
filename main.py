import json
from gpt_generator import generate_modsec_rule

def format_logs_for_prompt(logs: list) -> str:
    result = ""
    for i, log in enumerate(logs, 1):
        result += f"\n[{i}] {log['method']} {log['uri']}\n"
        headers = "\n".join([f"{k}: {v}" for k, v in log.get("headers", {}).items()])
        result += f"Headers:\n{headers}\n"
        if "body" in log:
            result += f"Body:\n{log['body']}\n"
    return result

def main():
    with open("examples/attack_logs.json", "r") as f:
        data = json.load(f)

    attack_type = data["attack_type"]
    logs = format_logs_for_prompt(data["logs"])

    rule = generate_modsec_rule(logs, attack_type)

    with open("rules/custom_rules.conf", "w") as f:
        f.write(rule)

    print("✅ ModSecurity rule generated and saved to rules/custom_rules.conf")

if __name__ == "__main__":
    main()
