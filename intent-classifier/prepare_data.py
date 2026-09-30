"""Build train.csv: Bitext + Hinglish + synthetic EN/Hinglish → group/sub leaves."""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

from datasets import load_dataset

from labels import (
    BITEXT_TO_INTENT,
    HINGLISH_TO_INTENT,
    INTENTS,
    SYNTHETIC,
)

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"


def _row(text: str, intent: str, source: str) -> dict[str, str] | None:
    cleaned = " ".join((text or "").strip().split())
    if len(cleaned) < 1:
        return None
    if intent not in INTENTS:
        return None
    return {"text": cleaned, "intent": intent, "source": source}


def _cap_buckets(
    buckets: dict[str, list[dict[str, str]]],
    max_per_intent: int,
    tag: str,
) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for intent, items in buckets.items():
        random.shuffle(items)
        kept = items[:max_per_intent]
        print(f"  {tag} {intent}: {len(kept)} / {len(items)}")
        out.extend(kept)
    return out


def load_bitext(max_per_intent: int) -> list[dict[str, str]]:
    print("Downloading Bitext retail ecommerce dataset…")
    ds = load_dataset(
        "bitext/Bitext-retail-ecommerce-llm-chatbot-training-dataset",
        split="train",
    )
    buckets: dict[str, list[dict[str, str]]] = {}
    for row in ds:
        raw = (row.get("intent") or "").strip()
        mapped = BITEXT_TO_INTENT.get(raw)
        if not mapped:
            continue
        instruction = (row.get("instruction") or row.get("utterance") or "").strip()
        text = instruction or (row.get("response") or "")
        item = _row(str(text), mapped, f"bitext:{raw}")
        if not item:
            continue
        buckets.setdefault(mapped, []).append(item)
    return _cap_buckets(buckets, max_per_intent, "bitext")


def load_hinglish(max_per_intent: int) -> list[dict[str, str]]:
    print("Downloading Hinglish retail intent dataset…")
    try:
        ds = load_dataset("Hari5115/hinglish-retail-intent-dataset", split="train")
    except Exception as err:  # noqa: BLE001
        print(f"  skipped hinglish ({err})")
        return []

    buckets: dict[str, list[dict[str, str]]] = {}
    for row in ds:
        raw = (row.get("label") or row.get("intent") or "").strip()
        mapped = HINGLISH_TO_INTENT.get(raw)
        if not mapped:
            continue
        text = row.get("text") or row.get("utterance") or ""
        item = _row(str(text), mapped, f"hinglish:{raw}")
        if not item:
            continue
        buckets.setdefault(mapped, []).append(item)
    return _cap_buckets(buckets, max_per_intent, "hinglish")


def synthetic_rows(repeats: int = 3) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for intent, texts in SYNTHETIC.items():
        for text in texts:
            item = _row(text, intent, "synthetic")
            if not item:
                continue
            for i in range(repeats):
                rows.append(item if i == 0 else {**item, "source": f"synthetic:r{i}"})
                # light paraphrase variants
                variant = _row(f"{text} please", intent, "synthetic:variant")
                if variant:
                    rows.append(variant)
    return rows


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "intent", "source"])
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare CEP hierarchical intent CSV")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-per-intent", type=int, default=900)
    parser.add_argument("--synthetic-repeats", type=int, default=4)
    args = parser.parse_args()
    random.seed(args.seed)

    rows: list[dict[str, str]] = []
    rows.extend(load_bitext(args.max_per_intent))
    rows.extend(load_hinglish(args.max_per_intent))
    rows.extend(synthetic_rows(args.synthetic_repeats))
    random.shuffle(rows)

    counts: dict[str, int] = {}
    for r in rows:
        counts[r["intent"]] = counts.get(r["intent"], 0) + 1

    out = DATA_DIR / "train.csv"
    write_csv(out, rows)
    print(f"\nWrote {len(rows)} rows -> {out}")
    for intent in INTENTS:
        print(f"  {intent}: {counts.get(intent, 0)}")
    missing = [i for i in INTENTS if counts.get(i, 0) == 0]
    if missing:
        print(f"WARNING missing classes: {missing}")


if __name__ == "__main__":
    main()
