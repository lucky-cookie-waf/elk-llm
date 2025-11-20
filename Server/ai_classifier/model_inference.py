# model_inference.py
import os
import json
import requests
from typing import Any, Dict


class MistralClassifier:
    """
    로컬 모델 대신 Hugging Face Inference Endpoint를 호출하는 경량 분류기.

    - HF_ENDPOINT_URL: Hugging Face Inference Endpoint URL
    - HF_API_KEY:     Hugging Face API 토큰 (Bearer)
    """

    def __init__(self) -> None:
        self.endpoint = os.getenv("HF_ENDPOINT_URL")
        self.api_key = os.getenv("HF_API_KEY")

        if not self.endpoint:
            raise RuntimeError("HF_ENDPOINT_URL is not set")
        if not self.api_key:
            raise RuntimeError("HF_API_KEY is not set")

    def load_model(self) -> bool:
        """
        로컬에서 모델을 로드할 필요가 없으므로 항상 True.
        (server.py의 초기화 인터페이스 맞추기용)
        """
        return True

    # ===== 내부 유틸 =====
    def _call_hf_endpoint(self, session_text: str) -> Dict[str, Any]:
        """
        HF Inference Endpoint 호출.
        Endpoint 타입(text-generation / chat-completions 등)에 따라
        응답 구조가 달라질 수 있으므로 최대한 범용적으로 파싱.
        """
        payload = {
            "inputs": session_text
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        resp = requests.post(self.endpoint, headers=headers, data=json.dumps(payload), timeout=120)

        if resp.status_code != 200:
            # 에러일 경우 그대로 텍스트를 넘겨서 상위에서 처리
            raise RuntimeError(f"HF endpoint HTTP {resp.status_code}: {resp.text}")

        try:
            return resp.json()
        except Exception:
            # JSON 파싱 실패 시 raw text 그대로 넘김
            return {"raw": resp.text}

    def _extract_output_text(self, data: Any) -> str:
        """
        HF Endpoint 응답에서 사람이 읽을 수 있는 텍스트를 최대한 뽑아냄.
        - text-generation-inference: [{ "generated_text": "..." }]
        - 일반 pipeline: { "generated_text": "..." } 또는 "..." 등
        - chat/completions 스타일: { "choices": [ { "message": { "content": "..." } } ] }
        """
        # 1) 리스트 형태 (HF text-generation-inference가 흔히 이 형태)
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                if "generated_text" in first:
                    return str(first["generated_text"])
                if "text" in first:
                    return str(first["text"])
            return str(first)

        # 2) 딕셔너리 형태
        if isinstance(data, dict):
            if "generated_text" in data:
                return str(data["generated_text"])
            # OpenAI/chat 스타일
            if "choices" in data and isinstance(data["choices"], list) and data["choices"]:
                choice = data["choices"][0]
                # chat.completions 형태
                if isinstance(choice, dict):
                    if "message" in choice and isinstance(choice["message"], dict):
                        content = choice["message"].get("content")
                        if content:
                            return str(content)
                    # text-completion 형태
                    if "text" in choice:
                        return str(choice["text"])
            # raw 키가 있으면 그걸 사용
            if "raw" in data:
                return str(data["raw"])
            return json.dumps(data, ensure_ascii=False)

        # 3) 문자열 그대로
        if isinstance(data, str):
            return data

        # 4) 그 외는 문자열 변환
        return str(data)

    def _derive_classification(self, output: str) -> str:
        """
        HF 모델이 생성한 텍스트(raw_response)를 보고
        SQL / PATH / CODE / NORMAL / ATTACK 중 하나로 classification 문자열을 설정.

        이 문자열에 따라 sessionizing.js의 toSessionLabelEnum이 동작:
          - 'sql'  포함 → SQL_INJECTION
          - 'code' 포함 → CODE_INJECTION
          - 'path' 또는 'traversal' 포함 → PATH_TRAVERSAL
          - 'normal' 또는 'benign' 포함 → NORMAL
          - 그 외 → MALICIOUS
        """
        text = output.lower()

        # SQL Injection 징후
        sql_like = (
            "sql injection" in text
            or "sqli" in text
            or "union select" in text
            or "or 1=1" in text
            or "or 1 = 1" in text
        )

        # Path Traversal 징후
        path_like = (
            "path traversal" in text
            or "directory traversal" in text
            or "../" in text
            or "..\\" in text
        )

        # XSS / Code injection 징후
        code_like = (
            "xss" in text
            or "cross-site scripting" in text
            or "<script" in text
            or "javascript:" in text
            or "code injection" in text
        )

        # 정상/베나인 언급
        normal_like = (
            "normal" in text
            or "benign" in text
            or "no malicious activity" in text
            or "not malicious" in text
            or "no attack" in text
        )

        # 1순위: 구체적인 공격 타입
        if sql_like:
            return "SQL injection"
        if path_like:
            return "Path traversal"
        if code_like:
            return "Code injection"

        # 2순위: 명시적으로 정상이라고 언급한 경우
        if normal_like:
            return "Normal (benign)"

        # 3순위: 공격/악성이라는 키워드만 있을 때
        if "attack" in text or "malicious" in text or "suspicious" in text:
            return "Attack"

        # 4순위: 아무 흔적도 못 찾으면 일단 Normal 취급 (원하면 'Attack'으로 바꿀 수 있음)
        return "Normal"

    # ===== 외부에서 사용하는 메인 메서드 =====
    def predict(self, session_text: str) -> Dict[str, Any]:
        """
        session_text (build_session_text로 만든 세션 요약)를 HF Endpoint에 보내고,
        classification / confidence / raw_response를 반환.
        """
        try:
            hf_resp = self._call_hf_endpoint(session_text)
            output = self._extract_output_text(hf_resp)
        except Exception as e:
            # HF 쪽 오류 → Error 플래그로 반환
            return {
                "classification": "Error",
                "confidence": "low",
                "raw_response": f"[HF_ERROR] {e}"
            }

        # raw_response 기반으로 공격 유형/정상 여부 결정
        classification = self._derive_classification(output)

        # 일단 heuristic 성공 기준으로 high 고정 (나중에 조건식으로 조절 가능)
        confidence = "high"

        return {
            "classification": classification,  # ex) "SQL injection", "Path traversal", "Code injection", "Normal (benign)", "Attack"
            "confidence": confidence,
            "raw_response": output
        }
