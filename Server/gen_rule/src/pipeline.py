from __future__ import annotations

import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import PromptTemplate

MODEL_NAME = os.environ.get("GEN_RULE_MODEL", "claude-sonnet-4-6")
MODEL_TEMPERATURE = float(os.environ.get("GEN_RULE_TEMPERATURE", "0.1"))
MAX_EXAMPLES_PER_RULE = int(os.environ.get("GEN_RULE_MAX_EXAMPLES", "12"))
MAX_BODY_CHARS = int(os.environ.get("GEN_RULE_MAX_BODY_CHARS", "1500"))

SECRULE_LINE_RE = re.compile(r"(?m)^\s*SecRule\s+.+$")
SECRULE_PARSE_RE = re.compile(
    r'^SecRule\s+(?P<variables>.+?)\s+"(?P<operator>[^"]*)"\s+"(?P<actions>.*)"\s*$'
)
TOKEN_RE = re.compile(r"[A-Za-z0-9_./:-]{3,}")


@dataclass
class AttackRequest:
    session_db_id: int
    method: str
    uri: str
    user_agent: str
    label: str
    request_body: Optional[str] = None


@dataclass
class GeneratedRule:
    rule_id: int
    cluster_id: int
    attack_type: str
    label_mode: str
    signature: List[str]
    regex: str
    variables: str
    transformations: str
    severity: str
    tags: str
    msg: str
    secrule_text: str


@dataclass
class ParsedSecRule:
    variables: str
    operator: str
    actions: List[str]


def map_label_to_attack_type(label: str) -> str:
    return {
        "SQL_INJECTION": "sqli",
        "CODE_INJECTION": "code_injection",
        "PATH_TRAVERSAL": "path_traversal",
        "MALICIOUS": "generic_attack",
    }.get(label, "generic_attack")


@lru_cache(maxsize=1)
def _build_rule_chain():
    llm = ChatAnthropic(
        model_name=MODEL_NAME,
        temperature=MODEL_TEMPERATURE,
    )

    system_prompt = (
        "당신은 ModSecurity WAF 룰(SecRule)을 작성하는 수석 보안 엔지니어입니다. "
        "사용자의 요청을 분석하여 효과적인 ModSecurity 룰을 작성하세요.\n\n"
        "제약사항:\n"
        "1. 결과물은 반드시 올바른 ModSecurity `SecRule` 문법을 따라야 합니다.\n"
        "2. 타겟 변수(ARGS, REQUEST_URI 등), 연산자(@rx, @pm 등), 액션(deny, status, id, msg 등)을 명확히 지정하세요.\n"
        "3. 오탐을 최소화하는 방향으로 작성하세요.\n"
        "4. 최종 응답에는 반드시 완전한 SecRule 한 줄을 포함하세요.\n"
        "5. 코드블록은 사용하지 마세요.\n"
        "6. 가능하면 가장 구체적인 변수 스코프를 사용하고, 적절한 phase와 status:403을 포함하세요."
    )

    prompt = PromptTemplate.from_template(system_prompt + "\n\n사용자 요청: {input}")
    return prompt | llm


def generate_rule_with_llm_only(query: str) -> str:
    chain = _build_rule_chain()
    response = chain.invoke({"input": query})
    return getattr(response, "content", str(response))


def _sanitize_value(value: Optional[str], *, limit: int = MAX_BODY_CHARS) -> str:
    if value is None:
        return ""
    return str(value).replace("\r", " ").strip()[:limit]


def _format_request(req: AttackRequest, *, include_body: bool) -> str:
    parts = [
        f"- session_db_id: {req.session_db_id}",
        f"  method: {_sanitize_value(req.method, limit=32) or 'GET'}",
        f"  uri: {_sanitize_value(req.uri, limit=1024) or '/'}",
        f"  user_agent: {_sanitize_value(req.user_agent, limit=256) or '(empty)'}",
    ]
    if include_body and req.request_body:
        parts.append(f"  body: {_sanitize_value(req.request_body)}")
    return "\n".join(parts)


def _build_query(
    reqs: List[AttackRequest],
    *,
    label_mode: str,
    attack_type: str,
    include_body: bool,
) -> str:
    examples = "\n\n".join(
        _format_request(req, include_body=include_body)
        for req in reqs[:MAX_EXAMPLES_PER_RULE]
    )

    return (
        "아래는 DB에서 수집된 악성 HTTP 요청 샘플이다.\n"
        f"분류 라벨: {label_mode}\n"
        f"내부 공격 타입 매핑: {attack_type}\n"
        "이 샘플들에서 공통 패턴을 찾아 하나의 ModSecurity SecRule을 작성하라.\n"
        "출력은 운영에 넣을 수 있는 규칙이어야 하며, 너무 광범위한 탐지는 피하라.\n"
        "가능하면 샘플들의 공통적인 페이로드 위치와 패턴을 반영하라.\n\n"
        f"{examples}"
    )


def _extract_first_secrule(text: str) -> Optional[str]:
    if not text:
        return None
    match = SECRULE_LINE_RE.search(text.replace("```", "").strip())
    if not match:
        return None
    return match.group(0).strip()


def _split_actions(actions: str) -> List[str]:
    tokens: List[str] = []
    buf: List[str] = []
    quote: Optional[str] = None
    escape = False

    for ch in actions:
        if escape:
            buf.append(ch)
            escape = False
            continue
        if ch == "\\":
            buf.append(ch)
            escape = True
            continue
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in {"'", '"'}:
            buf.append(ch)
            quote = ch
            continue
        if ch == ",":
            token = "".join(buf).strip()
            if token:
                tokens.append(token)
            buf = []
            continue
        buf.append(ch)

    token = "".join(buf).strip()
    if token:
        tokens.append(token)
    return tokens


def _parse_secrule(secrule_text: str) -> Optional[ParsedSecRule]:
    match = SECRULE_PARSE_RE.match(secrule_text.strip())
    if not match:
        return None

    return ParsedSecRule(
        variables=match.group("variables").strip(),
        operator=match.group("operator").strip(),
        actions=_split_actions(match.group("actions")),
    )


def _find_first(actions: List[str], prefix: str) -> Optional[str]:
    for action in actions:
        if action.startswith(prefix):
            return action
    return None


def _find_all(actions: List[str], prefix: str) -> List[str]:
    return [action for action in actions if action.startswith(prefix)]


def _infer_phase(variables: str) -> str:
    upper = variables.upper()
    if any(token in upper for token in ["ARGS", "REQUEST_BODY", "XML"]):
        return "phase:2"
    return "phase:1"


def _extract_msg(msg_action: Optional[str], *, fallback: str) -> str:
    if not msg_action:
        return fallback
    _, _, value = msg_action.partition(":")
    return value.strip().strip("'").strip('"') or fallback


def _extract_severity(severity_action: Optional[str], *, fallback: str = "CRITICAL") -> str:
    if not severity_action:
        return fallback
    _, _, value = severity_action.partition(":")
    value = value.strip().strip("'").strip('"')
    return value or fallback


def _extract_tags(tag_actions: List[str]) -> List[str]:
    tags: List[str] = []
    for action in tag_actions:
        _, _, value = action.partition(":")
        cleaned = value.strip().strip("'").strip('"')
        if cleaned:
            tags.append(cleaned)
    return tags


def _extract_regex(operator: str) -> str:
    if operator.startswith("@rx "):
        return operator[4:].strip()
    if operator == "@rx":
        return ""
    return operator


def _extract_signature(reqs: List[AttackRequest], regex: str) -> List[str]:
    source = " ".join(
        filter(
            None,
            [regex]
            + [req.uri for req in reqs[:3]]
            + [req.request_body or "" for req in reqs[:2]],
        )
    ).lower()

    seen: List[str] = []
    for token in TOKEN_RE.findall(source):
        if token in seen:
            continue
        if token in {"http", "https", "get", "post", "args", "request_uri"}:
            continue
        seen.append(token)
        if len(seen) == 5:
            break
    return seen


def _build_actions(
    parsed: ParsedSecRule,
    *,
    rule_id: int,
    default_msg: str,
) -> List[str]:
    existing = parsed.actions
    transformations = [action for action in existing if action.startswith("t:")]
    phase = _find_first(existing, "phase:") or _infer_phase(parsed.variables)
    status = _find_first(existing, "status:") or "status:403"
    msg = _find_first(existing, "msg:") or f"msg:'{default_msg}'"
    severity = _find_first(existing, "severity:") or "severity:'CRITICAL'"
    tags = _find_all(existing, "tag:")

    used = set(transformations + tags)
    for single in [phase, status, msg, severity]:
        used.add(single)

    others = [
        action
        for action in existing
        if action not in used and action not in {"deny", "log"} and not action.startswith("id:")
    ]

    return [
        f"id:{rule_id}",
        phase,
        "deny",
        status,
        *transformations,
        msg,
        severity,
        *tags,
        *others,
        "log",
    ]


def _render_secrule(variables: str, operator: str, actions: List[str]) -> str:
    return f'SecRule {variables} "{operator}" "{",".join(actions)}"'


def generate_rules(
    rows: List[dict],
    *,
    n_clusters: int,
    base_rule_id: int,
    include_body_in_repr: bool = False,
) -> Tuple[List[GeneratedRule], int, int]:
    del n_clusters

    if not rows:
        return ([], 0, 0)

    reqs: List[AttackRequest] = []
    for row in rows:
        reqs.append(
            AttackRequest(
                session_db_id=int(row["session_db_id"]),
                method=str(row.get("method") or ""),
                uri=str(row.get("uri") or ""),
                user_agent=str(row.get("user_agent") or ""),
                label=str(row.get("label") or ""),
                request_body=(str(row.get("request_body")) if row.get("request_body") is not None else None),
            )
        )

    session_ids = [req.session_db_id for req in reqs]
    min_sid = min(session_ids)
    max_sid = max(session_ids)

    grouped: Dict[str, List[AttackRequest]] = {}
    for req in reqs:
        grouped.setdefault(req.label or "MALICIOUS", []).append(req)

    rules: List[GeneratedRule] = []

    for cluster_id, label_mode in enumerate(sorted(grouped.keys())):
        group = grouped[label_mode]
        attack_type = map_label_to_attack_type(label_mode)
        default_msg = f"Auto-generated {attack_type} rule (label {label_mode})"
        rule_id = base_rule_id + cluster_id

        query = _build_query(
            group,
            label_mode=label_mode,
            attack_type=attack_type,
            include_body=include_body_in_repr,
        )
        response_text = generate_rule_with_llm_only(query)
        secrule_text = _extract_first_secrule(response_text)
        if not secrule_text:
            continue

        parsed = _parse_secrule(secrule_text)
        if not parsed:
            continue

        actions = _build_actions(parsed, rule_id=rule_id, default_msg=default_msg)
        final_secrule = _render_secrule(parsed.variables, parsed.operator, actions)
        regex = _extract_regex(parsed.operator)
        severity = _extract_severity(_find_first(actions, "severity:"))
        tags = _extract_tags(_find_all(actions, "tag:"))
        msg = _extract_msg(_find_first(actions, "msg:"), fallback=default_msg)
        transformations = [action for action in actions if action.startswith("t:")]

        rules.append(
            GeneratedRule(
                rule_id=rule_id,
                cluster_id=cluster_id,
                attack_type=attack_type,
                label_mode=label_mode,
                signature=_extract_signature(group, regex),
                regex=regex,
                variables=parsed.variables,
                transformations=",".join(transformations),
                severity=severity,
                tags=",".join(tags),
                msg=msg,
                secrule_text=final_secrule,
            )
        )

    return (rules, min_sid, max_sid)
