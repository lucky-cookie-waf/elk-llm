#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse, csv, requests, time

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--target", default="http://localhost:8080")
    ap.add_argument("--limit", type=int, default=1000)
    ap.add_argument("--sleep", type=float, default=0.0, help="seconds between requests")
    args = ap.parse_args()

    sent = 0
    with open(args.dataset, encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            if sent >= args.limit: break
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
            if args.sleep: time.sleep(args.sleep)

if __name__ == "__main__":
    main()
