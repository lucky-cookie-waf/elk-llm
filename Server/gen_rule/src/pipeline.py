# gen_rule/src/pipeline.py
# 첨부한 pipeline.py 기반으로 gen_rule 서비스 코드에 바로 연결되도록 수정
# - 입력: rows(list[dict])  (DB에서 가져온 Session(label) + RawLog(method/uri/ua/body))
# - 출력: rules(list[GeneratedRule]), min_session_db_id, max_session_db_id
#
# 원본 구조(정규화→클러스터링→시그니처→regex) 유지 :contentReference[oaicite:1]{index=1}

from __future__ import annotations

import re
import urllib.parse
from collections import defaultdict, Counter
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans

# =========================
# Config
# =========================
MAX_TOKEN_LEN = 48
MAX_SIG_TOKENS = 3
MAX_RULE_REGEX_LEN = 700

# =========================
# Static Rules / Constants
# =========================
STOP_TOKENS = {
    "m",
    "p",
    "ua",
    "get",
    "post",
    "put",
    "delete",
    "http",
    "https",
    "ua=<browser>",
    "ua=<bot>",
    "ua=<unknown>",
    "<num>",
    "<id>",
    "and",
    "or",
}

ATTACK_PRIMITIVES = [
    "../",
    "<path>",
    "etc/passwd",
    "proc/self/environ",
    ";",
    "&&",
    "|",
    "`",
    "curl",
    "wget",
    "sh",
    "bash",
    "union",
    "select",
    "insert",
    "drop",
    "sleep(",
    "benchmark(",
]

PRIMITIVE_PRIORITY = [
    "../",
    "<path>",
    "etc/passwd",
    "union",
    "select",
    "sleep(",
    ";",
    "&&",
    "|",
    "`",
    "sh",
    "bash",
]

BOT_KEYWORDS = ["curl", "python", "sqlmap", "nikto", "wget", "go-http-client"]

TOKEN_RE = re.compile(r"[a-zA-Z0-9_<>\./=:\?-]+")

# =========================
# CRS-ish Rule Templates
# =========================
ATTACK_RULE_TEMPLATES = {
    "path_traversal": {
        "variables": "REQUEST_URI|ARGS",
        "transformations": ["t:urlDecodeUni", "t:normalizePath", "t:lowercase", "t:removeNulls"],
        "severity": "CRITICAL",
        "tags": ["attack-lfi", "attack-path-traversal"],
    },
    "code_injection": {
        "variables": "REQUEST_URI|ARGS|REQUEST_BODY",
        "transformations": ["t:urlDecodeUni", "t:lowercase", "t:removeNulls", "t:compressWhitespace"],
        "severity": "CRITICAL",
        "tags": ["attack-code-injection", "attack-rce"],
    },
    "sqli": {
        "variables": "ARGS|REQUEST_BODY",
        "transformations": ["t:urlDecodeUni", "t:lowercase", "t:replaceComments"],
        "severity": "CRITICAL",
        "tags": ["attack-sqli"],
    },
    "generic_attack": {
        "variables": "REQUEST_URI|ARGS|REQUEST_BODY",
        "transformations": ["t:urlDecodeUni", "t:lowercase", "t:removeNulls"],
        "severity": "ERROR",
        "tags": ["attack-generic"],
    },
}

# =========================
# Data Models
# =========================
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


# =========================
# Normalization
# =========================
def multi_decode(s: str, rounds: int = 3) -> str:
    prev = s
    for _ in range(rounds):
        cur = urllib.parse.unquote(prev)
        if cur == prev:
            break
        prev = cur
    return prev


def normalize_path(path: str) -> str:
    p = (path or "").lower()
    p = multi_decode(p)
    p = re.sub(r"\b\d+\b", "<num>", p)
    p = re.sub(r"\b[a-f0-9]{16,}\b", "<id>", p)
    p = p.replace("../", "../<path>")
    return p


def normalize_ua(ua: str) -> str:
    u = (ua or "").lower()
    for k in BOT_KEYWORDS:
        if k in u:
            return "<bot>"
    return "<browser>" if u else "<unknown>"


def build_req_repr(req: AttackRequest, *, include_body: bool = False, body_max_len: int = 160) -> str:
    """
    기본은 method+uri+ua로 표현(원본 유지).
    필요 시(include_body=True) body 일부를 추가해 body 기반 공격 패턴도 반영할 수 있음.
    """
    base = (
        f"m={req.method.lower()} "
        f"p={normalize_path(req.uri)} "
        f"ua={normalize_ua(req.user_agent)}"
    )
    if not include_body:
        return base

    body = (req.request_body or "").strip()
    if not body:
        return base

    body = multi_decode(body.lower())[:body_max_len]
    body = re.sub(r"\b\d+\b", "<num>", body)
    body = re.sub(r"\b[a-f0-9]{16,}\b", "<id>", body)
    return f"{base} b={body}"


# =========================
# Signature Extraction
# =========================
def extract_tokens(s: str) -> List[str]:
    return TOKEN_RE.findall(s)


def compress_path_token(t: str) -> str:
    # 원본 로직 유지: p= 로 시작하면 prefix만 남김
    if t.startswith("p="):
        parts = t[2:].split("/")
        return "p=" + "/".join(parts[:4])
    return t


def extract_signature(reqs: List[str], top_k: int) -> List[str]:
    counter: Counter = Counter()

    for r in reqs:
        for raw_t in extract_tokens(r):
            t = compress_path_token(raw_t.strip())
            if len(t) <= 2 or len(t) > MAX_TOKEN_LEN:
                continue
            if t in STOP_TOKENS:
                continue
            counter[t] += 1

    prims = [t for t in counter if any(p in t for p in PRIMITIVE_PRIORITY)]
    prims = sorted(prims, key=lambda t: (-counter[t], len(t)))

    rest = sorted([t for t in counter if t not in prims], key=lambda t: (-counter[t], len(t)))
    return (prims + rest)[:top_k]


def has_attack_primitive(tokens: List[str]) -> bool:
    joined = " ".join(tokens)
    return any(p in joined for p in ATTACK_PRIMITIVES)


# =========================
# Attack Type Mapping
# =========================
def map_label_to_attack_type(label: str) -> str:
    return {
        "SQL_INJECTION": "sqli",
        "CODE_INJECTION": "code_injection",
        "PATH_TRAVERSAL": "path_traversal",
        "MALICIOUS": "generic_attack",
    }.get(label, "generic_attack")


# =========================
# Regex & Rule Synthesis
# =========================
def synthesize_path_traversal_regex(tokens: List[str]) -> str:
    # 원본 기반 + 약간 안정화
    if "etc/passwd" in " ".join(tokens):
        return r"(\.\./){2,}.{0,200}etc/passwd"
    return r"(\.\./){2,}"


def synthesize_seq_regex(tokens: List[str], max_gap: int = 50) -> str | None:
    # ReDoS 완화: .* 대신 제한된 gap
    if len(tokens) < 2:
        return None
    regex = re.escape(tokens[0])
    for t in tokens[1:]:
        regex += f".{{0,{max_gap}}}" + re.escape(t)
    return regex


def synthesize_regex(attack_type: str, signature: List[str]) -> str | None:
    if attack_type == "path_traversal":
        return synthesize_path_traversal_regex(signature)
    return synthesize_seq_regex(signature)


def build_secrule(
    *,
    rule_id: int,
    variables: str,
    regex: str,
    transformations: List[str],
    severity: str,
    tags: List[str],
    msg: str,
) -> str:
    """
    CRS 스타일의 SecRule 문자열을 생성.
    """
    t_chain = ",".join(transformations)
    actions = [
        f"id:{rule_id}",
        "phase:2",
        "deny",
        "log",
        f"msg:'{msg}'",
        f"severity:{severity}",
    ] + [f"tag:'{t}'" for t in tags]
    return f'SecRule {variables} "@rx {regex}" "{t_chain},{",".join(actions)}"'


# =========================
# Main Pipeline Entry (gen_rule 호환)
# =========================
def generate_rules(
    rows: List[dict],
    *,
    n_clusters: int,
    base_rule_id: int,
    include_body_in_repr: bool = False,
) -> Tuple[List[GeneratedRule], int, int]:
    """
    gen_rule/main.py에서 바로 호출 가능한 엔트리.

    rows: DB에서 가져온 dict list
      required keys:
        - session_db_id (int)
        - label (str)
        - method (str)
        - uri (str)
        - user_agent (str|None)
        - request_body (str|None) [optional]

    return: (rules, min_session_db_id, max_session_db_id)
    """
    if not rows:
        return ([], 0, 0)

    # 1) rows -> AttackRequest
    reqs: List[AttackRequest] = []
    for r in rows:
        reqs.append(
            AttackRequest(
                session_db_id=int(r["session_db_id"]),
                method=str(r.get("method") or ""),
                uri=str(r.get("uri") or ""),
                user_agent=str(r.get("user_agent") or ""),
                label=str(r.get("label") or ""),
                request_body=(str(r.get("request_body")) if r.get("request_body") is not None else None),
            )
        )

    # min/max for checkpoint bookkeeping (Session.id 기준)
    df = pd.DataFrame([{"session_db_id": x.session_db_id} for x in reqs])
    min_sid = int(df["session_db_id"].min())
    max_sid = int(df["session_db_id"].max())

    # 2) req_repr 생성
    req_reprs = [build_req_repr(r, include_body=include_body_in_repr) for r in reqs]

    # 샘플이 너무 적으면 clustering이 불안정할 수 있음
    # min_df=2 때문에 feature가 비게 될 수도 있어서 보호
    if len(req_reprs) < 2:
        return ([], min_sid, max_sid)

    # 3) Clustering
    vectorizer = TfidfVectorizer(
        analyzer="char",
        ngram_range=(3, 5),
        min_df=2,
    )
    X = vectorizer.fit_transform(req_reprs)

    # n_clusters가 샘플 수보다 크면 KMeans 에러 -> 자동 조정
    k = min(n_clusters, X.shape[0])
    if k < 2:
        return ([], min_sid, max_sid)

    kmeans = KMeans(
        n_clusters=k,
        random_state=42,
        n_init="auto",
    )
    cluster_ids = kmeans.fit_predict(X)

    # cluster -> (repr list, label list)
    clusters_repr: Dict[int, List[str]] = defaultdict(list)
    clusters_label: Dict[int, List[str]] = defaultdict(list)

    for cid, repr_, req in zip(cluster_ids, req_reprs, reqs):
        clusters_repr[int(cid)].append(repr_)
        clusters_label[int(cid)].append(req.label)

    # 4) Signature + Rule 생성
    rules: List[GeneratedRule] = []

    for cid, repr_list in clusters_repr.items():
        sig = extract_signature(repr_list, MAX_SIG_TOKENS)
        if not sig or not has_attack_primitive(sig):
            continue

        # ✅ 기존 버그 수정: cluster별 label 다수결 사용 (원본은 attack_requests[0].label 고정) :contentReference[oaicite:2]{index=2}
        label_mode = Counter(clusters_label[cid]).most_common(1)[0][0]
        attack_type = map_label_to_attack_type(label_mode)

        regex = synthesize_regex(attack_type, sig)
        if not regex or len(regex) > MAX_RULE_REGEX_LEN:
            continue

        template = ATTACK_RULE_TEMPLATES[attack_type]
        rule_id = base_rule_id + cid
        msg = f"Auto-generated {attack_type} rule (cluster {cid}, label {label_mode})"

        secrule = build_secrule(
            rule_id=rule_id,
            variables=template["variables"],
            regex=regex,
            transformations=template["transformations"],
            severity=template["severity"],
            tags=template["tags"],
            msg=msg,
        )

        rules.append(
            GeneratedRule(
                rule_id=rule_id,
                cluster_id=cid,
                attack_type=attack_type,
                label_mode=label_mode,
                signature=sig,
                regex=regex,
                variables=template["variables"],
                transformations=",".join(template["transformations"]),
                severity=template["severity"],
                tags=",".join(template["tags"]),
                msg=msg,
                secrule_text=secrule,
            )
        )

    return (rules, min_sid, max_sid)

