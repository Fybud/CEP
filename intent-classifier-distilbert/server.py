"""
CEP DistilBERT Intent Classifier API

Same contract as intent-classifier (LogReg): group/sub leaves, port 8091.
Run ONE of the two services in prod — both bind 8091 on cep-network.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from labels import GROUPS, INTENT_DESCRIPTIONS, INTENTS, is_intent, split_label

ROOT = Path(__file__).resolve().parent
MODEL_DIR = Path(os.getenv("INTENT_MODEL_PATH", ROOT / "models" / "distilbert"))

THANKS_EXACT = {
    "ok", "k", "kk", "okay", "thanks", "thank you", "thx", "done", "noted",
    "cool", "nice", "👍", "🙏", "shukriya", "dhanyavad",
}
GREETING_EXACT = {
    "hi", "hey", "hello", "hii", "good morning", "good evening", "namaste",
}
UNSUPPORTED_HINT = re.compile(
    r"unsupported message type|could not deliver this content|voice message|"
    r"^sticker$|^photo$|^\[image\]$|^\[audio\]$|^\[video\]$|^\[document\]$",
    re.I,
)

app = FastAPI(
    title="CEP Intent Classifier (DistilBERT)",
    description="group/sub intents via DistilBERT — EN + Hinglish. Not an LLM chatbot.",
    version="2.0.0-distilbert",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_tokenizer = None
_model = None
_id2label: dict[int, str] = {}
_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def get_model():
    global _tokenizer, _model, _id2label
    if _model is None:
        if not MODEL_DIR.exists():
            raise HTTPException(
                status_code=503,
                detail=f"Model not found at {MODEL_DIR}. Run train.py --bake first.",
            )
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
        _model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
        _model.to(_device)
        _model.eval()
        cfg = _model.config
        raw = getattr(cfg, "id2label", {}) or {}
        _id2label = {int(k): v for k, v in raw.items()}
        if not _id2label:
            _id2label = {i: label for i, label in enumerate(INTENTS)}
    return _tokenizer, _model


class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1)
    channel: str | None = None


class ClassifyResponse(BaseModel):
    intent: str
    group: str
    sub: str
    confidence: float
    intents: list[str] = list(INTENTS)
    groups: list[str] = list(GROUPS)
    scores: dict[str, float]


class BatchClassifyRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=100)


@app.get("/health")
def health():
    ready = MODEL_DIR.exists()
    return {
        "ok": True,
        "model_loaded": _model is not None,
        "model_path": str(MODEL_DIR),
        "model_ready": ready,
        "groups": list(GROUPS),
        "intents": list(INTENTS),
        "engine": "distilbert",
        "taxonomy": "group/sub",
        "languages": ["en", "hinglish"],
        "device": str(_device),
        "llm": False,
    }


@app.get("/intents")
def list_intents():
    return {
        "groups": list(GROUPS),
        "intents": [
            {
                "id": i,
                "group": split_label(i)[0],
                "sub": split_label(i)[1],
                "description": INTENT_DESCRIPTIONS.get(i, ""),
            }
            for i in INTENTS
        ],
    }


def _empty_scores() -> dict[str, float]:
    return {i: 0.0 for i in INTENTS}


def _response(label: str, confidence: float, scores: dict[str, float]) -> ClassifyResponse:
    if not is_intent(label):
        label = "noise/spam"
    group, sub = split_label(label)
    return ClassifyResponse(
        intent=label,
        group=group,
        sub=sub,
        confidence=round(confidence, 4),
        scores={k: round(v, 4) for k, v in scores.items()},
    )


@torch.inference_mode()
def _predict_one(text: str) -> ClassifyResponse:
    cleaned = " ".join(text.strip().split())
    if len(cleaned) < 1:
        raise HTTPException(status_code=400, detail="Empty text")

    lower = cleaned.lower()
    if UNSUPPORTED_HINT.search(cleaned):
        scores = _empty_scores()
        scores["noise/spam"] = 1.0
        return _response("noise/spam", 1.0, scores)
    if lower in THANKS_EXACT or (len(cleaned) <= 2 and lower in {"ok", "k", "kk"}):
        scores = _empty_scores()
        scores["noise/thanks"] = 1.0
        return _response("noise/thanks", 1.0, scores)
    if lower in GREETING_EXACT:
        scores = _empty_scores()
        scores["noise/greeting"] = 1.0
        return _response("noise/greeting", 1.0, scores)

    tokenizer, model = get_model()
    enc = tokenizer(
        cleaned,
        truncation=True,
        padding=True,
        max_length=64,
        return_tensors="pt",
    )
    enc = {k: v.to(_device) for k, v in enc.items()}
    logits = model(**enc).logits[0]
    probs = torch.softmax(logits, dim=-1).cpu().tolist()

    scores = _empty_scores()
    for idx, p in enumerate(probs):
        label = _id2label.get(idx)
        if label:
            scores[label] = float(p)

    best_label, best_p = max(scores.items(), key=lambda kv: kv[1])
    return _response(best_label, best_p, scores)


@app.post("/classify", response_model=ClassifyResponse)
def classify(body: ClassifyRequest):
    return _predict_one(body.text)


@app.post("/classify/batch")
def classify_batch(body: BatchClassifyRequest) -> dict[str, Any]:
    return {"results": [_predict_one(t) for t in body.texts]}


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8091"))
    uvicorn.run("server:app", host=host, port=port, reload=False)
