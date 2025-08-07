from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def is_rule_duplicate(new_rule: str, existing_rules_path: str) -> bool:
    """
    Check if the generated ModSecurity rule already exists in the rules file.
    Criteria:
    - Same rule id (id:<number>)
    - Or exact rule line match
    """
    try:
        with open(existing_rules_path, 'r') as file:
            existing_rules = file.read()

        # Check for exact match
        if new_rule in existing_rules:
            return True

        # Extract new rule ID
        import re
        match = re.search(r'id:(\d+)', new_rule)
        if match:
            new_id = match.group(1)
            # Check if ID already exists
            if f'id:{new_id}' in existing_rules:
                return True

        return False

    except FileNotFoundError:
        print(f"[ERROR] Rules file not found: {existing_rules_path}")
        return False


def generate_modsec_rule(attack_logs: str, attack_type: str) -> str:
    prompt = f"""
You are an expert in web application firewalls and ModSecurity.

Using the OWASP Core Rule Set style, write a custom ModSecurity rule based on the following malicious session:

Attack Type: {attack_type}

Malicious Requests:
{attack_logs}

Constraints:
- Write in ModSecurity `SecRule` format.
- Use variables like REQUEST_URI, ARGS, REQUEST_HEADERS.
- Use msg, id, severity, and phase.
- Follow OWASP CRS rule formatting style.

Return only the rule.
    """

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a cybersecurity WAF expert."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2
    )

    return response.choices[0].message.content.strip()