"""Merge a score cache produced elsewhere (Colab) into the local one, without losing local scores.

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.merge_cache path/to/scores.sqlite
"""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from tag_classifier.classify import ScoreCache, missing_pairs
from tag_classifier.common import load_config, resolve, utf8_stdout


def merge(local: Path, other: Path) -> int:
    ScoreCache(local)  # creates the table if the local cache does not exist yet
    db = sqlite3.connect(local)
    before = db.execute("select count(*) from scores").fetchone()[0]
    db.execute("attach database ? as other", (str(other),))
    db.execute("insert or ignore into scores select * from other.scores")
    db.commit()
    added = db.execute("select count(*) from scores").fetchone()[0] - before
    db.close()
    return added


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("other", type=Path)
    args = ap.parse_args(argv)
    utf8_stdout()
    cfg = load_config()
    local = resolve(cfg["classify"]["cache"])
    print(f"{merge(local, args.other)} new scores merged into {local}")
    # A bundle made before the candidates changed scores the old tags: show what is still missing.
    for path in sorted(resolve(cfg["candidates"]["out_dir"]).glob("*.json")):
        missing = {m: n for m, n in missing_pairs(path.stem, cfg).items() if n}
        print(f"  {path.stem}: " + (f"still to score {missing} (new bundle -> Colab, or classify on the CPU)"
                                     if missing else "every pair of the current candidates is scored"))


if __name__ == "__main__":
    main()
