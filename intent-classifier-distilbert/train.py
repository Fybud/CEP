"""
Fine-tune DistilBERT (multilingual) on CEP group/sub intent labels.
English + Hinglish. Same taxonomy as intent-classifier (LogReg).
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import classification_report, accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from torch.utils.data import Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
)

from labels import GROUPS, INTENTS, split_label

ROOT = Path(__file__).resolve().parent
DATA_CSV = ROOT / "data" / "train.csv"
MODEL_DIR = ROOT / "models" / "distilbert"
BUNDLED_DIR = ROOT / "bundled_model"
DEFAULT_BASE = "distilbert-base-multilingual-cased"


class IntentDataset(Dataset):
    def __init__(self, texts: list[str], labels: list[int], tokenizer, max_length: int):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.texts)

    def __getitem__(self, idx: int):
        enc = self.tokenizer(
            self.texts[idx],
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            return_tensors="pt",
        )
        item = {k: v.squeeze(0) for k, v in enc.items()}
        item["labels"] = torch.tensor(self.labels[idx], dtype=torch.long)
        return item


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {
        "accuracy": float(accuracy_score(labels, preds)),
        "f1_macro": float(f1_score(labels, preds, average="macro", zero_division=0)),
        "f1_weighted": float(f1_score(labels, preds, average="weighted", zero_division=0)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train DistilBERT intent classifier")
    parser.add_argument("--csv", type=Path, default=DATA_CSV)
    parser.add_argument("--base-model", default=DEFAULT_BASE)
    parser.add_argument("--out", type=Path, default=MODEL_DIR)
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--max-length", type=int, default=64)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-rows", type=int, default=0, help="0 = all rows")
    parser.add_argument("--bake", action="store_true")
    args = parser.parse_args()

    if not args.csv.exists():
        raise SystemExit(
            f"Missing {args.csv}. Copy from intent-classifier/data/train.csv "
            "or run: cd ../intent-classifier && python prepare_data.py"
        )

    df = pd.read_csv(args.csv).dropna(subset=["text", "intent"])
    df = df[df["intent"].isin(INTENTS)]
    if args.max_rows and args.max_rows > 0:
        df = df.sample(n=min(args.max_rows, len(df)), random_state=args.seed)

    counts = df["intent"].value_counts()
    df = df[df["intent"].isin(counts[counts >= 2].index)]
    label2id = {label: i for i, label in enumerate(INTENTS)}
    id2label = {i: label for label, i in label2id.items()}
    # Only keep labels present in data
    present = sorted(df["intent"].unique(), key=lambda x: INTENTS.index(x))
    label2id = {label: i for i, label in enumerate(present)}
    id2label = {i: label for label, i in label2id.items()}

    texts = df["text"].astype(str).tolist()
    y = [label2id[i] for i in df["intent"].astype(str)]

    x_train, x_test, y_train, y_test = train_test_split(
        texts, y, test_size=0.15, random_state=args.seed, stratify=y
    )

    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.base_model,
        num_labels=len(label2id),
        id2label=id2label,
        label2id=label2id,
    )

    train_ds = IntentDataset(x_train, y_train, tokenizer, args.max_length)
    eval_ds = IntentDataset(x_test, y_test, tokenizer, args.max_length)

    use_cuda = torch.cuda.is_available()
    print(f"Device: {'cuda' if use_cuda else 'cpu'} | train={len(train_ds)} eval={len(eval_ds)} classes={len(label2id)}")

    args.out.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(args.out / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1_weighted",
        greater_is_better=True,
        logging_steps=50,
        fp16=use_cuda,
        dataloader_pin_memory=use_cuda,
        report_to=[],
        seed=args.seed,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        compute_metrics=compute_metrics,
    )
    trainer.train()
    metrics = trainer.evaluate()
    print("Eval:", metrics)

    pred_out = trainer.predict(eval_ds)
    pred_ids = np.argmax(pred_out.predictions, axis=-1)
    y_true_labels = [id2label[i] for i in y_test]
    y_pred_labels = [id2label[i] for i in pred_ids]
    report = classification_report(y_true_labels, y_pred_labels, digits=3, zero_division=0)
    print(report)

    y_true_g = [split_label(y)[0] for y in y_true_labels]
    y_pred_g = [split_label(y)[0] for y in y_pred_labels]
    group_report = classification_report(
        y_true_g, y_pred_g, digits=3, zero_division=0, labels=list(GROUPS)
    )
    print("=== Group-level ===")
    print(group_report)

    trainer.save_model(str(args.out))
    tokenizer.save_pretrained(str(args.out))
    meta = {
        "model": "distilbert",
        "base_model": args.base_model,
        "taxonomy": "group/sub",
        "groups": list(GROUPS),
        "intents": list(present),
        "label2id": label2id,
        "id2label": {str(k): v for k, v in id2label.items()},
        "train_rows": len(train_ds),
        "test_rows": len(eval_ds),
        "eval_metrics": {k: float(v) for k, v in metrics.items() if isinstance(v, (int, float))},
        "report": report,
        "group_report": group_report,
        "languages": ["en", "hinglish"],
        "llm": False,
        "engine": "distilbert_finetune",
    }
    (args.out / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved model -> {args.out}")

    if args.bake:
        if BUNDLED_DIR.exists():
            shutil.rmtree(BUNDLED_DIR)
        shutil.copytree(
            args.out,
            BUNDLED_DIR,
            ignore=shutil.ignore_patterns("checkpoints", "runs", "*.tmp"),
        )
        print(f"Baked -> {BUNDLED_DIR}")


if __name__ == "__main__":
    main()
