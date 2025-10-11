# server.py
import os
import asyncio
import warnings
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from huggingface_hub import login, snapshot_download

from model_inference import MistralClassifier

# (경고만 억제 — 가능하면 env에선 TRANSFORMERS_CACHE 대신 HF_HOME만 사용)
warnings.filterwarnings("ignore", category=FutureWarning, message=".*TRANSFORMERS_CACHE.*")

HF_TOKEN = os.getenv("HUGGINGFACE_HUB_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
BASE_MODEL_ID = os.getenv("BASE_MODEL_ID", os.getenv("MODEL_ID", "mistralai/Mistral-7B-Instruct-v0.3"))
LORA_ADAPTER_ID = os.getenv("LORA_ADAPTER_ID", "snowhodut/waf-mistral-model")
HF_HOME = os.getenv("HF_HOME", "/app/.cache/huggingface")
CACHE_DIR = HF_HOME  # HF_HOME 우선

# hf_transfer 켰는데 패키지 없으면 자동 비활성화
if os.getenv("HF_HUB_ENABLE_HF_TRANSFER") == "1":
    try:
        import hf_transfer  # noqa: F401
    except Exception:
        print("[init] hf_transfer not installed → disabling fast download")
        os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"

app = FastAPI()
clf: Optional[MistralClassifier] = None
ready: bool = False
lock = asyncio.Lock()  # 동시 추론 제어

class AIItem(BaseModel):
    request_http_method: Optional[str] = ""
    request_http_request: Optional[str] = ""
    request_body: Optional[str] = ""
    user_agent: Optional[str] = ""

class AIRequest(BaseModel):
    session: List[AIItem]

def build_session_text(items: List[AIItem]) -> str:
    lines = []
    max_req = int(os.getenv("SESSION_MAX_REQ", "20"))
    for it in items[:max_req]:
        line = f"{(it.request_http_method or '').strip()} {(it.request_http_request or '').strip()}".strip()
        if it.request_body:
            line += f" BODY: {str(it.request_body)[:256]}"
        if it.user_agent:
            line += f" UA: {str(it.user_agent)[:80]}"
        lines.append(line)
    return "\n".join(lines) if lines else "NO_REQUESTS"

def _load_once_blocking() -> bool:
    """로그인 → (캐시에) 다운로드 → 모델 메모리 로드 (1회)"""
    if HF_TOKEN:
        try:
            login(token=HF_TOKEN, add_to_git_credential=False)
        except Exception as e:
            print("[init] login warn:", e)

    try:
        snapshot_download(repo_id=BASE_MODEL_ID, local_dir_use_symlinks=False, cache_dir=CACHE_DIR)
        if LORA_ADAPTER_ID:
            snapshot_download(repo_id=LORA_ADAPTER_ID, local_dir_use_symlinks=False, cache_dir=CACHE_DIR)
        print("[prefetch] done")
    except Exception as e:
        print("[prefetch] warn:", e)

    global clf
    clf = MistralClassifier(model_path=LORA_ADAPTER_ID)
    ok = clf.load_model()
    return bool(ok)

@app.on_event("startup")
async def startup():
    """무거운 초기화는 백그라운드에서 수행 (부팅 블로킹 방지)"""
    global ready
    async def _bg():
        global ready
        try:
            ok = await asyncio.to_thread(_load_once_blocking)
            ready = bool(ok)
            print("[init] model ready =", ready)
        except Exception as e:
            ready = False
            print("[init] failed:", e)
    asyncio.create_task(_bg())

@app.get("/health")
def health():
    return {"status": "alive"}  # 프로세스 생존 체크

@app.get("/ready")
def readyz():
    return {"status": "ok" if ready else "loading"}  # 모델 준비 여부

@app.post("/api/classify")
async def classify(req: AIRequest):
    if not ready:
        raise HTTPException(status_code=503, detail="model_not_ready")
    if not req.session:
        raise HTTPException(status_code=400, detail="empty_session")

    session_text = build_session_text(req.session)
    async with lock:
        result = clf.predict(session_text)

    # sessionizing.js에서 기대하는 레거시 포맷으로 정규화
    if result.get("classification") is not None:
        classification = result.get("classification", "Normal")
        conf = result.get("confidence", "low")
        raw = result.get("raw_response", "")
        confidence = str(conf).lower() if isinstance(conf, str) else ("high" if conf else "low")
    else:
        classification = result.get("classification_text", "Normal")
        raw = result.get("classifier_raw", "")
        thr = float(os.getenv("CONFIDENCE_HIGH_THRESH", "0.7"))
        if result.get("confidence_enum") == "HIGH":
            confidence = "high"
        else:
            confidence = "high" if float(result.get("score", 0.0)) >= thr else "low"

    return {"classification": classification, "confidence": confidence, "raw_response": raw}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.getenv("PORT", "3002")), workers=1)
