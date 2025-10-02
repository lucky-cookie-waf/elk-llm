import pandas as pd
from sklearn.model_selection import train_test_split
from collections import Counter

df = pd.read_csv("dataset/raw/sessionized_dataset.csv")


# 공격 타입 라벨링
def get_attack_type(row):
    if row.get("66 - SQL Injection", 0) == 1:
        return "SQL Injection"
    elif row.get("242 - Code Injection", 0) == 1:
        return "Code Injection"
    elif row.get("126 - Path Traversal", 0) == 1:
        return "Path Traversal"
    else:
        return "Normal"


df["attack_type"] = df.apply(get_attack_type, axis=1)

# 7:3 분할 (파인튜닝과 동일한 시드)
train, test = train_test_split(
    df, test_size=0.3, random_state=42, stratify=df["attack_type"]
)

# 저장
test.to_csv("dataset/test_split/test.csv", index=False)

print(f"Train: {len(train):,}개")
print(f"Test: {len(test):,}개")
print("\nTest 분포:")
print(test["attack_type"].value_counts())
