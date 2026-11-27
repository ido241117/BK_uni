"""Zip what the Colab notebook needs -> data/colab_bundle.zip

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.bundle

Contains the package code, config, data/courses.jsonl, the curricula file, the candidate files and
the review workbooks (their Rename column changes what is scored), plus the current score cache so Colab skips pairs already scored. No database settings (.env), no
raw syllabus snapshot: the notebook never needs database access.
"""

from __future__ import annotations

import zipfile

from tag_classifier.common import ROOT, load_config, resolve, utf8_stdout


def main() -> None:
    utf8_stdout()
    cfg = load_config()
    files = sorted(ROOT.glob("*.py")) + [ROOT / "config.toml", ROOT / "requirements.txt"]
    files += [resolve(cfg["paths"]["courses_file"]), resolve(cfg["paths"]["snapshot_dir"]) / "curricula.json"]
    files += sorted(resolve(cfg["candidates"]["out_dir"]).glob("*.json"))
    files += sorted(resolve(cfg["review"]["out_dir"]).glob("*.xlsx"))
    cache = resolve(cfg["classify"]["cache"])
    if cache.exists():
        files.append(cache)
    out = resolve("data/colab_bundle.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.write(f, f"tag_classifier/{f.relative_to(ROOT).as_posix()}")
    print(f"{len(files)} files, {out.stat().st_size / 1e6:.1f} MB -> {out}")


if __name__ == "__main__":
    main()
