# gen_rule/src/export.py
from __future__ import annotations

import os
from typing import List, Optional

import psycopg

from .pipeline import GeneratedRule


# =========================
# DB Export
# =========================
def insert_generated_rules(
    conn: psycopg.Connection,
    rules: List[GeneratedRule],
    min_session_db_id: int,
    max_session_db_id: int,
) -> int:
    """
    generated_rules 테이블에 룰 후보를 저장한다.

    - rule_id는 UNIQUE 제약이 있으므로,
      이미 존재하는 rule_id는 자동으로 skip된다.
    - 반환값: 실제로 insert된 row 수
    """
    if not rules:
        return 0

    q = """
    INSERT INTO generated_rules (
      rule_id,
      cluster_id,
      attack_type,
      label_mode,
      regex,
      variables,
      transformations,
      severity,
      tags,
      msg,
      secrule_text,
      source_min_session_db_id,
      source_max_session_db_id
    )
    VALUES (
      %(rule_id)s,
      %(cluster_id)s,
      %(attack_type)s,
      %(label_mode)s,
      %(regex)s,
      %(variables)s,
      %(transformations)s,
      %(severity)s,
      %(tags)s,
      %(msg)s,
      %(secrule_text)s,
      %(source_min_session_db_id)s,
      %(source_max_session_db_id)s
    )
    ON CONFLICT (rule_id) DO NOTHING;
    """

    rows = []
    for r in rules:
        rows.append(
            {
                "rule_id": r.rule_id,
                "cluster_id": r.cluster_id,
                "attack_type": r.attack_type,
                "label_mode": r.label_mode,
                "regex": r.regex,
                "variables": r.variables,
                "transformations": r.transformations,
                "severity": r.severity,
                "tags": r.tags,
                "msg": r.msg,
                "secrule_text": r.secrule_text,
                "source_min_session_db_id": min_session_db_id,
                "source_max_session_db_id": max_session_db_id,
            }
        )

    inserted = 0
    with conn.cursor() as cur:
        for row in rows:
            cur.execute(q, row)
            if cur.rowcount == 1:
                inserted += 1

    conn.commit()
    return inserted


# =========================
# File Export
# =========================
def export_rules_to_file(
    rules: List[GeneratedRule],
    output_dir: Optional[str] = None,
) -> Optional[str]:
    """
    생성된 룰을 ModSecurity include 가능한 .conf 파일로 저장한다.

    - 기본 경로: /rules (docker-compose에서 volume mount)
    - 파일명: REQUEST-999-AUTO.conf
    """
    if not rules:
        return None

    out_dir = output_dir or os.environ.get("RULE_OUTPUT_DIR", "/rules")
    os.makedirs(out_dir, exist_ok=True)

    out_path = os.path.join(out_dir, "REQUEST-999-AUTO.conf")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("# ==================================================\n")
        f.write("#  Auto-generated ModSecurity Rules (gen_rule)\n")
        f.write("# ==================================================\n\n")

        for r in rules:
            f.write(r.secrule_text)
            f.write("\n\n")

    return out_path

