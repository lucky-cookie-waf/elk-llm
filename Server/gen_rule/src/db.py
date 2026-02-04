# gen_rule/src/db.py
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Tuple

import psycopg
from psycopg.rows import dict_row


@dataclass
class LabeledRequest:
    session_db_id: int
    session_id: str
    label: str
    method: str
    uri: str
    user_agent: Optional[str]
    request_body: Optional[str]


def get_conn():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(db_url, row_factory=dict_row)


def ensure_tables(conn: psycopg.Connection) -> None:
    """
    - rule_gen_checkpoint:
        last_session_id: 중복 처리 방지용
        window_start_time: "다음으로 처리할 24h 구간" 시작 시각
        window_hours: 윈도우 길이(기본 24)
    - generated_rules: gen_rule이 만든 룰 후보 저장
    """
    window_hours_default = int(os.environ.get("WINDOW_HOURS", "24"))

    with conn.cursor() as cur:
        # 1) checkpoint 테이블
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS rule_gen_checkpoint (
              id INT PRIMARY KEY DEFAULT 1,
              last_session_id BIGINT NOT NULL DEFAULT 0,
              window_start_time TIMESTAMP NULL,
              window_hours INT NOT NULL DEFAULT 24,
              updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            """
        )

        # 최초 1회 row 생성
        # window_start_time은 "어제 00:00"으로 초기화(일 단위 배치에 적합)
        # - 하루 1회 돌릴 때, 전날 데이터를 먼저 처리하도록 설계
        cur.execute(
            """
            INSERT INTO rule_gen_checkpoint (id, last_session_id, window_start_time, window_hours)
            VALUES (
              1,
              0,
              date_trunc('day', NOW()) - INTERVAL '24 hours',
              %s
            )
            ON CONFLICT (id) DO NOTHING;
            """,
            (window_hours_default,),
        )

        # 2) generated_rules 테이블
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS generated_rules (
              id BIGSERIAL PRIMARY KEY,
              rule_id BIGINT NOT NULL,
              cluster_id INT NOT NULL,
              attack_type TEXT NOT NULL,
              label_mode TEXT NOT NULL,
              regex TEXT NOT NULL,
              variables TEXT NOT NULL,
              transformations TEXT NOT NULL,
              severity TEXT NOT NULL,
              tags TEXT NOT NULL,
              msg TEXT NOT NULL,
              secrule_text TEXT NOT NULL,
              source_min_session_db_id BIGINT NOT NULL,
              source_max_session_db_id BIGINT NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              UNIQUE(rule_id)
            );
            """
        )

    conn.commit()


def read_checkpoint(conn: psycopg.Connection) -> Tuple[int, datetime, int]:
    """
    returns:
      - last_session_id
      - window_start_time
      - window_hours
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT last_session_id, window_start_time, window_hours
            FROM rule_gen_checkpoint
            WHERE id=1;
            """
        )
        row = cur.fetchone()
        if not row or row["window_start_time"] is None:
            # 혹시라도 NULL이면 안전 기본값(어제 00:00)로
            with conn.cursor() as cur2:
                cur2.execute(
                    "SELECT date_trunc('day', NOW()) - INTERVAL '24 hours' AS t;"
                )
                trow = cur2.fetchone()
            return 0, trow["t"], int(os.environ.get("WINDOW_HOURS", "24"))

        return int(row["last_session_id"]), row["window_start_time"], int(row["window_hours"])


def update_checkpoint(
    conn: psycopg.Connection,
    last_session_id: int,
    next_window_start_time: datetime,
    window_hours: int,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE rule_gen_checkpoint
            SET last_session_id=%s,
                window_start_time=%s,
                window_hours=%s,
                updated_at=NOW()
            WHERE id=1;
            """,
            (last_session_id, next_window_start_time, window_hours),
        )
    conn.commit()


def fetch_labeled_attacks_for_window(
    conn: psycopg.Connection,
    after_session_id: int,
    limit: int,
    window_start_time: datetime,
    window_hours: int,
) -> List[LabeledRequest]:
    """
    ✅ 고정 24h window 기반 후보 조회:
      - 이미 처리한 건 제외: s.id > after_session_id (checkpoint)
      - window 범위만 조회: window_start_time <= end_time(or created_at) < window_end_time
      - 공격만: s.label != NORMAL
      - payload(method/uri/body)는 RawLog에서 가져옴 (대표 1개: 최신)

    window_end_time = window_start_time + window_hours
    """
    q = """
    SELECT
      s.id          AS session_db_id,
      s.session_id  AS session_id,
      s.label       AS label,
      rl.method     AS method,
      rl.uri        AS uri,
      COALESCE(rl.user_agent, s.user_agent) AS user_agent,
      rl.request_body AS request_body,
      COALESCE(s.end_time, s.created_at) AS session_time
    FROM "Session" s
    JOIN LATERAL (
      SELECT r.*
      FROM "RawLog" r
      WHERE r."sessionId" = s.id
      ORDER BY r.created_at DESC
      LIMIT 1
    ) rl ON TRUE
    WHERE s.label IS NOT NULL
      AND s.label <> 'NORMAL'
      AND s.id > %s
      AND COALESCE(s.end_time, s.created_at) >= %s
      AND COALESCE(s.end_time, s.created_at) <  (%s + (%s || ' hours')::interval)
    ORDER BY s.id ASC
    LIMIT %s;
    """

    with conn.cursor() as cur:
        cur.execute(q, (after_session_id, window_start_time, window_start_time, window_hours, limit))
        rows = cur.fetchall()

    out: List[LabeledRequest] = []
    for r in rows:
        out.append(
            LabeledRequest(
                session_db_id=int(r["session_db_id"]),
                session_id=str(r["session_id"]),
                label=str(r["label"]),
                method=str(r["method"] or ""),
                uri=str(r["uri"] or ""),
                user_agent=(str(r["user_agent"]) if r["user_agent"] is not None else None),
                request_body=(str(r["request_body"]) if r["request_body"] is not None else None),
            )
        )
    return out
