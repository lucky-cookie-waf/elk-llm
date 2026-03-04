"""
필터 테스트 및 성능 평가
기존 결과 CSV에 필터를 적용하고 성능 비교
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pandas as pd
from ai_classifier.false_positive_filter import ConservativeFilter

INPUT_CSV = "results/modsec_ai_results.csv"

print("="*80)
print("Conservative Filter 성능 평가")
print("="*80 + "\n")

# 데이터 로드
df = pd.read_csv(INPUT_CSV)
print(f"총 데이터: {len(df)}건\n")

# 필터 초기화
fp_filter = ConservativeFilter()

# 필터 적용
corrected = []
for idx, row in df.iterrows():
    pred = fp_filter.apply(
        ai_prediction=row['ai_classification'],
        path=row['path'],
        status_code=row['status_code']
    )
    corrected.append(pred)

df['ai_corrected'] = corrected

# 공격 라벨 정의
ATTACK_LABELS = {"sql injection", "code injection", "path traversal", "attack"}

df['corrected_detected'] = (
    df['ai_corrected']
    .astype(str)
    .str.strip()
    .str.lower()
    .isin(ATTACK_LABELS)
)

# 성능 계산
print("="*80)
print("False Positive (정상을 공격으로 오판)")
print("="*80)

normal_data = df[df['actual_label'] == 'Normal']
fp_before = normal_data[normal_data['ai_detected'] == True]
fp_after = normal_data[normal_data['corrected_detected'] == True]

print(f"필터 적용 전: {len(fp_before)}/{len(normal_data)}건 ({len(fp_before)/len(normal_data)*100:.1f}%)")
print(f"필터 적용 후: {len(fp_after)}/{len(normal_data)}건 ({len(fp_after)/len(normal_data)*100:.1f}%)")
print(f"개선:         {len(fp_before) - len(fp_after)}건 감소\n")

# 공격 탐지율
print("="*80)
print("공격 탐지율")
print("="*80)

for attack_type in ['Code Injection', 'SQL Injection', 'Path Traversal']:
    attack_data = df[df['actual_label'] == attack_type]

    detected_before = attack_data[attack_data['ai_detected'] == True]
    detected_after = attack_data[attack_data['corrected_detected'] == True]

    rate_before = len(detected_before) / len(attack_data) * 100
    rate_after = len(detected_after) / len(attack_data) * 100

    change = rate_after - rate_before
    arrow = "📉" if change < -0.1 else "📈" if change > 0.1 else "  "

    print(f"{attack_type:20s}: {rate_before:5.1f}% → {rate_after:5.1f}% {arrow} ({change:+.1f}%p)")

# 전체 성능
print("\n" + "="*80)
print("전체 성능")
print("="*80)

tp = len(df[(df['actual_label'] != 'Normal') & (df['corrected_detected'] == True)])
fp = len(df[(df['actual_label'] == 'Normal') & (df['corrected_detected'] == True)])
fn = len(df[(df['actual_label'] != 'Normal') & (df['corrected_detected'] == False)])
tn = len(df[(df['actual_label'] == 'Normal') & (df['corrected_detected'] == False)])

precision = tp / (tp + fp) if (tp + fp) > 0 else 0
recall = tp / (tp + fn) if (tp + fn) > 0 else 0
f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

print(f"Precision: {precision*100:.1f}%")
print(f"Recall:    {recall*100:.1f}%")
print(f"F1 Score:  {f1*100:.1f}%\n")

# 필터가 변경한 케이스 확인
print("="*80)
print("필터가 보정한 케이스")
print("="*80 + "\n")

changed = df[(df['ai_classification'] != df['ai_corrected']) & (df['actual_label'] == 'Normal')]
print(f"총 {len(changed)}건 보정\n")

if len(changed) > 0:
    print("샘플 (상위 10건):")
    for idx, row in changed.head(10).iterrows():
        print(f"\n{row['ai_classification']} → {row['ai_corrected']}")
        print(f"  경로: {row['path'][:80]}")
        print(f"  Status: {row['status_code']}")
