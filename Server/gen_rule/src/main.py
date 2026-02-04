# gen_rule/src/main.py
# 방식 2: "하루 1회 실행 → (완성된 24h window가 있으면) 처리 → 종료"
# 운영: cron 등으로 `docker compose run --rm gen_rule` 형태로 하루 1번 실행 권장

from __future__ import annotations

import os
from datetime import timedelta

from dotenv import load_dotenv

from .db import (
    get_conn,
    ensure_tables,
    read_checkpoint,
    update_checkpoint,
    fetch_labeled_attacks_for_window,
)
from .pipeline import generate_rules
from .export import insert_generated_rules, export_rules_to_file


def main():
    load_dotenv()

    # 조회/윈도우
    batch_size = int(os.environ.get("BATCH_SIZE", "5000"))
    window_hours = int(os.environ.get("WINDOW_HOURS", "24"))
    max_windows_per_run = int(os.environ.get("MAX_WINDOWS_PER_RUN", "1"))  # 밀린 경우 catch-up 용

    # 룰 생성 파라미터
    n_clusters = int(os.environ.get("N_CLUSTERS", "10"))
    base_rule_id = int(os.environ.get("BASE_RULE_ID", "200000"))
    include_body_in_repr = os.environ.get("INCLUDE_BODY_IN_REPR", "0").strip().lower() in {"1", "true", "yes", "y"}

    with get_conn() as conn:
        ensure_tables(conn)

        processed_windows = 0

        while processed_windows < max_windows_per_run:
            last_id, window_start, wh_db = read_checkpoint(conn)
            wh = int(wh_db)  # DB 저장값 우선
            window_end = window_start + timedelta(hours=wh)

            # DB 서버 기준 현재 시각
            with conn.cursor() as cur:
                cur.execute("SELECT NOW() AS now;")
                now = cur.fetchone()["now"]

            # ✅ "완성된 window"가 아니면 아무 것도 하지 않고 종료
            if now < window_end:
                print(
                    f"[gen_rule] window not ready: {window_start} ~ {window_end} (now={now}). exit."
                )
                return

            # 1) 이번 window 범위에서 후보 조회
            items = fetch_labeled_attacks_for_window(
                conn,
                after_session_id=last_id,
                limit=batch_size,
                window_start_time=window_start,
                window_hours=wh,
            )

            if not items:
                # window 안에 공격 세션이 없어도 window는 소비(advance)해야 다음날로 넘어감
                print(
                    f"[gen_rule] no attack sessions in window {window_start} ~ {window_end}. advance and continue."
                )
                update_checkpoint(conn, last_session_id=last_id, next_window_start_time=window_end, window_hours=wh)
                processed_windows += 1
                continue

            rows = [
                {
                    "session_db_id": x.session_db_id,
                    "label": x.label,
                    "method": x.method,
                    "uri": x.uri,
                    "user_agent": x.user_agent,
                    "request_body": x.request_body,
                }
                for x in items
            ]

            # 2) 룰 생성
            rules, min_sid, max_sid = generate_rules(
                rows,
                n_clusters=n_clusters,
                base_rule_id=base_rule_id,
                include_body_in_repr=include_body_in_repr,
            )

            # 3) 저장(DB + 파일)
            inserted = insert_generated_rules(conn, rules, min_sid, max_sid)
            out_path = export_rules_to_file(rules)

            # 4) checkpoint 갱신:
            # - last_session_id: 이번 window에서 본 것 중 max_sid로 갱신(중복 방지)
            # - window_start_time: 다음 window로 이동(window_end)
            update_checkpoint(conn, last_session_id=max_sid, next_window_start_time=window_end, window_hours=wh)

            print(
                f"[gen_rule] window={window_start}~{window_end} | "
                f"fetched={len(rows)} (sid {min_sid}->{max_sid}) | "
                f"rules_generated={len(rules)} rules_inserted={inserted} | "
                f"checkpoint_last_session_id={max_sid} | next_window_start={window_end} | "
                f"file={out_path}"
            )

            processed_windows += 1

    print("[gen_rule] done. exit.")


if __name__ == "__main__":
    main()

