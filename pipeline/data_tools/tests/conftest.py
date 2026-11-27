"""Shared pytest fixtures."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from data_tools.loader import load_data  # noqa: E402
from data_tools.stats import build_report  # noqa: E402

DATA_DIR = PROJECT_ROOT / "instances" / "hcmut" / "curricula" / "cs_2023"
STUDENTS = PROJECT_ROOT / "instances" / "hcmut" / "students" / "cs_2023-oracle.json"


@pytest.fixture(scope="session")
def data_dir():
    return DATA_DIR


@pytest.fixture(scope="session")
def bundle():
    return load_data(DATA_DIR, STUDENTS)


@pytest.fixture(scope="session")
def report(bundle):
    return build_report(bundle)
