import pandas as pd
import requests
from tqdm import tqdm
import time
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ai_classifier.false_positive_filter import ConservativeFilter

MODSEC_RESULTS = "results/modsec_only_results.csv"
AI_ENDPOINT = "http://localhost:3002/api/classify"
OUTPUT = "results/modsec_ai_results.csv"

df = pd.read_csv(MODSEC_RESULTS)
print(f"총 {len(df)}개 요청 AI 분류 시작...")

fp_filter = ConservativeFilter()
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

    # 필터 적용
    corrected = fp_filter.apply(
        ai_prediction=ai_classification,
        path=row["path"],
        status_code=row.get("status_code", 200)
    )

    results.append({
        "request_id": row["request_id"],
        "ai_classification": ai_classification,
        "ai_confidence": ai_confidence,
        "ai_raw": ai_raw,
        "ai_corrected": corrected,
    })

    # rate limit
    time.sleep(0.05)

    if (idx + 1) % 50 == 0:
        errors = sum(1 for r in results if r["ai_classification"] == "Error")
        print(f"\n진행: {idx + 1}/{len(df)}, 에러: {errors}개")

# =======================
# 병합
# =======================
ai_df = pd.DataFrame(results)
merged = df.merge(ai_df, on="request_id", how="left")

# =======================
# ✅ AI 탐지 여부 정의 (수정된 부분)
#    → 공격 라벨만 True 로 간주
# =======================
ATTACK_LABELS = {
    "sql injection",
    "code injection",
    "path traversal",
    "attack",   # 혹시 generic 라벨 쓸 경우 대비
}

merged["ai_detected"] = (
    merged["ai_classification"]
    .astype(str)
    .str.strip()
    .str.lower()
    .isin(ATTACK_LABELS)
)

# 필터 적용 후 탐지 여부
merged["corrected_detected"] = (
    merged["ai_corrected"]
    .astype(str)
    .str.strip()
    .str.lower()
    .isin(ATTACK_LABELS)
)

# 결과 저장
merged.to_csv(OUTPUT, index=False)

print(f"\n완료! {OUTPUT}")
print(f"성공: {(merged['ai_classification'] != 'Error').sum()}/{len(merged)}")
print(f"AI 탐지 (원본): {merged['ai_detected'].sum()}/{len(merged)}")
print(f"AI 탐지 (필터 적용): {merged['corrected_detected'].sum()}/{len(merged)}")
print(f"필터로 보정: {(merged['ai_detected'].sum() - merged['corrected_detected'].sum())}건")
print(f"에러: {(merged['ai_classification'] == 'Error').sum()}/{len(merged)}")
