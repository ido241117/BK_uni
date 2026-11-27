"""Lazy wrappers around the two models used to build candidates: a sentence-embedding model and
spaCy (part-of-speech tags for noun phrases). Both load on first use."""

from __future__ import annotations

import re
from functools import cached_property

import numpy as np

_TOKEN = re.compile(r"[a-z][a-z0-9+#\-]*")


class Embedder:
    def __init__(self, name: str) -> None:
        self.name = name

    @cached_property
    def model(self):
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer(self.name, device="cpu")

    def encode(self, texts: list[str]) -> np.ndarray:
        """Unit-length vectors, so a dot product is a cosine similarity."""
        if not texts:
            return np.zeros((0, self.model.get_sentence_embedding_dimension()), dtype=np.float32)
        return self.model.encode(texts, normalize_embeddings=True, batch_size=128)


class NounPhraser:
    """Noun phrases of 1..max_words consecutive NOUN/PROPN/ADJ tokens ending in a noun. Any other
    token or punctuation ends the phrase, so words are never joined across a removed word
    ("principles of machine learning" gives "machine learning", never "principles machine
    learning") and verb phrases ("identifying appropriate") never appear."""

    def __init__(self, model: str, max_words: int, stop_words: list[str], excluded_entities: list[str]) -> None:
        self.model_name = model
        self.max_words = max_words
        self.stop = {w.lower() for w in stop_words}
        self.excluded = set(excluded_entities)

    def settings(self) -> dict:
        """Everything that changes the output; stored with the phrase cache."""
        return {"model": self.model_name, "max_words": self.max_words, "stop": sorted(self.stop),
                "excluded": sorted(self.excluded)}

    @cached_property
    def nlp(self):
        import spacy
        nlp = spacy.load(self.model_name, disable=["parser", "lemmatizer"])
        nlp.max_length = 2_000_000
        return nlp

    def _keep(self, tok) -> bool:
        return (tok.pos_ in ("NOUN", "PROPN", "ADJ") and not tok.is_stop and tok.lower_ not in self.stop
                and tok.ent_type_ not in self.excluded and len(tok.lower_) > 1
                and _TOKEN.fullmatch(tok.lower_) is not None)

    def phrases(self, lines: list[str]) -> list[list[str]]:
        """Noun phrases of each line (one list per input line)."""
        out = []
        for doc in self.nlp.pipe(lines, batch_size=256):
            found: set[str] = set()
            run: list = []
            for tok in [*doc, None]:
                if tok is not None and self._keep(tok):
                    run.append(tok)
                    continue
                for i in range(len(run)):
                    for n in range(1, self.max_words + 1):
                        if i + n <= len(run) and run[i + n - 1].pos_ in ("NOUN", "PROPN"):
                            found.add(" ".join(t.lower_ for t in run[i:i + n]))
                run = []
            out.append(sorted(found))
        return out
