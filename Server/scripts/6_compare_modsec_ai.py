import pandas as pd

df = pd.read_csv("results/modsec_ai_results.csv")

print("ModSecurity + AI 통합 시스템 성능 분석")

# 기본 통계
attack_df = df[df["actual_label"] != "Normal"]
error_count = (df["ai_classification"] == "Error").sum()

if error_count > 0:
    print(f"\n⚠️ AI 분류 에러: {error_count}개 (분석에서 제외됨)")
    print("에러 발생 시 ModSecurity 결과만 사용\n")

# 1. ModSecurity 단독
print("❤️ Baseline: ModSecurity 단독 ❤️")
modsec_total = df["modsec_detected"].sum()
modsec_attack = df[df["actual_label"] != "Normal"]["modsec_detected"].sum()
print(f"전체 탐지: {modsec_total}/{len(df)} ({modsec_total/len(df)*100:.1f}%)")
print(
    f"공격 탐지: {modsec_attack}/{len(attack_df)} ({modsec_attack/len(attack_df)*100:.1f}%)"
)

# 2. 통합 시스템
print("\n🤍 통합: ModSecurity + AI 🤍")
df["combined_detected"] = df["modsec_detected"] | df["ai_detected"]
combined_total = df["combined_detected"].sum()
combined_attack = df[df["actual_label"] != "Normal"]["combined_detected"].sum()
print(f"전체 탐지: {combined_total}/{len(df)} ({combined_total/len(df)*100:.1f}%)")
print(
    f"공격 탐지: {combined_attack}/{len(attack_df)} ({combined_attack/len(attack_df)*100:.1f}%)"
)

# 3. 클래스별
print("\n🚨 클래스별 탐지율 비교")
print(f"{'클래스':<20} {'Baseline':<12} {'통합':<12} {'개선':<10}")
print("-" * 54)

for label in sorted(df["actual_label"].unique()):
    label_df = df[df["actual_label"] == label]
    baseline = label_df["modsec_detected"].sum() / len(label_df) * 100
    combined = label_df["combined_detected"].sum() / len(label_df) * 100
    improvement = combined - baseline

    print(
        f"{label:<20} {baseline:>6.1f}%      {combined:>6.1f}%      {improvement:>+5.1f}%p"
    )

# 4. AI 기여도
ai_only = df[
    (df["actual_label"] != "Normal") & (~df["modsec_detected"]) & (df["ai_detected"])
]

print(f"\n【AI 추가 탐지 공격】: {len(ai_only)}개")
if len(ai_only) > 0:
    print("\n공격 타입별:")
    for label in sorted(ai_only["actual_label"].unique()):
        count = len(ai_only[ai_only["actual_label"] == label])
        print(f"  {label}: {count}개")

    print(f"\n샘플 (처음 5개):")
    sample = ai_only[["path", "actual_label", "ai_classification"]].head(5)
    for idx, row in sample.iterrows():
        print(f"  {row['actual_label']}: {row['path'][:60]}...")

    ai_only.to_csv("results/ai_additional_detections.csv", index=False)
    print(f"\n저장: results/ai_additional_detections.csv")

# 5. 여전히 놓침
both_missed = df[(df["actual_label"] != "Normal") & (~df["combined_detected"])]

print(f"\n【여전히 놓친 공격】: {len(both_missed)}개")
if len(both_missed) > 0:
    print("\n공격 타입별:")
    for label in sorted(both_missed["actual_label"].unique()):
        count = len(both_missed[both_missed["actual_label"] == label])
        print(f"  {label}: {count}개")

    both_missed.to_csv("results/both_missed.csv", index=False)
    print(f"저장: results/both_missed.csv")

# 6. 개선 요약
print("\n【성능 개선 요약】")
improvement = combined_attack - modsec_attack
improvement_pct = improvement / len(attack_df) * 100

print(f"Baseline: {modsec_attack}/{len(attack_df)} 공격 탐지")
print(f"AI 기여: +{len(ai_only)}개")
print(f"통합: {combined_attack}/{len(attack_df)} 공격 탐지")
print(f"개선율: +{improvement_pct:.1f}%p")

print("\n" + "=" * 70)
