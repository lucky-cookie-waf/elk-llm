import pandas as pd
import requests
import time
from datetime import datetime
import random

BASE_URL = "http://localhost:8080"
TEST_CSV = "dataset/test_split/test.csv"
SAMPLE_SIZE = 1000  # 클래스당 250개 = 총 1000개
DELAY = 0.1

df = pd.read_csv(TEST_CSV)

# 클래스별 균등 샘플링
sampled_dfs = []
for label in ["Normal", "SQL Injection", "Code Injection", "Path Traversal"]:
    label_df = df[df["attack_type"] == label]
    n_samples = min(SAMPLE_SIZE // 4, len(label_df))
    sampled = label_df.sample(n=n_samples, random_state=42)
    sampled_dfs.append(sampled)

sample = pd.concat(sampled_dfs)
sample = sample.sample(frac=1, random_state=42).reset_index(drop=True)

print(f"샘플링 완료: {len(sample)}개")
print(sample["attack_type"].value_counts())

results = []

for idx, row in sample.iterrows():
    method = row["request_http_method"]
    path = row["request_http_request"]
    ua = row["request_user_agent"]
    body = row.get("request_body", "")

    if pd.isna(path):
        path = "/"
    if pd.isna(ua):
        ua = "Mozilla/5.0"
    if pd.isna(body):
        body = ""

    headers = {"User-Agent": ua}

    try:
        if method == "POST":
            resp = requests.post(
                f"{BASE_URL}{path}",
                data=body,
                headers=headers,
                timeout=5,
                allow_redirects=False,
            )
        else:
            resp = requests.get(
                f"{BASE_URL}{path}", headers=headers, timeout=5, allow_redirects=False
            )

        results.append(
            {
                "request_id": idx,
                "timestamp": datetime.now().isoformat(),
                "src_port": row["src_port"],
                "agent_group": row["agent_group"],
                "method": method,
                "path": path,
                "user_agent": ua,
                "status_code": resp.status_code,
                "actual_label": row["attack_type"],
            }
        )

        if len(results) % 100 == 0:
            print(f"[{len(results)}/{len(sample)}] 전송 중...")

    except Exception as e:
        print(f"Error at {idx}: {e}")
        results.append(
            {
                "request_id": idx,
                "timestamp": datetime.now().isoformat(),
                "src_port": row.get("src_port", 0),
                "agent_group": row.get("agent_group", "Unknown"),
                "method": method,
                "path": path,
                "user_agent": ua,
                "status_code": "ERROR",
                "actual_label": row["attack_type"],
            }
        )

    time.sleep(DELAY)

# 결과 저장
result_df = pd.DataFrame(results)
result_df.to_csv("results/sent_requests.csv", index=False)
print(f"\n완료! {len(results)}개 요청 전송")
print(f"결과 저장: results/sent_requests.csv")
