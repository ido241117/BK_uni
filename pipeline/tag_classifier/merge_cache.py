"""Merge a score cache produced elsewhere (Colab) into the local one, without losing local scores.

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.merge_cache path/to/scores.sqlite
"""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from tag_classifier.classify import ScoreCache
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
    local = resolve(load_config()["classify"]["cache"])
    print(f"{merge(local, args.other)} new scores merged into {local}")


if __name__ == "__main__":
    main()
