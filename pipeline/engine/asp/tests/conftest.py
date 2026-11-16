"""Make the ASP modules importable from the test suite."""

from __future__ import annotations

import sys
from pathlib import Path

ASP_DIR = Path(__file__).resolve().parents[1]
if str(ASP_DIR) not in sys.path:
    sys.path.insert(0, str(ASP_DIR))
