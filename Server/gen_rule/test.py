import pandas as pd
import os
import time

# tqdm 라이브러리가 없다면 pip install tqdm 으로 설치해주세요
from tqdm import tqdm

# gpt_generator.py 파일이 이 스크립트와 같은 폴더에 있어야 합니다
from gpt_generator import generate_modsec_rule

# ===== 설정 (절대 경로 수정됨) =====
# r"..."을 사용하여 윈도우 경로의 백슬래시(\)를 안전하게 처리합니다.
INPUT_CSV = r"D:\elk-llm\Server\results\missed_attacks.csv"
OUTPUT_CSV = r"D:\elk-llm\Server\results\missed_attacks_with_rules.csv"


def format_log_from_row(row):
    """
    CSV의 한 행(row)을 LLM 프롬프트용 로그 텍스트로 변환
    """
    method = row.get("method", "GET")
    uri = row.get("path", "/")
    user_agent = row.get("user_agent", "Unknown")

    # 가상의 로그 포맷 생성
    log_text = f"Session Info (Simulated from CSV)\n"
    log_text += f"User Agent: {user_agent}\n\n"
    log_text += "=== Request Logs ===\n"
    log_text += f"\nRequest #1:\n"
    log_text += f"{method} {uri}\n"

    # POST일 경우 페이로드 정보가 CSV에 없다면 안내 문구 추가
    if method.upper() == "POST":
        log_text += "Body: (Payload might be in URL parameters or missing in CSV)\n"

    log_text += f"Headers:\n  Host: example.com\n  User-Agent: {user_agent}\n"

    return log_text


def main():
    # 1. CSV 로드 확인
    if not os.path.exists(INPUT_CSV):
        print(f"❌ Input file not found: {INPUT_CSV}")
        print("경로를 다시 확인해주세요.")
        return

    print(f"📂 Loading data from: {INPUT_CSV}")
    try:
        df = pd.read_csv(INPUT_CSV)
    except Exception as e:
        print(f"❌ Failed to read CSV: {e}")
        return

    # (옵션) 테스트를 위해 처음 5개만 실행하려면 아래 주석을 해제하세요
    # df = df.head(5)

    print(f"🚀 Starting batch rule generation for {len(df)} attacks...")

    generated_rules = []

    # 2. 각 행별로 룰 생성 (tqdm으로 진행바 표시)
    for index, row in tqdm(df.iterrows(), total=df.shape[0]):
        try:
            attack_type = row.get("actual_label", "Unknown Attack")
            logs_text = format_log_from_row(row)

            # LLM 호출 (gpt_generator.py)
            rule = generate_modsec_rule(logs_text, attack_type)
            generated_rules.append(rule)

            # API 속도 제한 방지를 위한 짧은 대기 (필요 시 조절)
            time.sleep(0.5)

        except Exception as e:
            print(f"\n❌ Error at index {index}: {e}")
            generated_rules.append(f"Error: {e}")

    # 3. 결과 컬럼 추가 및 저장
    df["generated_rule"] = generated_rules

    try:
        print(f"💾 Saving results to: {OUTPUT_CSV}")
        df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
        print("✅ Done! Success.")
    except Exception as e:
        print(f"❌ Failed to save CSV: {e}")
        print("파일이 열려있는지 확인하거나 권한을 확인해주세요.")


if __name__ == "__main__":
    main()
