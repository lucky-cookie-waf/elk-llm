import pandas as pd
import subprocess, shlex, time
from datetime import datetime

CSV_PATH = "dataset/test_split/test_sampled_1000_for_replay.csv"  # ✅ 첨부한 파일 경로로
BASE_URL = "http://localhost:8080"             # ✅ 아파치+ModSec 주소로 변경
SLEEP_SEC = 0.03                               # ✅ 너무 빠르면 서버/로그 누락 가능(필요 시 0.05~0.1)

df = pd.read_csv(CSV_PATH)

run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
print("RUN_ID =", run_id, "rows =", len(df))

def curl_request(method: str, url: str, ua: str, referer: str, body: str, tag: str):
    headers = []
    if ua:
        headers += ["-H", f"User-Agent: {ua}"]
    if referer:
        headers += ["-H", f"Referer: {referer}"]

    # ✅ 실험 식별자(로그에서 필터링용). UA 보존이 중요하면 header로만 태깅하는 게 깔끔함.
    headers += ["-H", f"X-Replay-Run: {run_id}"]
    headers += ["-H", f"X-Replay-Row: {tag}"]

    cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
           "--path-as-is", "-X", method.upper(), url] + headers

    # body가 있으면 전송(없으면 생략)
    if body is not None and str(body).strip() != "" and str(body).lower() != "nan":
        cmd += ["--data-raw", str(body)]

    try:
        out = subprocess.check_output(cmd, timeout=20).decode().strip()
        return out
    except Exception:
        return "ERR"

ok = 0
err = 0

for i, r in df.iterrows():
    method = str(r.get("request_http_method", "GET") or "GET")
    path = str(r.get("request_http_request", "/") or "/")
    ua = str(r.get("request_user_agent", "") or "")
    referer = str(r.get("request_referer", "") or "")
    body = r.get("request_body", None)

    url = BASE_URL + path
    tag = f'{i}_{r.get("attack_type","")}'
    status = curl_request(method, url, ua, referer, body, tag)

    if status == "ERR":
        err += 1
    else:
        ok += 1

    if (i + 1) % 100 == 0:
        print(f"[{i+1}/{len(df)}] http_ok={ok} err={err}")

    time.sleep(SLEEP_SEC)

print("DONE. http_ok=", ok, "err=", err)
print("RUN_ID =", run_id)
