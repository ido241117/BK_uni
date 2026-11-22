"""Shared chart style and Markdown helpers for the reports (reference palette of the dataviz
guidance; the first three categorical colours pass every colour-blindness pair check)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

SURFACE = "#fcfcfb"
TEXT = "#0b0b0b"
TEXT_2 = "#52514e"
GRID = "#e4e3df"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
# Single-hue sequential ramp (light -> dark blue) for heatmaps.
SEQUENTIAL = "Blues"


def style() -> None:
    plt.rcParams.update({
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
        "axes.edgecolor": GRID, "axes.labelcolor": TEXT_2, "xtick.color": TEXT_2, "ytick.color": TEXT_2,
        "text.color": TEXT, "axes.spines.top": False, "axes.spines.right": False,
        "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.axisbelow": True,
        "font.size": 9, "axes.titlesize": 10, "axes.titleweight": "bold", "axes.titlelocation": "left",
        "legend.frameon": False, "figure.dpi": 150,
    })


def save(fig: plt.Figure, folder: Path, name: str) -> str:
    """Write figures/<name> under folder; return the relative path for Markdown."""
    (folder / "figures").mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(folder / "figures" / name, bbox_inches="tight")
    plt.close(fig)
    return f"figures/{name}"


def md_table(header: list[str], rows: list[list[Any]]) -> str:
    out = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def pct(a: float, b: float) -> str:
    return f"{100 * a / b:.0f}%" if b else "–"
