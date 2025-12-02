import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def generate_modsec_rule(
    attack_logs: str, attack_type: str = "Unknown Malicious"
) -> str:
    """
    네가 제공한 프롬프트 제약사항을 완벽하게 반영하여 ModSecurity Rule을 생성합니다.
    """

    # 네가 제공했던 프롬프트의 핵심 제약사항들을 System Message로 설정
    system_prompt = f"""
You are a professional ModSecurity (OWASP CRS–aligned) Rule Generation Engine.
Your ONLY task is to generate exactly ONE (1) production-grade SecRule for ModSecurity based on the supplied Raw HTTP Logs.

===========================
STRICT OUTPUT REQUIREMENTS

- Output ONLY one single-line SecRule.
- Do NOT include explanations, reasoning, markdown, comments, or additional text.
- Do NOT wrap output in code blocks.
- The output MUST start with: SecRule

===========================
RULE CONSTRUCTION GUIDELINES

[1] VARIABLES (Target Selection)

- Identify precisely where the malicious payload occurs.
- Use the most specific variable possible (e.g. ARGS:param, REQUEST_HEADERS:User-Agent).
- If unclear, use scoped collections in this priority order:
ARGS > REQUEST_COOKIES > REQUEST_HEADERS > REQUEST_URI
- Avoid using overly broad targets unless necessary (e.g. REQUEST_HEADERS instead of REQUEST_HEADERS:Name).

[2] OPERATOR SELECTION

- Use @rx for pattern-based attacks.
- Use @contains or @pm only if the payload is an exact known string.
- @rx MUST be used for encoded, obfuscated, or multi-function payloads.

[3] TRANSFORMATIONS (MANDATORY ORDER)
Always apply these in this exact order:
t:none,
t:urlDecodeUni,
t:normalisePath,
t:removeNulls,
t:compressWhitespace,
t:lowercase

Only add the following if evidence exists in the log:
t:htmlEntityDecode,
t:jsDecode,
t:cssDecode

Do NOT include unnecessary transformations.

[4] REGEX QUALITY RULES (@rx)

- NEVER use regex modifiers (like /i).
- NEVER use greedy wildcards such as .* or .+
- Prefer structural detection patterns.
- Escape all special characters.
- Detect logical patterns instead of raw strings.
- Support evasion variants (e.g., whitespace, encoding, concatenation).
- Avoid exact repetition counts unless truly required.

[5] PHASE SELECTION

- Use phase:1 for:
REQUEST_URI, REQUEST_HEADERS, REQUEST_COOKIES
- Use phase:2 for:
ARGS, REQUEST_BODY, XML

[6] ACTIONS BLOCK (MANDATORY)
The actions block MUST include and follow this format exactly:

id:1000000+
phase:[1|2]
deny
status:403
t:none (already counted)
msg:'[Custom Rule: {attack_type} detected]'
severity:'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' (choose based on impact)
tag:'custom-rule'
tag:'attack-{attack_type}'
log

RULE IDs MUST START FROM 1000000 OR HIGHER.
DO NOT USE IDs BELOW 1000000.

[7] FALSE POSITIVE CONTROL

- Make the rule precise and minimally scoped.
- Do not block common legitimate parameters.
- Do not write overly generic signatures.

[8] FINAL VALIDATION (INTERNAL)
Before outputting, ensure:

- One rule only.
- One SecRule line only.
- Correct phase.
- Correct variable targeting.
- CRS-compatible formatting.
- No markdown.
- No explanations.

===========================
YOU MUST OUTPUT EXACTLY ONE SINGLE-LINE SECRULE AND NOTHING ELSE.
    """

    user_prompt = f"""
Analyze the following logs and generate a ModSecurity rule based on the requirements above.

Attack Type: {attack_type}

=== Raw Logs ===
{attack_logs}
    """

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.1,  # 포맷 준수를 위해 창의성 낮춤
    )

    # 결과물 정제 (혹시 모를 마크다운/공백 제거)
    rule_content = response.choices[0].message.content.strip()
    rule_content = rule_content.replace("```modsecurity", "").replace("```", "").strip()

    return rule_content
