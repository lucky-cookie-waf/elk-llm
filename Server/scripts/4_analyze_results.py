import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix

df = pd.read_csv("results/modsec_only_results.csv")

# 탐지되면 실제 라벨을 맞췄다고 가정 (단순화)
df["modsec_prediction"] = df.apply(
    lambda x: x["actual_label"] if x["modsec_detected"] else "Normal", axis=1
)

print("❤️ ModSecurity 성능 분석 ❤️\n")

# Confusion Matrix
print("Confuxion Matrix:")
print(
    confusion_matrix(
        df["actual_label"],
        df["modsec_prediction"],
        labels=["Normal", "SQL Injection", "Code Injection", "Path Traversal"],
    )
)

print("\n상세 리포트:")
print(
    classification_report(df["actual_label"], df["modsec_prediction"], zero_division=0)
)

# False Negatives (놓친 공격들)
fn = df[(df["actual_label"] != "Normal") & (~df["modsec_detected"])]
print(f"\n놓친 공격: {len(fn)}개")
print(fn[["path", "actual_label", "method"]].head(10))

# 생성 모델의 룰 생성 타겟
fn.to_csv("results/missed_attacks.csv", index=False)
print("\n저장: results/missed_attacks.csv (생성 모델용)")
