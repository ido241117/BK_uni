"""Tien ich chung cho test cua planner."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


@pytest.fixture()
def toy_policy(monkeypatch, tmp_path):
    """Cho engine ASP dung muc tin chi cua toy.json thay cho policy.lp that.

    toy.json la du lieu bia voi mon 2-4 TC va toi da 12 TC/ky; planner khong co muc
    toi thieu cung. policy.lp cua truong (14-21 TC) lam moi dap an xep tay tren toy sai vi
    ly do tin chi, che mat cac khac biet that. Fixture nay ghi mot ban sao policy.lp voi
    min_load = 0, max_load = 12, max_load_summer = 12 vao thu muc tam va tro adapter toi do.
    policy.lp that khong bi sua.
    """
    import planner.solvers.asp.adapter as adapter

    text = (adapter.ASP_DIR / "policy.lp").read_text(encoding="utf-8")
    for name, value in (("min_load", 0), ("max_load", 12), ("max_load_summer", 12)):
        text, count = re.subn(rf"#const {name} = -?\d+\.", f"#const {name} = {value}.", text)
        assert count == 1, name
    path = tmp_path / "policy-toy.lp"
    path.write_text(text, encoding="utf-8")
    core = adapter.ASP_DIR / "core"
    monkeypatch.setattr(adapter, "SOURCES_BEFORE", (core / "encoding.lp", core / "extension.lp", path))
    return path
