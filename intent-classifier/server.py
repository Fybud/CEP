"""
CEP Intent Classifier API

Predicts group/sub leaf labels (English + Hinglish).
Classic ML (word+char TF-IDF + LogisticRegression) — not an LLM.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from labels import GROUPS, INTENT_DESCRIPTIONS, INTENTS, is_intent, split_label

ROOT = Path(__file__).resolve().parent
MODEL_PATH = Path(os.getenv("INTENT_MODEL_PATH", ROOT / "models" / "intent_clf.joblib"))

# Rule hints when model is unsure
STATUS_HINT = re.compile(
    r"\b(where is my order|track(ing)?|awb|eta|out for delivery|"
    r"kab deliver|shipment|order status|delayed)\b",
    re.I,
)
PRODUCT_HINT = re.compile(
    r"\b(size|stock|available|colour|color|material|size chart|"
    r"in stock|do you have)\b",
    re.I,
)
PRICE_HINT = re.compile(
    r"\b(price|discount|cod|kitne|offer|coupon|cost)\b",
    re.I,
)
RETURN_HINT = re.compile(
    r"\b(refund|return|exchange|money back)\b",
    re.I,
)
DELIVERY_ISSUE_HINT = re.compile(
    r"\b(damaged|broken|wrong item|missing|lost|not received|toot|galat)\b",
    re.I,
)
CHANGE_HINT = re.compile(
    r"\b(cancel (my )?order|change (my )?(address|order)|address change)\b",
    re.I,
)
HUMAN_HINT = re.compile(
    r"\b(human|agent|executive|real person|customer care|"
    r"agent se baat|human agent)\b",
    re.I,
)
THANKS_EXACT = {
    "ok",
    "k",
    "kk",
    "okay",
    "thanks",
    "thank you",
    "thx",
    "done",
    "noted",
    "cool",
    "nice",
    "👍",
    "🙏",
    "shukriya",
    "dhanyavad",
}
GREETING_EXACT = {
    "hi",
    "hey",
    "hello",
    "hii",
    "good morning",
    "good evening",
    "namaste",
}
UNSUPPORTED_HINT = re.compile(
    r"unsupported message type|could not deliver this content|voice message|"
    r"^sticker$|^photo$|^\[image\]$|^\[audio\]$|^\[video\]$|^\[document\]$",
    re.I,
)

app = FastAPI(
    title="CEP Intent Classifier",
    description="group/sub intents for EN + Hinglish. Classic ML — not an LLM.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_model = None


def get_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise HTTPException(
                status_code=503,
                detail=f"Model not found at {MODEL_PATH}. Run prepare_data.py then train.py.",
            )
        _model = joblib.load(MODEL_PATH)
    return _model


class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1)
    channel: str | None = None


class ClassifyResponse(BaseModel):
    """Leaf = group/sub. `intent` is the full leaf for CEP storage."""

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
    ready = MODEL_PATH.exists()
    return {
        "ok": True,
        "model_loaded": _model is not None,
        "model_path": str(MODEL_PATH),
        "model_ready": ready,
        "groups": list(GROUPS),
        "intents": list(INTENTS),
        "engine": "tfidf_word_char_logreg",
        "taxonomy": "group/sub",
        "languages": ["en", "hinglish"],
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
        # fallback if model has unexpected class
        label = "noise/spam"
    group, sub = split_label(label)
    return ClassifyResponse(
        intent=label,
        group=group,
        sub=sub,
        confidence=round(confidence, 4),
        scores={k: round(v, 4) for k, v in scores.items()},
    )


def _boost(scores: dict[str, float], label: str, value: float) -> None:
    if label in scores:
        scores[label] = max(scores[label], value)


def _predict_one(text: str) -> ClassifyResponse:
    model = get_model()
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

    proba = model.predict_proba([cleaned])[0]
    classes = list(model.classes_)
    scores: dict[str, float] = {c: float(p) for c, p in zip(classes, proba)}
    for intent in INTENTS:
        scores.setdefault(intent, 0.0)

    top = max(scores.values()) if scores else 0.0
    if top < 0.50:
        if HUMAN_HINT.search(cleaned):
            _boost(scores, "noise/human", 0.78)
        elif STATUS_HINT.search(cleaned):
            _boost(scores, "order/status", 0.75)
        elif CHANGE_HINT.search(cleaned):
            _boost(scores, "order/change", 0.75)
        elif DELIVERY_ISSUE_HINT.search(cleaned):
            _boost(scores, "post_purchase/delivery", 0.75)
        elif RETURN_HINT.search(cleaned):
            _boost(scores, "post_purchase/return", 0.75)
        elif PRICE_HINT.search(cleaned):
            _boost(scores, "pre_purchase/price", 0.72)
        elif PRODUCT_HINT.search(cleaned):
            _boost(scores, "pre_purchase/product", 0.72)

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
