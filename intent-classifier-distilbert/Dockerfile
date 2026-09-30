FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY labels.py train.py server.py ./
# HF fine-tuned weights + tokenizer + meta.json
COPY bundled_model/ ./models/

ENV HOST=0.0.0.0
ENV PORT=8091
ENV INTENT_MODEL_PATH=/app/models
# Avoid re-download when weights are baked
ENV TRANSFORMERS_OFFLINE=1
ENV HF_HUB_OFFLINE=1

EXPOSE 8091

CMD ["python", "server.py"]
