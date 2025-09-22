#!/usr/bin/env python3
import sys
import json
import os
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel
from huggingface_hub import login
import warnings

warnings.filterwarnings("ignore")


class MistralClassifier:
    def __init__(self, model_path="snowhodut/waf-mistral-model"):
        self.model_path = model_path
        self.base_model_name = "mistralai/Mistral-7B-Instruct-v0.3"
        self.model = None
        self.tokenizer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        # 허깅페이스 토큰 로그인
        hf_token = os.getenv("HUGGINGFACE_TOKEN")
        if hf_token:
            login(token=hf_token)

    def load_model(self):
        """LoRA 어댑터 모델과 토크나이저 로드"""
        try:
            # 베이스 모델과 토크나이저 로드
            self.tokenizer = AutoTokenizer.from_pretrained(self.base_model_name)
            base_model = AutoModelForCausalLM.from_pretrained(
                self.base_model_name,
                dtype=torch.float16 if self.device == "cuda" else torch.float32,
                device_map="auto" if self.device == "cuda" else None,
                low_cpu_mem_usage=True,
            )

            # LoRA 어댑터 로드
            self.model = PeftModel.from_pretrained(base_model, self.model_path)

            if self.device == "cpu":
                self.model = self.model.to(self.device)

            return True
        except Exception as e:
            print(f"ERROR: 모델 로딩 실패 - {str(e)}", file=sys.stderr)
            return False

    def predict(self, session_text):
        """세션 텍스트 분류"""
        try:
            # 프롬프트 구성 (학습 시와 동일한 형식)
            prompt = f"""다음 웹 요청 로그를 분석하고, 공격 유형을 'Normal', 'Code Injection', 'Path Traversal', 'SQL Injection' 중에서 하나로 분류하세요.

{session_text}

Label:"""

            # 토크나이징
            inputs = self.tokenizer(
                prompt, return_tensors="pt", truncation=True, max_length=512
            )

            if self.device == "cuda":
                inputs = {k: v.to(self.device) for k, v in inputs.items()}

            # 추론
            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=20,
                    temperature=0.1,
                    do_sample=False,
                    pad_token_id=self.tokenizer.eos_token_id,
                    eos_token_id=self.tokenizer.eos_token_id,
                )

            # 결과 디코딩
            generated_text = self.tokenizer.decode(
                outputs[0][len(inputs.input_ids[0]) :], skip_special_tokens=True
            )

            # 분류 결과 파싱
            classification = self.parse_classification(generated_text)

            return {
                "success": True,
                "classification": classification,
                "confidence": "high",
                "raw_response": generated_text.strip(),
            }

        except Exception as e:
            return {"success": False, "classification": "Normal", "error": str(e)}

    def parse_classification(self, response):
        """AI 응답에서 분류 결과 추출"""
        response = response.strip().upper()

        if "SQL" in response:
            return "SQL Injection"
        elif "CODE" in response:
            return "Code Injection"
        elif "PATH" in response or "TRAVERSAL" in response:
            return "Path Traversal"
        else:
            return "Normal"


def main():
    if len(sys.argv) != 2:
        print(
            "ERROR: 사용법 - python model_inference.py '<session_text>'",
            file=sys.stderr,
        )
        sys.exit(1)

    session_text = sys.argv[1]

    classifier = MistralClassifier()
    if not classifier.load_model():
        sys.exit(1)

    result = classifier.predict(session_text)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
