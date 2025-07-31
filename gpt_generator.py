from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))  # 또는 하드코딩된 키 사용 가능
#prompt modsecurity conf 파일 rule 형식 기반으로 생성해달라고 수정 필요
#로그파일 전달 구조
def generate_modsec_rule(attack_logs: str, attack_type: str) -> str:
    """
    최신 OpenAI SDK로 ModSecurity 룰 생성
    """
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
