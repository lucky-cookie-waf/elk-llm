# ai_classifier/Dockerfile
FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends git build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY model_inference.py server.py ./

ENV HF_HOME=/app/.cache/huggingface \
    TRANSFORMERS_CACHE=/app/.cache/huggingface \
    PYTHONUNBUFFERED=1 \
    PORT=3002
RUN mkdir -p /app/.cache/huggingface

EXPOSE 3002
CMD ["python", "server.py"]
