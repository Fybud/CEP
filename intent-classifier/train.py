"""
Train hierarchical intent classifier (group/sub leaves).

Word TF-IDF + char_wb TF-IDF (helps English + Hinglish romanized) → LogisticRegression.
Classic ML — not an LLM.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline

from labels import GROUPS, INTENTS, split_label

ROOT = Path(__file__).resolve().parent
DATA_CSV = ROOT / "data" / "train.csv"
MODEL_DIR = ROOT / "models"
BUNDLED_DIR = ROOT / "bundled_model"


def build_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            (
                "features",
                FeatureUnion(
                    transformer_list=[
                        (
                            "word",
                            TfidfVectorizer(
                                lowercase=True,
                                ngram_range=(1, 2),
                                min_df=2,
                                max_features=40_000,
                                sublinear_tf=True,
                            ),
                        ),
                        (
                            "char",
                            TfidfVectorizer(
                                analyzer="char_wb",
                                ngram_range=(3, 5),
                                min_df=2,
                                max_features=30_000,
                                sublinear_tf=True,
                            ),
                        ),
                    ]
                ),
            ),
            (
                "clf",
                LogisticRegression(
                    max_iter=5000,
                    class_weight="balanced",
                    solver="saga",
                    n_jobs=-1,
                    C=2.0,
                ),
            ),
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Train CEP intent classifier")
    parser.add_argument("--csv", type=Path, default=DATA_CSV)
    parser.add_argument("--out", type=Path, default=MODEL_DIR)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--bake",
        action="store_true",
        help="Also copy model into bundled_model/ for Docker",
    )
    args = parser.parse_args()

    if not args.csv.exists():
        raise SystemExit(f"Missing {args.csv}. Run: python prepare_data.py")

    df = pd.read_csv(args.csv)
    df = df.dropna(subset=["text", "intent"])
    df = df[df["intent"].isin(INTENTS)]
    if df.empty:
        raise SystemExit("No usable rows after filtering.")

    # Drop classes with < 2 samples (can't stratify)
    counts = df["intent"].value_counts()
    keep = counts[counts >= 2].index
    df = df[df["intent"].isin(keep)]
    if len(df["intent"].unique()) < 2:
        raise SystemExit("Need at least 2 intent classes with enough rows.")

    x_train, x_test, y_train, y_test = train_test_split(
        df["text"].astype(str),
        df["intent"].astype(str),
        test_size=0.15,
        random_state=args.seed,
        stratify=df["intent"],
    )

    pipe = build_pipeline()
    print(f"Training on {len(x_train)} rows, evaluating on {len(x_test)}...")
    print(f"Classes: {sorted(df['intent'].unique())}")
    pipe.fit(x_train, y_train)
    pred = pipe.predict(x_test)
    report = classification_report(y_test, pred, digits=3, zero_division=0)
    print(report)

    # Group-level accuracy (derive group from leaf)
    y_test_g = [split_label(y)[0] for y in y_test]
    pred_g = [split_label(p)[0] for p in pred]
    group_report = classification_report(
        y_test_g, pred_g, digits=3, zero_division=0, labels=list(GROUPS)
    )
    print("=== Group-level ===")
    print(group_report)

    args.out.mkdir(parents=True, exist_ok=True)
    model_path = args.out / "intent_clf.joblib"
    meta_path = args.out / "meta.json"
    joblib.dump(pipe, model_path)

    meta = {
        "model": "tfidf_word_char_logreg",
        "taxonomy": "group/sub",
        "groups": list(GROUPS),
        "intents": list(INTENTS),
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "report": report,
        "group_report": group_report,
        "note": "Classic ML (word+char TF-IDF) for English + Hinglish — not an LLM.",
        "languages": ["en", "hi-Latn", "hinglish"],
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Saved model -> {model_path}")
    print(f"Saved meta  -> {meta_path}")

    if args.bake:
        BUNDLED_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(model_path, BUNDLED_DIR / "intent_clf.joblib")
        shutil.copy2(meta_path, BUNDLED_DIR / "meta.json")
        print(f"Baked -> {BUNDLED_DIR}")


if __name__ == "__main__":
    main()
