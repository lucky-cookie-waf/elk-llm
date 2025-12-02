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
                # 설명이 끊기지 않도록 토큰 수 여유 있게
                "max_new_tokens": 128,
                "temperature": 0.1,
                "do_sample": False,
            },
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        resp = requests.post(
            self.endpoint,
            headers=headers,
            data=json.dumps(payload),
            timeout=120,
        )

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

    def _split_label_and_explanation(self, output: str) -> (str, str):
        """
        모델 출력에서
        - 첫 번째 비어있지 않은 줄을 라벨 후보
        - 나머지 줄을 설명(explanation)으로 분리
        """
        lines = [ln.strip() for ln in output.splitlines() if ln.strip()]
        if not lines:
            return "", ""
        label_line = lines[0]
        explanation = "\n".join(lines[1:]).strip()
        return label_line, explanation

    def _derive_classification(self, label_text: str, explanation: str) -> str:
        """
        모델이 생성한 출력 중
        - 첫 줄(label_text)을 우선적으로 보고
        - 설명(explanation)까지 합쳐서 SQL / PATH / CODE / NORMAL / ATTACK 중 하나로 매핑.

        최종 라벨 셋:
          - "SQL injection"
          - "Code injection"
          - "Path traversal"
          - "Normal"
          - "Attack"  (Normal은 아닌데 공격/악성 뉘앙스가 강할 때 fallback)
        """
        label = (label_text or "").strip().lower()
        expl = (explanation or "").strip().lower()
        combined = (label + "\n" + expl).strip()

        # 1) 먼저 라벨 줄만 보고 직접 매핑 시도
        if "sql" in label:
            return "SQL injection"
        if "path" in label or "traversal" in label:
            return "Path traversal"
        if "code" in label or "xss" in label:
            return "Code injection"
        if "normal" in label or "benign" in label:
            return "Normal"

        # 2) 라벨이 애매하면 전체 텍스트(combined)를 기준으로 추가 판별
        text = combined

        normal_like = (
            "normal" in text
            or "benign" in text
            or "no malicious activity" in text
            or "not malicious" in text
            or "no attack" in text
            or "false positive" in text
        )

        attack_like = (
            "attack" in text
            or "malicious" in text
            or "suspicious" in text
            or "exploit" in text
            or "payload" in text
            or "injection" in text
            or "sql injection" in text
            or "sqli" in text
            or "xss" in text
            or "<script" in text
            or "path traversal" in text
            or "../" in text
            or "..\\" in text
        )

        # Normal 뉘앙스가 있으면 우선 Normal
        if normal_like:
            return "Normal"

        # Normal은 절대 아닌데, 공격/악성 뉘앙스만 강한 경우 → Attack fallback
        if attack_like:
            return "Attack"

        # 아무 단서가 없으면 일단 Normal로 취급
        return "Normal"

    # ===== 외부에서 사용하는 메인 메서드 =====
    def predict(self, session_text: str) -> Dict[str, Any]:
        """
        session_text (build_session_text로 만든 세션 요약)를 기반으로
        HF Endpoint에 프롬프트를 전달하고,
        - classification:  "SQL injection" / "Code injection" / "Path traversal" / "Normal" / "Attack"
        - confidence:     "high" (추후 조건부 조정 가능)
        - raw_response:   모델의 "설명만" (로그/라벨 제외)
        을 반환.
        """

        # 1) 프롬프트 구성
        #   - 1번째 줄: 라벨 (Normal / Code Injection / Path Traversal / SQL Injection 중 하나만)
        #   - 2번째 줄부터: 설명
        #   - HTTP 로그는 답변에 다시 쓰지 말 것
        prompt = f"""You are a web application firewall (WAF) analyst.

Analyze the following HTTP request log and classify it into ONE of the following labels:
- Normal
- Code Injection
- Path Traversal
- SQL Injection

Output format:
1. On the FIRST line, write ONLY the final label (exactly one of: Normal, Code Injection, Path Traversal, SQL Injection).
2. From the SECOND line onward, briefly explain your reasoning in English.
3. Do NOT repeat the original HTTP request log in your answer.

HTTP request log:
{session_text}

Answer:
"""

        try:
            hf_resp = self._call_hf_endpoint(prompt)
            output = self._extract_output_text(hf_resp).strip()
        except Exception as e:
            # HF 쪽 오류 → Error 플래그로 반환
            return {
                "classification": "Error",
                "confidence": "low",
                "raw_response": f"[HF_ERROR] {e}",
            }

        # 2) 출력에서 라벨 줄 / 설명 분리
        label_line, explanation = self._split_label_and_explanation(output)

        # 3) 라벨 + 설명 텍스트를 기반으로 최종 classification 결정
        classification = self._derive_classification(label_line, explanation)

        # 4) 설명만 ai_raw(raw_response)에 담기 (로그/라벨은 제외)
        confidence = "high"

        return {
            "classification": classification,
            "confidence": confidence,
            "raw_response": explanation,
        }
