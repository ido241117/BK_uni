"""Chạy một lần giải lộ trình trên fixture bịa toy.json, để đặt breakpoint và đi từng dòng.

Dùng trong VS Code: chọn cấu hình "Debug: giải lộ trình (toy)" rồi bấm F5.
Đổi SCENARIO để thử kịch bản khác (xem fixtures/toy.json, mục "scenarios").
"""

import json
import sys
from pathlib import Path

from planner.cli import run

SCENARIO = "base"
SOLVER = "cpsat"  # hoặc "clingo"

fixture = json.loads((Path(__file__).parent / "planner/fixtures/toy.json").read_text(encoding="utf-8"))
scenarios = {s["id"]: s for s in fixture.pop("scenarios")}
payload = {**fixture, "scenario": scenarios[SCENARIO]}

result = run(payload, SOLVER, time_limit=20.0)  # đặt breakpoint ở dòng này rồi bấm F11 để vào trong
sys.stdout.reconfigure(encoding="utf-8")  # terminal Windows không in được tiếng Việt nếu thiếu dòng này
print(json.dumps(result, ensure_ascii=False, indent=2))
