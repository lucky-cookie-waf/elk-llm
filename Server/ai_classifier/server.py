# server.py
import os
import asyncio
import warnings
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from model_inference import MistralClassifier

warnings.filterwarnings("ignore", category=FutureWarning)

# === 환경 ===
SESSION_MAX_REQ_DEFAULT = "12"

app = FastAPI()
clf: Optional[MistralClassifier] = None
ready: bool = False
lock = asyncio.Lock()

# ==== 입력 스키마 ====
class AIItem(BaseModel):
    request_http_method: Optional[str] = ""
    request_http_request: Optional[str] = ""
    request_body: Optional[str] = ""
    user_agent: Optional[str] = ""

class AIRequest(BaseModel):
    session: List[AIItem]

# ==== 세션 텍스트 빌드 ====
def build_session_text(items: List[AIItem]) -> str:
    lines = []
    max_req = int(os.getenv("SESSION_MAX_REQ", SESSION_MAX_REQ_DEFAULT))
    for it in items[:max_req]:
        line = f"{(it.request_http_method or '').strip()} {(it.request_http_request or '').strip()}".strip()
        if it.request_body:
            line += f" BODY: {str(it.request_body)[:256]}"
        if it.user_agent:
            line += f" UA: {str(it.user_agent)[:80]}"
        lines.append(line)
    return "\n".join(lines) if lines else "NO_REQUESTS"

# ==== 스타트업 ====
@app.on_event("startup")
async def startup():
    global clf, ready

    clf = MistralClassifier()   # ← HF endpoint 전용
    ok = clf.load_model()       # ← 항상 True
    ready = bool(ok)
    print("[init] ready =", ready)

# ==== 헬스 ====
@app.get("/health")
def health():
    return {"status": "alive"}

@app.get("/ready")
def readyz():
    return {"status": "ok" if ready else "loading"}

# ==== 추론 ====
@app.post("/api/classify")
async def classify(req: AIRequest):
    if not ready:
        raise HTTPException(status_code=503, detail="model_not_ready")
    if not req.session:
        raise HTTPException(status_code=400, detail="empty_session")

    session_text = build_session_text(req.session)

    async with lock:
        result = clf.predict(session_text)

    classification = result.get("classification", "Normal")
    confidence = result.get("confidence", "low")
    raw = result.get("raw_response", "")

    return {"classification": classification, "confidence": confidence, "raw_response": raw}

# ==== 로컬 개발용 ====
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=3002, workers=1)
