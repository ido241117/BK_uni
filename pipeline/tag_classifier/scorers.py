"""Scorers: each returns, for (text, label) pairs, a score in 0..1 for "this text is about this label".

    nli        zero-shot NLI model: P(entailment) of "This course is about {label}." given the text
    embedding  cosine similarity of text and label embeddings (rescaled to 0..1)
    keyword    1.0 if the label (or one of its cluster phrases) appears verbatim, else 0.0
"""

from __future__ import annotations

from functools import cached_property

import numpy as np

from tag_classifier.models import Embedder
from tag_classifier.text import phrase_pattern


class NLIScorer:
    def __init__(self, name: str, hypothesis: str, max_tokens: int, batch_size: int) -> None:
        self.name = name
        self.hypothesis = hypothesis
        self.max_tokens = max_tokens
        self.batch_size = batch_size

    @cached_property
    def model(self):
        """(tokenizer, model, device, entailment index, contradiction index or None). Uses the GPU in
        half precision when one is available (Colab), else the CPU."""
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        tok = AutoTokenizer.from_pretrained(self.name)
        model = AutoModelForSequenceClassification.from_pretrained(self.name, dtype=dtype).to(device).eval()
        labels = {v.lower(): int(k) for k, v in model.config.id2label.items()}
        entail = next(i for name, i in labels.items() if name.startswith("entail"))
        contra = next((i for name, i in labels.items() if name.startswith("contradict")), None)
        return tok, model, device, entail, contra

    def score(self, texts: list[str], labels: list[str]) -> np.ndarray:
        """P(entailment). Three-class models (entailment / neutral / contradiction) ignore neutral, as
        the Hugging Face zero-shot pipeline does with multi_label=True; two-class models (the
        zeroshot-v2.0 series: entailment / not_entailment) use both classes."""
        import torch
        tok, model, device, entail, contra = self.model
        out = []
        for i in range(0, len(texts), self.batch_size):
            batch = tok(texts[i:i + self.batch_size],
                        [self.hypothesis.format(label=x) for x in labels[i:i + self.batch_size]],
                        truncation="only_first", max_length=self.max_tokens, padding=True,
                        return_tensors="pt").to(device)
            with torch.inference_mode():
                logits = model(**batch).logits.float()
            if contra is not None:
                probs = logits[:, [contra, entail]].softmax(-1)[:, 1]
            else:
                probs = logits.softmax(-1)[:, entail]
            out.append(probs.cpu().numpy())
        return np.concatenate(out) if out else np.zeros(0)


class EmbeddingScorer:
    def __init__(self, name: str) -> None:
        self.embedder = Embedder(name)

    def score(self, texts: list[str], labels: list[str]) -> np.ndarray:
        """Each distinct text and label is encoded once (a section is paired with every tag)."""
        def vectors(items: list[str]) -> np.ndarray:
            uniq = sorted(set(items))
            pos = {x: i for i, x in enumerate(uniq)}
            return self.embedder.encode(uniq)[[pos[x] for x in items]]
        return ((vectors(texts) * vectors(labels)).sum(axis=1) + 1) / 2


class KeywordScorer:
    """The label itself, or any of its phrases, appears verbatim. `labels` items may hold several
    phrases separated by ' | '."""

    def score(self, texts: list[str], labels: list[str]) -> np.ndarray:
        return np.array([float(any(phrase_pattern(p).search(text.lower()) for p in label.split("|") if p.strip()))
                         for text, label in zip(texts, labels)])


def make_scorer(spec: dict):
    kind = spec["kind"]
    if kind == "nli":
        return NLIScorer(spec["model"], spec["hypothesis"], spec["max_tokens"], spec["batch_size"])
    if kind == "embedding":
        return EmbeddingScorer(spec["model"])
    if kind == "keyword":
        return KeywordScorer()
    raise ValueError(f"unknown scorer kind {kind}")
