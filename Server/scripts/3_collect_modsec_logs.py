import pandas as pd
import re
from collections import defaultdict
from urllib.parse import unquote

ERROR_LOG = "./modsec_logs/error.log"
SENT_REQUESTS = "results/sent_requests.csv"

sent_df = pd.read_csv(SENT_REQUESTS)
print(f"전송된 요청: {len(sent_df)}개")


# error.log에서 룰 매칭 정보 추출 (unique_id별로 그룹핑)
def parse_error_log(log_path):
    events = defaultdict(
        lambda: {"matched_rules": set(), "blocked": False, "uri": None}
    )

    print("error.log 파싱 중...")
    with open(log_path, "r", errors="ignore") as f:
        for line in f:
            if "ModSecurity" not in line:
                continue

            uid_match = re.search(r'\[unique_id "([^"]+)"\]', line)
            if not uid_match:
                continue
            uid = uid_match.group(1)

            rule_match = re.search(r'\[id "(\d+)"\]', line)
            if rule_match:
                events[uid]["matched_rules"].add(rule_match.group(1))

            uri_match = re.search(r'\[uri "([^"]+)"\]', line)
            if uri_match:
                events[uid]["uri"] = uri_match.group(1)

            if "Access denied" in line:
                events[uid]["blocked"] = True

    results = []
    for uid, data in events.items():
        results.append(
            {
                "unique_id": uid,
                "uri": data["uri"],
                "modsec_detected": len(data["matched_rules"]) > 0,
                "modsec_blocked": data["blocked"],
                "matched_rule_ids": ",".join(sorted(data["matched_rules"])),
                "rule_count": len(data["matched_rules"]),
            }
        )

    return pd.DataFrame(results)


error_df = parse_error_log(ERROR_LOG)
print(f"고유 unique_id: {len(error_df)}개")

# URI 디코딩
sent_df["path_decoded"] = sent_df["path"].apply(lambda x: unquote(str(x)))

# 매칭
merged = sent_df.merge(error_df, left_on="path_decoded", right_on="uri", how="left")

# ★ 중복 제거: request_id 기준으로 첫 번째만 유지
print(f"merge 전: {len(merged)}개")
merged = merged.drop_duplicates(subset=["request_id"], keep="first")
print(f"중복 제거 후: {len(merged)}개")

merged["modsec_detected"] = merged["modsec_detected"].fillna(False).astype(bool)
merged["modsec_blocked"] = merged["modsec_blocked"].fillna(False).astype(bool)
merged["matched_rule_ids"] = merged["matched_rule_ids"].fillna("")
merged["rule_count"] = merged["rule_count"].fillna(0).astype(int)

# 저장
output_cols = [
    "request_id",
    "timestamp",
    "method",
    "path",
    "user_agent",
    "status_code",
    "actual_label",
    "modsec_detected",
    "modsec_blocked",
    "matched_rule_ids",
    "rule_count",
]
merged[output_cols].to_csv("results/modsec_only_results.csv", index=False)

print("\n❤️ ModSecurity 단독 성능 ❤️")
print(f"총 요청: {len(merged)}")
print(f"탐지됨: {merged['modsec_detected'].sum()}")
print(f"차단됨: {merged['modsec_blocked'].sum()}")

print("\n클래스별 탐지율:")
for label in sorted(merged["actual_label"].unique()):
    label_df = merged[merged["actual_label"] == label]
    detected = label_df["modsec_detected"].sum()
    total = len(label_df)
    print(f"  {label}: {detected}/{total} ({detected/total*100:.1f}%)")

# False Negatives (놓친 공격)
fn = merged[(merged["actual_label"] != "Normal") & (~merged["modsec_detected"])]
print(f"\n놓친 공격: {len(fn)}개")
fn[["path", "actual_label", "method"]].head(10).to_csv(
    "results/missed_attacks_preview.csv", index=False
)

print("\n결과 저장: results/modsec_only_results.csv")
