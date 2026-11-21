"""The review workbook review/<code>.xlsx: layout, writing and reading.

Sheet "Tags": one row per candidate tag. The team fills in Keep (dropdown: Keep / Drop), Rename and
Note; Courses lists one course per line ("CODE name"), and reviewers may delete or add lines (export
reads the first word of each line as the course code). Sheet "Courses": each scored elective with the
tags the primary model gave it, to check course by course (not read back).

Written by review.py; read by review.py (keeps decisions on regeneration), classify.py (renames) and
export.py. A real Excel file, so saving it in Excel keeps Vietnamese text and the layout.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from tag_classifier.common import resolve

# (key, header, column width, wrap text)
TAG_COLUMNS = [
    ("keep", "Keep", 9, False),
    ("rename", "Rename (English name)", 24, True),
    ("note", "Note", 24, True),
    ("label", "Tag", 28, True),
    ("label_source", "Name source", 14, True),
    ("label_vi", "Vietnamese name", 26, True),
    ("courses", "Courses (one per line)", 50, True),
    ("course_count", "Courses", 9, False),
    ("alpha", "Model agreement (alpha)", 12, False),
    ("models", "Models assigning it", 24, True),
    ("sources", "Sources", 16, True),
    ("evidence", "Evidence (best section of the top courses)", 80, True),
    ("tag", "Key", 20, False),
]
COURSE_COLUMNS = [("code", "Code", 10, False), ("name", "Course", 50, True), ("tags", "Tags (primary model)", 70, True)]
DECISIONS = ("keep", "rename", "note")
KEEP_VALUES = ("Keep", "Drop")
HEADER_FILL = PatternFill("solid", fgColor="DCE8F7")
DOUBT_FILL = PatternFill("solid", fgColor="FBE3D6")  # tags the models disagree on: check these first


def review_path(cfg: dict[str, Any], code: str) -> Path:
    return resolve(cfg["review"]["out_dir"]) / f"{code}.xlsx"


def _fill_sheet(ws, columns: list[tuple[str, str, int, bool]], rows: list[dict[str, Any]]) -> None:
    ws.append([header for _, header, _, _ in columns])
    for row in rows:
        ws.append([row.get(key, "") for key, *_ in columns])
    for i, (_, _, width, _) in enumerate(columns, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width
    for cells in ws.iter_rows(min_row=2):
        for cell, (_, _, _, wrap) in zip(cells, columns):
            cell.alignment = Alignment(vertical="top", wrap_text=wrap)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="top", wrap_text=True)
    ws.auto_filter.ref = ws.dimensions


def write_review(path: Path, tags: list[dict[str, Any]], courses: list[dict[str, Any]]) -> None:
    """tags: rows keyed like TAG_COLUMNS (+ "doubtful": bool); courses: rows keyed like COURSE_COLUMNS."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Tags"
    _fill_sheet(ws, TAG_COLUMNS, tags)
    ws.freeze_panes = "E2"  # header row and the decision columns + tag name stay in view
    keep = DataValidation(type="list", formula1=f'"{",".join(KEEP_VALUES)}"', allow_blank=True,
                          showErrorMessage=True, errorTitle="Keep", error="Choose Keep or Drop, or leave it empty.")
    ws.add_data_validation(keep)
    keep.add(f"A2:A{max(ws.max_row, 2)}")
    for row_number, tag in enumerate(tags, start=2):
        if tag.get("doubtful"):
            for cell in ws[row_number][len(DECISIONS):]:
                cell.fill = DOUBT_FILL
    sheet = wb.create_sheet("Courses")
    _fill_sheet(sheet, COURSE_COLUMNS, courses)
    sheet.freeze_panes = "B2"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        wb.save(path)
    except PermissionError:
        raise SystemExit(f"{path.name} is open in another program (Excel?). Close it and run again.") from None


def read_review_rows(path: Path) -> list[dict[str, Any]]:
    """Rows of the Tags sheet keyed like TAG_COLUMNS (text, stripped), with "_row" = the Excel row number."""
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        rows = wb["Tags"].iter_rows(values_only=True)
        key_of = {header: key for key, header, *_ in TAG_COLUMNS}
        keys = [key_of.get(h) for h in next(rows)]
        out = []
        for number, values in enumerate(rows, start=2):
            if all(v in (None, "") for v in values):
                continue
            row = {k: ("" if v is None else str(v)).strip() for k, v in zip(keys, values) if k}
            out.append(dict(row, _row=number))
        return out
    finally:
        wb.close()


def course_codes(cell: str) -> list[str]:
    """Course codes of a Courses cell: the first word of each non-empty line."""
    return sorted({line.split()[0] for line in cell.splitlines() if line.strip()})


def read_decisions(path: Path) -> dict[str, dict[str, str]]:
    """The team's columns, {tag key: {keep, rename, note}}; {} if there is no workbook yet."""
    if not path.exists():
        return {}
    return {row["tag"]: {k: row.get(k, "") for k in DECISIONS} for row in read_review_rows(path)}


def read_renames(cfg: dict[str, Any], code: str) -> dict[str, str]:
    """{tag key: new English name} from the Rename column."""
    return {tag: d["rename"] for tag, d in read_decisions(review_path(cfg, code)).items() if d["rename"]}
