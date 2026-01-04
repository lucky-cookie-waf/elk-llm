# server.py (수정된 최종 버전)

import os
import asyncio
import warnings
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from model_inference import MistralClassifier

warnings.filterwarnings("ignore", category=FutureWarning)

SESSION_MAX_REQ_DEFAULT = "20"   # ⭐ 세션 내 요청 최대 반영 수 확대

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
# ⭐ 핵심: sessionizing.js는 "세션 요청 배열"을 보내고,
#    model_inference.py는 "텍스트 한 덩어리"만 받음.
#
#    => 둘 사이를 잇는 역할이 build_session_text
# ===================================================================
def build_session_text(items: List[AIItem]) -> str:
    """
    세션 요청들을 사람이 읽기 좋고 LLM이 분석하기 좋은 형태로 변환한다.
    목적:
      - 공격 패턴(SQLi, Path traversal, XSS 등)을 명확하게 드러내기
      - ModSecurity가 놓친 공격을 AI가 쉽게 판단하도록 돕기
    """

    max_req = int(os.getenv("SESSION_MAX_REQ", SESSION_MAX_REQ_DEFAULT))
    lines = []

    # ===== 헤더 =====
    lines.append("You are a web security classifier. Analyze the following HTTP requests as ONE session.")
    lines.append("Decide if this session contains: SQL injection, Path traversal, Code injection, Normal (benign), or other Attack.")
    lines.append("Provide a clear judgment.\n")

    # ===== 요청들 처리 =====
    for idx, it in enumerate(items[:max_req], start=1):
        method = (it.request_http_method or "").strip().upper()
        path = (it.request_http_request or "").strip()
        body = (it.request_body or "").strip()
        ua = (it.user_agent or "").strip()

        # ⭐ 공격 탐지를 위한 최대한 풍부한 정보 제공
        req_block = []
        req_block.append(f"[{idx}] METHOD: {method}")
        req_block.append(f"PATH: {path}")

        if body:
            # BODY는 너무 길면 LLM 처리에 부담 → 300자 정도 제한
            req_block.append(f"BODY: {body[:300]}")

        if ua:
            req_block.append(f"USER-AGENT: {ua[:120]}")

        # Multi-line request block
        lines.append("\n".join(req_block))
        lines.append("----")

    # 최종 텍스트 생성
    return "\n".join(lines)


# ===== FastAPI Startup =====
@app.on_event("startup")
async def startup():
    global clf, ready

    clf = MistralClassifier()   # HF endpoint classifier
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

    # ⭐ 세션 배열 → LLM 입력용 문자열 변환
    session_text = build_session_text(req.session)

    # 하나씩 처리 (LLM concurrency 제한)
    async with lock:
        result = clf.predict("SESSION", session_text, "")

    # model_inference.py가 반환하는 구조 그대로 사용
    classification = result.get("classification", "Normal")
    confidence = result.get("confidence", "low")
    raw = result.get("raw_response", "")

    return {
        "classification": classification,
        "confidence": confidence,
        "raw_response": raw
    }


# ===== Local Dev =====
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=3002, workers=1)
