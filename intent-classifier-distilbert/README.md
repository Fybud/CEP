# CEP DistilBERT Intent Classifier
#
# Alternative to `intent-classifier/` (TF-IDF + LogisticRegression).
# Same API + port **8091**. Run only ONE of them in prod.

## When to use which

| Service | Folder | Specs | Notes |
|---------|--------|-------|-------|
| LogReg | `intent-classifier/` | ~512 MB RAM | Fast, classic ML |
| DistilBERT | `intent-classifier-distilbert/` | ~2–4 GB RAM | Better messy EN/Hinglish |

CEP still points at:
```
INTENT_CLASSIFIER_URL=http://intent-classifier:8091
```
Container name is `intent-classifier` in both compose files so the URL stays the same.

## Setup

```bash
cd intent-classifier-distilbert
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Data

Reuse the LogReg train CSV (same taxonomy):

```bash
# if needed:
cd ../intent-classifier && python prepare_data.py
cp ../intent-classifier/data/train.csv data/train.csv
```

## Train (GPU recommended)

```bash
# Windows + NVIDIA: install CUDA PyTorch first
pip install torch --index-url https://download.pytorch.org/whl/cu128

python train.py --epochs 2 --batch-size 16 --bake
# lighter smoke:
# python train.py --epochs 1 --max-rows 5000 --bake
```

Needs ~4 GB VRAM (RTX 4060 is fine). CPU works but is much slower.

## Run locally

```bash
# stop LogReg container first if it holds :8091
python server.py
```

## Docker (prod swap)

```bash
# stop the other classifier
cd ../intent-classifier && docker compose down

cd ../intent-classifier-distilbert
docker compose up -d --build
```

## API (same as LogReg)

```bash
GET  /health
POST /classify  {"text":"Order kab deliver hoga?"}
# → intent=order/status, group=order, sub=status
```
