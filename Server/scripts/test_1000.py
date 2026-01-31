import pandas as pd

TEST_CSV = "dataset/test_split/test.csv"
OUT_CSV  = "dataset/test_split/test_sampled_1000_for_replay.csv"

RANDOM_STATE = 42
PER_CLASS = 250

df = pd.read_csv(TEST_CSV)

# 1) 공격 판단/재현에 중요한 컬럼들 (body는 필수 x)
required = [
    "timestamp",
    "src_ip",
    "src_port",
    "request_http_method",
    "request_http_request",
    "request_user_agent",
    "agent_group",
    "attack_type",
]

required_existing = [c for c in required if c in df.columns]
df2 = df.dropna(subset=required_existing).copy()

# 2) 빈 문자열 제거 (요청 생성에 필수인 것만)
for c in ["request_http_method", "request_http_request", "request_user_agent", "agent_group"]:
    df2 = df2[df2[c].astype(str).str.strip() != ""]

df2 = df2[pd.to_numeric(df2["src_port"], errors="coerce").fillna(0).astype(int) > 0]

labels = ["Normal", "SQL Injection", "Code Injection", "Path Traversal"]
picked = []

for lab in labels:
    sub = df2[df2["attack_type"] == lab]

    # 3-1) body 있는 row 우선
    with_body = sub[sub["request_body"].astype(str).str.strip() != ""]
    without_body = sub[sub["request_body"].astype(str).str.strip() == ""]

    take_with = min(len(with_body), PER_CLASS)
    part1 = with_body.sample(n=take_with, random_state=RANDOM_STATE) if take_with > 0 else pd.DataFrame()

    remain = PER_CLASS - take_with
    if remain > 0:
        part2 = without_body.sample(n=remain, random_state=RANDOM_STATE)
        part = pd.concat([part1, part2])
    else:
        part = part1

    if len(part) < PER_CLASS:
        raise RuntimeError(f"{lab}: {PER_CLASS}개를 채울 수 없습니다 (총 {len(sub)}개)")

    picked.append(part)

sample = (
    pd.concat(picked)
      .sample(frac=1, random_state=RANDOM_STATE)
      .reset_index(drop=True)
)

# 4) 컬럼은 줄이지 않고 전부 저장 (거의 대부분의 컬럼 포함)
sample.to_csv(OUT_CSV, index=False)

print("샘플링 완료:", len(sample))
print(sample["attack_type"].value_counts())
print("저장:", OUT_CSV)
