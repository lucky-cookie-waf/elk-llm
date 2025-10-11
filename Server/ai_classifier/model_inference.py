#!/usr/bin/env python3
import sys
import json
import os
import torch
import warnings
from dotenv import load_dotenv

from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel
from huggingface_hub import login

warnings.filterwarnings("ignore")
load_dotenv()

# ===== 모델/토큰 =====
MODEL_ID = os.environ.get("MODEL_ID", "mistralai/Mistral-7B-Instruct-v0.3")
HF_TOKEN = os.environ.get("HUGGINGFACE_HUB_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")

# ✅ token만 사용 (use_auth_token 미사용)
auth_kwargs = {}
if HF_TOKEN:
    try:
        # 허브 자격을 캐시에 기록(이미 로그인되어 있으면 무시)
        login(token=HF_TOKEN, add_to_git_credential=False)
    except Exception:
        pass
    auth_kwargs = {"token": HF_TOKEN}


class MistralClassifier:
    def __init__(self, model_path: str = "snowhodut/waf-mistral-model"):
        self.model_path = model_path
        self.base_model_name = MODEL_ID
        self.model = None
        self.tokenizer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def load_model(self) -> bool:
        try:
            # 1) 토크나이저 로드 + pad 토큰 명시
            self.tokenizer = AutoTokenizer.from_pretrained(self.base_model_name)
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token

            # 2) 4bit 양자화(있으면)로 VRAM 절약
            quant = None
            if self.device == "cuda":
                quant = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_compute_dtype=torch.float16
                )

            base_model = AutoModelForCausalLM.from_pretrained(
                self.base_model_name,
                device_map="auto" if self.device == "cuda" else None,
                dtype=torch.float16 if self.device == "cuda" else torch.float32,
                low_cpu_mem_usage=True,
                quantization_config=quant  # ← GPU면 4bit, CPU면 무시
            )

            # 3) LoRA 어댑터 결합 (login() 했으므로 token 인자 필요 없음)
            self.model = PeftModel.from_pretrained(base_model, self.model_path)

            if self.device == "cpu":
                self.model = self.model.to(self.device)

            self.model.eval()
            return True
        except Exception as e:
            print(f"ERROR: 모델 로딩 실패 - {str(e)}", file=sys.stderr)
            return False

    def predict(self, session_text: str) -> dict:
        try:
            prompt = (
                "다음 웹 요청 로그를 분석하고, 공격 유형을 "
                "'Normal', 'Code Injection', 'Path Traversal', 'SQL Injection' 중에서 하나로 분류하세요.\n\n"
                f"{session_text}\n\nLabel:"
            )
            inputs = self.tokenizer(
                prompt, return_tensors="pt", truncation=True, max_length=1024
            )
            if self.device == "cuda":
                inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=16,
                    temperature=0.0,
                    do_sample=False,
                    pad_token_id=self.tokenizer.pad_token_id if self.tokenizer.pad_token_id is not None else self.tokenizer.eos_token_id,
                    eos_token_id=self.tokenizer.eos_token_id,
                )

            gen = outputs[0][inputs.input_ids.shape[1]:]
            generated_text = self.tokenizer.decode(gen, skip_special_tokens=True)

            # 1) 원시 라벨 추출 (Natural text)
            raw_label_text = self.parse_classification(generated_text)  # e.g., "SQL Injection"

            # 2) 스키마 enum으로 매핑 (없으면 NORMAL)
            enum_label = LABEL_MAP_TO_ENUM.get(raw_label_text, "NORMAL")

            # 3) 신뢰도(예: 고정 0.9 → 필요 시 JSON 포맷 학습으로 확률 출력)
            score = 0.9
            conf_enum = score_to_conf_enum(score, th=0.7)

            # 4) 스키마에 맞춘 결과 payload
            return {
                "success": True,
                "label_enum": enum_label,              # Session.label
                "confidence_enum": conf_enum,          # Session.confidence
                "classification_text": raw_label_text, # Session.classification (사람이 읽는 라벨)
                "classifier_raw": generated_text.strip(), # Session.classifier_raw (원문)
                "score": score                          # 필요하면 따로 보관
            }

        except Exception as e:
            return {
                "success": False,
                "label_enum": "NORMAL",
                "confidence_enum": "LOW",
                "classification_text": "Normal",
                "classifier_raw": f"ERROR: {e}",
                "score": 0.0
            }

    @staticmethod
    def parse_classification(response: str) -> str:
        r = (response or "").strip().upper()
        if "SQL" in r:
            return "SQL Injection"
        if "CODE" in r or "XSS" in r or "RCE" in r:
            return "Code Injection"
        if "PATH" in r or "TRAVERSAL" in r or "LFI" in r:
            return "Path Traversal"
        return "Normal"


def main():
    if len(sys.argv) != 2:
        print("ERROR: 사용법 - python model_inference.py '<session_text>'", file=sys.stderr)
        sys.exit(1)

    session_text = sys.argv[1]

    clf = MistralClassifier()
    if not clf.load_model():
        sys.exit(1)

    result = clf.predict(session_text)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
