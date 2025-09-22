#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse, csv, requests, time, random  # ← random 추가

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--target", default="http://localhost:8080")
    ap.add_argument("--limit", type=int, default=1000)
    ap.add_argument("--sleep", type=float, default=0.0, help="seconds between requests")
    # ▼ 추가: 저장 없이 무작위 표본 N개만 뽑기 (N = --limit)
    ap.add_argument("--reservoir", action="store_true",
                    help="sample N rows in-memory via reservoir sampling (N = --limit)")
    ap.add_argument("--seed", type=int, default=None,
                    help="random seed for reproducible sampling (optional)")
    args = ap.parse_args()

    sent = 0
    with open(args.dataset, encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)

        if args.reservoir:
            n = max(0, args.limit)
            rng = random.Random(args.seed)
            reservoir = []  # (orig_index, row)로 저장해서 원래 순서 보존 가능
            for i, row in enumerate(r, start=1):
                if len(reservoir) < n:
                    reservoir.append((i, row))
                else:
                    j = rng.randrange(i)  # 0..i-1
                    if j < n:
                        reservoir[j] = (i, row)
            # 보낼 때는 원래 CSV 등장 순서대로 정렬(원하면 여기서 rng.shuffle(reservoir)로 무작위 전송도 가능)
            reservoir.sort(key=lambda t: t[0])
            iterable = (row for _, row in reservoir)
        else:
            iterable = r  # 기존: 앞에서부터 순차 전송

        for row in iterable:
            if sent >= args.limit and not args.reservoir:
                break  # reservoir 모드에선 표본 크기가 이미 N이므로 별도 제한 불필요
            method = (row.get("request_http_method") or "GET").upper()
            path   = row.get("request_http_request") or "/"
            body   = row.get("request_body") or None

            url = args.target.rstrip("/") + path
            try:
                if method == "GET":
                    resp = requests.get(url, timeout=5)
                elif method == "POST":
                    resp = requests.post(url, data=body, timeout=5)
                else:
                    resp = requests.request(method, url, data=body, timeout=5)
                print(f"{method} {path} -> {resp.status_code}")
            except Exception as e:
                print(f"{method} {path} -> ERROR {e}")

            sent += 1
            if args.sleep:
                time.sleep(args.sleep)

if __name__ == "__main__":
    main()
