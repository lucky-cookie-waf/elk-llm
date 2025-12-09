import pandas as pd
import requests
from tqdm import tqdm
import time

MODSEC_RESULTS = "results/modsec_only_results.csv"
AI_ENDPOINT = "http://localhost:3002/api/classify"
OUTPUT = "results/modsec_ai_results.csv"

df = pd.read_csv(MODSEC_RESULTS)
print(f"총 {len(df)}개 요청 AI 분류 시작...")

results = []

for idx, row in tqdm(df.iterrows(), total=len(df)):
    session_data = {
        "session": [
            {
                "request_http_method": row["method"],
                "request_http_request": row["path"],
                "request_body": "",
                "user_agent": (str(row["user_agent"]) if pd.notna(row["user_agent"]) else "")
            }
        ]
    }

    try:
        response = requests.post(AI_ENDPOINT, json=session_data, timeout=30)

        if response.status_code == 200:
            data = response.json()

            # success 검사 제거 — JSON만 오면 정상 처리
            ai_classification = data.get("classification", "Unknown")
            ai_confidence = data.get("confidence", "low")
            ai_raw = data.get("raw_response", data)

        else:
            ai_classification = "Error"
            ai_confidence = "low"
            ai_raw = f"HTTP {response.status_code}"

    except requests.exceptions.Timeout:
        ai_classification = "Error"
        ai_confidence = "low"
        ai_raw = "Timeout (30s)"

    except Exception as e:
        ai_classification = "Error"
        ai_confidence = "low"
        ai_raw = str(e)[:200]

    results.append({
        "request_id": row["request_id"],
        "ai_classification": ai_classification,
        "ai_confidence": ai_confidence,
        "ai_raw": ai_raw,
    })

    # rate limit
    time.sleep(0.05)

    if (idx + 1) % 50 == 0:
        errors = sum(1 for r in results if r["ai_classification"] == "Error")
        print(f"\n진행: {idx + 1}/{len(df)}, 에러: {errors}개")

# 병합
ai_df = pd.DataFrame(results)
merged = df.merge(ai_df, on="request_id", how="left")

# AI 탐지 여부
merged["ai_detected"] = merged["ai_classification"].apply(
    lambda x: str(x).strip().lower() not in ["normal", "unknown", "error", ""]
)

merged.to_csv(OUTPUT, index=False)

print(f"\n완료! {OUTPUT}")
print(f"성공: {(merged['ai_classification'] != 'Error').sum()}/{len(merged)}")
print(f"AI 탐지: {merged['ai_detected'].sum()}/{len(merged)}")
print(f"에러: {(merged['ai_classification'] == 'Error').sum()}/{len(merged)}")
