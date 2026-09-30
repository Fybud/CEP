FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY labels.py prepare_data.py train.py server.py ./
# Baked model (models/ is gitignored; bundled_model/ is tracked for Docker deploys)
COPY bundled_model/intent_clf.joblib bundled_model/meta.json ./models/

ENV HOST=0.0.0.0
ENV PORT=8091
ENV INTENT_MODEL_PATH=/app/models/intent_clf.joblib

EXPOSE 8091

CMD ["python", "server.py"]
