# server.py (single-log first, compatible with sessionizing.js + model_inference.py)

import os
import asyncio
import warnings
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from model_inference import MistralClassifier

warnings.filterwarnings("ignore", category=FutureWarning)

SESSION_MAX_REQ_DEFAULT = "20"  # 세션 내 요청 최대 반영 수(다중 요청 들어올 때만 사용)

app = FastAPI()
clf: Optional[MistralClassifier] = None
ready: bool = False
lock = asyncio.Lock()

# ===== 입력 스키마 =====
class AIItem(BaseModel):
    request_http_method: Optional[str] = ""
    request_http_request: Optional[str] = ""
    request_body: Optional[str] = ""
    user_agent: Optional[str] = ""


class AIRequest(BaseModel):
    session: List[AIItem]


# ===================================================================
# (옵션) 다중 요청이 들어올 때만 사용하는 "세션 텍스트" 구성
# - 단일로그 모드에서는 보통 사용하지 않음
# ===================================================================
def build_session_text(items: List[AIItem]) -> str:
    max_req = int(os.getenv("SESSION_MAX_REQ", SESSION_MAX_REQ_DEFAULT))
    lines: List[str] = []

    # model_inference.py 자체가 라벨을 강제하는 프롬프트를 이미 갖고 있으므로
    # 여기서는 과도한 지시문을 넣기보다 "관측 데이터" 위주로만 구성
    for idx, it in enumerate(items[:max_req], start=1):
        method = (it.request_http_method or "").strip().upper()
        path = (it.request_http_request or "").strip()
        body = (it.request_body or "").strip()
        ua = (it.user_agent or "").strip()

        lines.append(f"[{idx}] {method} {path}")
        if ua:
            lines.append(f"User-Agent: {ua[:120]}")
        if body:
            lines.append(f"Body: {body[:300]}")
        lines.append("----")

    return "\n".join(lines)


# ===== FastAPI Startup =====
@app.on_event("startup")
async def startup():
    global clf, ready
    clf = MistralClassifier()
    ok = clf.load_model()
    ready = bool(ok)
    print("[init] ready =", ready)


# ===== Health =====
@app.get("/health")
def health():
    return {"status": "alive"}


@app.get("/ready")
def readyz():
    return {"status": "ok" if ready else "loading"}


# ===== Main Classification Endpoint =====
@app.post("/api/classify")
async def classify(req: AIRequest):
    if not ready:
        raise HTTPException(status_code=503, detail="model_not_ready")
    if not req.session:
        raise HTTPException(status_code=400, detail="empty_session")

    # ✅ 단일로그 우선: sessionizing.js는 보통 길이 1로 보냄
    first = req.session[0]
    method = (first.request_http_method or "").strip() or "GET"
    path = (first.request_http_request or "").strip() or "/"
    body = (first.request_body or "") or ""

    # 혹시 다중 요청이 들어오면(예: 나중에 실험 확장) 세션 텍스트로 합쳐서 처리
    if len(req.session) > 1:
        body = build_session_text(req.session)
        method = "SESSION"
        path = "/session"

    # 하나씩 처리 (LLM concurrency 제한)
    async with lock:
        result = clf.predict(method, path, body)

    # model_inference.py가 반환하는 구조 그대로 사용
    classification = result.get("classification", "Normal")
    confidence = result.get("confidence", "low")
    raw = result.get("raw_response", "")

    # sessionizing.js는 classification/confidence/raw_response만 써도 충분
    return {
        "classification": classification,
        "confidence": confidence,
        "raw_response": raw,
    }


# ===== Local Dev =====
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=3002, workers=1)
