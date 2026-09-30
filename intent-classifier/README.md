# CEP Intent Classifier
#
# Classic ML (word + char TF-IDF + LogisticRegression). Not an LLM.
# English + Hinglish. Predicts group/sub leaf labels.

## Taxonomy

```
pre_purchase → product | price | shipping | other
order        → status | change | payment | other
post_purchase→ delivery | return | feedback | other
noise        → thanks | greeting | human | spam
```

Model predicts a **leaf** (`order/status`). CEP stores `intent` = leaf and `intentGroup` = group.

## Setup

```bash
cd intent-classifier
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate
pip install -r requirements.txt
```

## Train

```bash
python prepare_data.py
python train.py --bake
```

`--bake` copies into `bundled_model/` for Docker.

## Run server

```bash
python server.py
# → http://127.0.0.1:8091
```

```bash
GET  /health
GET  /intents
POST /classify   {"text":"Order kab deliver hoga?"}
# → { "intent":"order/status", "group":"order", "sub":"status", "confidence":0.98, ... }
```

## Docker (shared — run once for demo + svasthyaa)

```bash
docker compose up -d --build
```

Both APIs:

```
INTENT_CLASSIFIER_URL=http://intent-classifier:8091
```

**Swap to DistilBERT** (same port/URL): stop this stack, then start `../intent-classifier-distilbert` — see that folder's README.

After retraining:

```bash
python prepare_data.py && python train.py --bake
docker compose up -d --build
```
