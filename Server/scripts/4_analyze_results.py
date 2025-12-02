import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix

df = pd.read_csv("results/modsec_only_results.csv")

# 탐지되면 실제 라벨을 맞췄다고 가정 (단순화)
df["modsec_prediction"] = df["modsec_detected"].apply(
    lambda x: "Attack" if x else "Normal"
)
df["binary_actual"] = df["actual_label"].apply(
    lambda x: "Normal" if x == "Normal" else "Attack"
)

print("❤️ ModSecurity 성능 분석 ❤️\n")

# Confusion Matrix
print("Confuxion Matrix:")
print(
    confusion_matrix(
        df["binary_actual"], df["modsec_prediction"], labels=["Normal", "Attack"]
    )
)

print("\n상세 리포트:")
print(classification_report(df["binary_actual"], df["modsec_prediction"]))

# False Negatives (놓친 공격들)
fn = df[(df["actual_label"] != "Normal") & (~df["modsec_detected"])]
print(f"\n놓친 공격: {len(fn)}개")
print(fn[["path", "actual_label", "method"]].head(10))

# 생성 모델의 룰 생성 타겟
fn.to_csv("results/missed_attacks.csv", index=False)
print("\n저장: results/missed_attacks.csv (생성 모델용)")
