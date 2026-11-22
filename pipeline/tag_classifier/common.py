"""Phần dùng chung: đọc cấu hình, đường dẫn, đọc/ghi JSON Lines."""

from __future__ import annotations

import gzip
import json
import sys
import tomllib
from pathlib import Path
from typing import Any, Iterable, Iterator

ROOT = Path(__file__).resolve().parent
# Syllabus sections that describe what a course is about: the text candidates and scores come from.
TOPIC_SECTIONS = ("summary", "objectives", "learning_outcomes", "sessions")


def utf8_stdout() -> None:
    """Console Windows mặc định cp1252, in tiếng Việt sẽ lỗi."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def load_config(path: Path | None = None) -> dict[str, Any]:
    with open(path or ROOT / "config.toml", "rb") as f:
        return tomllib.load(f)


def resolve(rel: str) -> Path:
    """Đường dẫn trong config tính từ thư mục tag_classifier/."""
    return (ROOT / rel).resolve()


def _open(path: Path, mode: str):
    if path.suffix == ".gz":
        return gzip.open(path, mode + "t", encoding="utf-8")
    return open(path, mode, encoding="utf-8", newline="\n")


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with _open(path, "w") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True, default=str) + "\n")
            n += 1
    return n


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with _open(path, "r") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True, default=str)
        f.write("\n")


def read_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# --- pipeline files (paths from config.toml) -----------------------------------------------------

def load_records(cfg: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Cleaned courses (step 1b) by course code."""
    return {r["code"]: r for r in read_jsonl(resolve(cfg["paths"]["courses_file"]))}


def load_candidates(cfg: dict[str, Any], code: str, evaluation: bool = False) -> list[dict[str, Any]]:
    """A family's candidates (reviewed and exported); with evaluation, also the evaluation-only ones
    (specialization lists, scored for the evaluation only)."""
    data = read_json(resolve(cfg["candidates"]["out_dir"]) / f"{code}.json")
    return data["candidates"] + (data.get("evaluation_candidates", []) if evaluation else [])


def load_scores(cfg: dict[str, Any], name: str) -> dict[str, Any]:
    """A scores file of step 3, by file name in data/scores (e.g. CS-2023-KHMT.json)."""
    return read_json(resolve(cfg["classify"]["out_dir"]) / name)


def stale_models(scores: dict[str, Any], renames: dict[str, str]) -> list[str]:
    """Models whose scores were computed with other renames than the review workbook's current ones."""
    return sorted(m for m in scores["scores"] if scores.get("renamed", {}).get(m, {}) != renames)


# --- choosing program families on the command line -----------------------------------------------

def add_family_args(ap: Any) -> None:
    ap.add_argument("--family", action="append", help="program family, e.g. CS-KHMT (repeatable)")
    ap.add_argument("--all", action="store_true", help="every family that has a candidates file")


def chosen_families(cfg: dict[str, Any], args: Any) -> list[str]:
    """Family ids from --family (repeatable) or --all (every family with a candidates file)."""
    if args.family and args.all:
        raise SystemExit("give --family or --all, not both")
    if args.family:
        return list(dict.fromkeys(args.family))
    if args.all:
        codes = sorted(p.stem for p in resolve(cfg["candidates"]["out_dir"]).glob("*.json"))
        if not codes:
            raise SystemExit("no candidate files yet: run candidates first")
        return codes
    raise SystemExit("give --family ID (repeatable, e.g. CS-KHMT) or --all")


def scores_names(cfg: dict[str, Any], args: Any) -> list[str]:
    """Scores file names for aggregate / evaluate / review: --scores (one family) or <family>.json."""
    codes = chosen_families(cfg, args)
    if getattr(args, "scores", None):
        if len(codes) != 1:
            raise SystemExit("--scores needs exactly one --family")
        return [args.scores]
    return [f"{code}.json" for code in codes]
