# model_inference.py
import os
import json
import requests
import re
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
    def _call_hf_endpoint(self, prompt: str) -> Dict[str, Any]:
        """
        HF Inference Endpoint 호출.
        Endpoint 타입(text-generation / chat-completions 등)에 따라
        응답 구조가 달라질 수 있으므로 최대한 범용적으로 파싱.
        prompt: 이미 프롬프트 형식으로 구성된 문자열
        """
        payload = {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": 16,
                "temperature": 0.01,
                "return_full_text": False,
                "do_sample": False,
            },
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            resp = requests.post(
                self.endpoint, headers=headers, data=json.dumps(payload), timeout=30
            )

            if resp.status_code != 200:
                raise RuntimeError(f"HF error {resp.status_code}: {resp.text}")

            return resp.json()

        except Exception as e:
            # 네트워크 타임아웃 등
            return {"error": str(e)}

    def _extract_output_text(self, data: Any) -> str:
        """
        HF Endpoint 응답에서 텍스트만 추출
        """
        if isinstance(data, dict) and "error" in data:
            return "Error"

        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                return first.get("generated_text", "")
            return str(first)

        if isinstance(data, dict):
            return data.get("generated_text", "")

        return str(data)

    def _derive_classification(self, output: str) -> str:
        """
        모델의 응답(output)을 분석하여 (Classification, Confidence) 반환.
        학습된 4개 클래스 이외의 값이 나오면 Low Confidence로 처리.
        """
        # 1. 정규화 (특수문자 제거, 대문자 변환)
        clean_text = re.sub(r"[^a-zA-Z\s]", "", output).strip().upper()
        clean_text = " ".join(clean_text.split())

        # 2. 정확한 라벨 매칭 (학습 데이터 기준)
        if "SQL INJECTION" in clean_text:
            return "SQL Injection", "high"

        if "CODE INJECTION" in clean_text:
            return "Code Injection", "high"

        if "PATH TRAVERSAL" in clean_text:
            return "Path Traversal", "high"

        # Normal 또는 Benign
        if "NORMAL" in clean_text or "BENIGN" in clean_text:
            return "Normal (benign)", "high"

        # 3. 예외 처리 (모델이 딴소리 함)
        if "ERROR" in clean_text:
            return "Normal", "low"  # 에러 시 Fail-open

        # 4. 공격 뉘앙스는 있으나 라벨이 정확하지 않음
        if "ATTACK" in clean_text or "MALICIOUS" in clean_text:
            return "Attack", "medium"  # 찜찜하니까 Attack으로 분류하되 신뢰도는 medium

        # 5. 알 수 없음 -> Normal로 처리 (서비스 장애 방지)
        return "Normal", "low"

    # ===== 외부에서 사용하는 메인 메서드 =====
    def predict(self, method: str, path: str, body: str = "") -> Dict[str, Any]:
        """
        재학습된 모델의 포맷(영어/Standard)에 맞춰 문자열 조립
        입력 예: method="GET", path="/login", body="id=1"
        결과 예: "GET /login\nBody: id=1"
        """

        session_text = f"{method} {path}"

        if body and str(body).strip() not in ["nan", "", "None", "null"]:
            session_text += f"\nBody: {str(body)[:100]}"

        # 파인튜닝 코드의 WAFSessionDataset 클래스 __getitem__ 메서드에 있던 프롬프트
        prompt = f"""<|begin_of_text|><|start_header_id|>system<|end_header_id|>
웹 방화벽 세션을 분석하여 공격 유형을 분류하세요. 가능한 분류: Normal, SQL Injection, Code Injection, Path Traversal<|eot_id|>

<|start_header_id|>user<|end_header_id|>
세션 정보:
{session_text}<|eot_id|>

<|start_header_id|>assistant<|end_header_id|>
"""
        try:
            hf_resp = self._call_hf_endpoint(prompt)
            output = self._extract_output_text(hf_resp)

            classification, confidence = self._derive_classification(output)

            # 설명은 따로 없으므로 raw_response에는 모델이 뱉은 라벨 원본을 저장
            return {
                "classification": classification,
                "confidence": confidence,
                "raw_response": output.strip(),
            }

        except Exception as e:
            # 최후의 안전장치 (Fail-open)
            return {
                "classification": "Normal",
                "confidence": "low",
                "raw_response": f"System Error: {e}",
            }
