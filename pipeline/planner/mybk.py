"""Doc file tien do myBK (PDF "Tien do hoan thanh CTDT" hoac Excel "Mon hoc CTDT") thanh du lieu chuan hoa
(muc 4.4 cua ke hoach, T19).

Dung:  python -m planner.mybk < file.pdf|file.xlsx   (bytes qua stdin, JSON qua stdout)

Dinh dang Excel da xem (mot sinh vien KHMT 2023, 19/11/2026): sheet dau, dong 1 la tieu de, moi dong
la **mot mon da dat**. Cot dung: "Khoi kien thuc", "BB/TC", "So TC Y/c", "So TC Dat", "Ma mon hoc",
"So tin chi", "Xet TCTD", "So TC CTDT", "So TCTL", "Ma hoc ky" (ky xuat file, vd 20253).

File khong duoc ghi ra dia. Excel: khong tra ho ten, MSSV, ten mon, diem; tu MSSV chi lay khoa (`cohort_hint`).
PDF (tu 20/11, nguoi duyet chot: luu lai het de hien lai dung trang tien do myBK, frontend chua can goi ra):
- moi mon va dieu kien tot nghiep co them `name`, `score` (diem so), `letter` (diem chu), `note` (cot Ghi chu);
  "--" va o trong thanh null. Doan "Do uu tien thu tu..." o dau file giong nhau cho moi nguoi: khong lay;
- `student`: khoa, ho ten, MSSV, ma lop, nam ap dung, diem TBTL he 10 va he 4, dung chuoi nhu tren file.
"""

from __future__ import annotations

import io
import json
import re
import sys
import unicodedata
import zipfile
from typing import Any

# Ten cot (da bo dau, chu thuong) -> khoa noi bo. Chi doc dung cac cot nay.
COLUMNS = {
    "khoi kien thuc": "block",
    "bb/tc": "kind",
    "so tc y/c": "block_required",
    "so tc dat": "block_earned",
    "ma mon hoc": "code",
    "so tin chi": "credits",
    "xet tctd": "free_elective",
    "so tc ctdt": "total_required",
    "so tctl": "total_earned",
    "ma hoc ky": "exported",
    "ma sinh vien": "student_number",  # chi dung de suy ra khoa (2 chu so dau), khong tra ve
}
REQUIRED = ("block", "kind", "code", "credits")
OUTSIDE_KIND = "NGOAICTDT"
MAX_BYTES = 5 * 1024 * 1024


class MybkError(ValueError):
    """Loi doc file, thong bao hien thang cho sinh vien (tieng Viet co dau)."""


def _norm(text: Any) -> str:
    s = unicodedata.normalize("NFD", str(text or ""))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.replace("đ", "d").replace("Đ", "D")
    return re.sub(r"\s+", " ", s).strip().lower()


def _int(value: Any, field: str, line: int) -> int:
    text = str(value if value is not None else "").strip()
    if text == "":
        return 0
    try:
        return int(float(text))
    except ValueError as exc:
        raise MybkError(f"Dòng {line}: cột {field} không phải số ({text!r}).") from exc


def _semester(value: Any) -> str | None:
    """'20253' -> '253' (nam hoc 2025-2026, ky he). Khac dang thi bo qua."""
    text = str(value or "").strip()
    return f"{text[2:4]}{text[4]}" if re.fullmatch(r"20\d{2}[123]", text) else None


def _cohort(value: Any) -> int | None:
    """Khoa suy tu 2 chu so dau cua MSSV 7 chu so ('23xxxxx' -> 2023). Chi tra ve nam, khong tra MSSV.

    Can de phan biet cac chuong trinh cung nganh khac khoa: danh sach mon thuong giong het nhau.
    """
    text = str(value or "").strip()
    return 2000 + int(text[:2]) if re.fullmatch(r"\d{7}", text) else None


def detect_format(data: bytes) -> str:
    if data.startswith(b"%PDF"):
        return "pdf"
    if data.startswith(b"PK"):
        try:
            names = zipfile.ZipFile(io.BytesIO(data)).namelist()
        except zipfile.BadZipFile:
            return "unknown"
        return "xlsx" if any(n.startswith("xl/") for n in names) else "unknown"
    return "unknown"


def read_rows(data: bytes) -> list[list[Any]]:
    import warnings

    import openpyxl

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # file myBK khong co style mac dinh
        try:
            wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except Exception as exc:  # file hong, co mat khau...
            raise MybkError("Không mở được file Excel. File có thể bị hỏng.") from exc
    ws = wb.worksheets[0]
    return [list(r) for r in ws.iter_rows(values_only=True)]


def parse_rows(rows: list[list[Any]]) -> dict[str, Any]:
    if not rows:
        raise MybkError("File trống.")
    header = [_norm(h) for h in rows[0]]
    index = {key: header.index(name) for name, key in COLUMNS.items() if name in header}
    missing = [name for name, key in COLUMNS.items() if key in REQUIRED and key not in index]
    if missing:
        raise MybkError(
            "Không phải file tiến độ myBK (thiếu cột: " + ", ".join(missing) + "). "
            "Trên myBK, vào Tiến độ hoàn thành CTĐT và tải file Excel môn học."
        )

    def cell(row: list[Any], key: str) -> Any:
        i = index.get(key)
        return row[i] if i is not None and i < len(row) else None

    blocks: dict[str, dict[str, Any]] = {}
    seen: set[str] = set()
    totals: dict[str, int | None] = {"total_required": None, "total_earned": None}
    exported: str | None = None
    cohort: int | None = None
    for line, row in enumerate(rows[1:], start=2):
        code = str(cell(row, "code") or "").strip().upper()
        if not code:
            continue
        if code in seen:
            raise MybkError(f"Dòng {line}: môn {code} bị lặp.")
        seen.add(code)
        name = str(cell(row, "block") or "").strip()
        block = blocks.setdefault(name, {
            "name": name,
            "kind": str(cell(row, "kind") or "").strip().upper(),
            "required_credits": _int(cell(row, "block_required"), "Số TC Y/c", line),
            "earned_credits": _int(cell(row, "block_earned"), "Số TC Đạt", line),
            "courses": [],
        })
        block["courses"].append({
            "code": code,
            "credits": _int(cell(row, "credits"), "Số tín chỉ", line),
            "passed": True,  # Excel chi liet ke mon da dat
            "free_elective": _norm(cell(row, "free_elective")) == "x",
        })
        for key in totals:
            if totals[key] is None and cell(row, key) not in (None, ""):
                totals[key] = _int(cell(row, key), key, line)
        exported = exported or _semester(cell(row, "exported"))
        cohort = cohort or _cohort(cell(row, "student_number"))
    if not blocks:
        raise MybkError("File không có môn nào.")

    out: dict[str, Any] = {
        "status": "OK",
        "format": "xlsx",
        "official_program_code": None,  # Excel khong co; PDF moi co
        "specialization": None,
        "total_required": totals["total_required"],
        "total_earned": totals["total_earned"],
        "exported_semester": exported,
        "cohort_hint": cohort,
        "blocks": list(blocks.values()),
        "graduation_conditions": [],
        "lists_only_passed": True,
    }
    out["checks"] = self_checks(out)
    return out


def self_checks(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    """Tu kiem tra tong tin chi (T19). Khong dat thi van tra du lieu, kem canh bao."""
    checks: list[dict[str, Any]] = []
    passed_credits = lambda b: sum(c["credits"] for c in b["courses"] if c["passed"])  # noqa: E731
    if parsed["total_earned"] is not None:
        if parsed["format"] == "pdf":
            # PDF: tin chi dat cua tung khoi da tinh hoc du (chi tinh du so yeu cau) va mon ngoai CTDT.
            total = sum(b["earned_credits"] for b in parsed["blocks"])
            label = "Cộng tín chỉ đạt của các khối"
        else:
            # Excel: moi dong la mon da dat; tich luy tinh ca phan hoc du va mon ngoai CTDT.
            total = sum(passed_credits(b) for b in parsed["blocks"])
            label = "Cộng tín chỉ các môn"
        checks.append({"id": "total_earned", "ok": total == parsed["total_earned"],
                       "detail": f"{label}: {total}; file ghi tích lũy: {parsed['total_earned']}"})
    short = [b["name"] for b in parsed["blocks"] if b["kind"] != OUTSIDE_KIND
             and passed_credits(b) < b["earned_credits"]]
    checks.append({"id": "block_earned", "ok": not short,
                   "detail": "Mọi khối: tín chỉ các môn ≥ tín chỉ đạt của khối" if not short
                   else "Khối có tín chỉ môn ít hơn tín chỉ đạt: " + ", ".join(short)})
    return checks


# --- PDF "Tien do hoan thanh CTDT" ------------------------------------------------
#
# Dinh dang da xem (mot sinh vien KHMT 2023, file cap nhat 06/03/2026, 19/11/2026). PyMuPDF tra moi o
# cua bang tren mot dong:
#   dau trang 1: "Ngành: <ten> - <MA_CHUONG_TRINH>", "Áp dụng từ năm: 2023", "Mã sinh viên: ...",
#                "Số tín chỉ tích lũy: 89/128", "Cập nhật cuối: dd/mm/yyyy hh:mm"
#   moi trang:   tieu de cot "Stt", "Mã môn học", ..., "Ghi chú"
#   khoi:        <ten khoi> [<dat>/<can>] <bieu tuong> "Khối kiến thức" "Bắt buộc"|"Tự chọn"
#   mon:         <stt> [ ]<ma> <ten (1+ dong)> <diem so|--> <diem chu|--> <tin chi> [ neu dat]
# Khoi "Điều kiện tốt nghiệp" (ENG_GC_600, SA4001) thanh `graduation_conditions`, khong phai mon.
# PDF liet ke **ca mon chua hoc**; chua hoc va rot deu ghi "--" (khong phan biet duoc).

PDF_HEADER_CELLS = {"Stt", "Mã môn học", "Tên môn học", "Điểm", "số", "chữ", "Tín", "chỉ", "Đạt", "Ghi chú"}
PASSED_MARK = ""
KIND_MARK = {"Bắt buộc": "BB", "Tự chọn": "TC"}
CODE_RE = re.compile(r"^(?:\s*)?([A-Z]{2,4}\d{3,4}[A-Z]?|[A-Z][A-Z0-9]*_[A-Z0-9_]+|[A-Z]{4,}\d*)$")
SCORE_RE = re.compile(r"^(--|\d{1,2}(?:[.,]\d{1,2})?)$")
HEADING_RE = re.compile(r"^Khối kiến thức|chương trình đào tạo", re.IGNORECASE)


def _is_icon(text: str) -> bool:
    return len(text) == 1 and "" <= text <= ""


def read_pdf_lines(data: bytes) -> list[str]:
    import pymupdf

    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise MybkError("Không mở được file PDF. File có thể bị hỏng.") from exc
    lines: list[str] = []
    for page in doc:
        for ln in page.get_text().splitlines():
            # Dau cach khong ngat va gach mem (co trong PDF tao boi mot so cong cu) -> ky tu thuong.
            ln = unicodedata.normalize("NFC", ln).replace("\xa0", " ").replace("\xad", "-")
            ln = re.sub(r"[\x00-\x08\x0b-\x1f]", "", ln)  # glyph thieu trong font -> ky tu dieu khien
            lines.append(re.sub(r"[ \t]+", " ", ln).strip())
    return [ln for ln in lines if ln]


def _after(lines: list[str], label: str) -> str | None:
    for ln in lines[:40]:
        if ln.startswith(label):
            return ln[len(label):].strip()
    return None


def _grade(cell: str) -> str | None:
    """O diem tren PDF: "--" (chua co diem) thanh None, con lai giu nguyen chuoi (vd "7.5", "B+")."""
    return None if cell == "--" else cell


def parse_pdf_lines(lines: list[str]) -> dict[str, Any]:
    program = _after(lines, "Ngành:")
    m_prog = re.search(r"-\s*([A-Z0-9_]+)\s*$", program or "")
    totals = re.fullmatch(r"(\d+)\s*/\s*(\d+)", _after(lines, "Số tín chỉ tích lũy:") or "")
    if not m_prog or not totals or not any(ln == "Khối kiến thức" for ln in lines):
        raise MybkError("Không phải file PDF tiến độ myBK. Trên myBK, vào Tiến độ hoàn thành CTĐT và tải file PDF.")
    updated = re.match(r"(\d{2})/(\d{2})/(\d{4})", _after(lines, "Cập nhật cuối:") or "")

    # Bo tieu de cot lap lai o moi trang va phan dau trang 1.
    start = next(i for i, ln in enumerate(lines) if ln == "Ghi chú") + 1
    cells = [ln for ln in lines[start:] if ln not in PDF_HEADER_CELLS]

    blocks: list[dict[str, Any]] = []
    conditions: list[dict[str, Any]] = []
    block: dict[str, Any] | None = None
    # Cot "Ghi chu": cac o nam giua cuoi dong mon truoc va dau dong/khoi ke tiep.
    last: dict[str, Any] | None = None
    last_end = 0

    def close_note(upto: int) -> None:
        # Bo dong tieu de nhom khoi nam giua hai khoi (vd "Khối kiến thức Ngành", "Môn học ngoài Chương
        # trình đào tạo"). Chua co file nao co ghi chu that, nen dinh dang ghi chu chua duoc kiem.
        if last is not None:
            kept = [c for c in cells[last_end:upto] if not HEADING_RE.search(c)]
            last["note"] = " ".join(kept) or None

    i = 0
    while i < len(cells):
        # Dau khoi: tim "Khối kiến thức" + loai, roi lui lai lay ten va dat/can.
        if i + 1 < len(cells) and cells[i] == "Khối kiến thức" and cells[i + 1] in KIND_MARK:
            # Bieu tuong hoan thanh/chua (ky tu vung rieng U+E000-U+F8FF); co the mat khi font thieu glyph.
            j = i - 1 if i >= 1 and _is_icon(cells[i - 1]) else i
            frac = re.fullmatch(r"(\d+)/(\d+)", cells[j - 1]) if j - 1 >= 0 else None
            name_at = j - 2 if frac else j - 1
            name = cells[name_at] if name_at >= 0 else ""
            close_note(max(name_at, last_end))
            last = None
            block = {"name": name, "kind": KIND_MARK[cells[i + 1]],
                     "required_credits": int(frac.group(2)) if frac else 0,
                     "earned_credits": int(frac.group(1)) if frac else 0, "courses": []}
            if "ngoài chương trình" in name.lower():
                block["kind"] = OUTSIDE_KIND
            if "điều kiện tốt nghiệp" in name.lower():
                block["conditions"] = True
            blocks.append(block)
            i += 2
            continue
        # Dong mon: <stt> <ma> ... <diem so> <diem chu> <tin chi> [dat]
        code_m = CODE_RE.match(cells[i + 1]) if i + 1 < len(cells) else None
        if block is not None and cells[i].isdigit() and code_m:
            j = i + 2
            while j < len(cells) and not SCORE_RE.match(cells[j]):
                j += 1  # ten mon, co the nhieu dong
            if j + 2 >= len(cells) or not cells[j + 2].isdigit():
                i += 1
                continue
            credits = int(cells[j + 2])
            passed = j + 3 < len(cells) and cells[j + 3] == PASSED_MARK
            code = code_m.group(1)
            close_note(i)
            shown = {"name": " ".join(cells[i + 2:j]) or None,
                     "score": _grade(cells[j]), "letter": _grade(cells[j + 1]), "note": None}
            if block.get("conditions"):
                last = {"code": code, "passed": passed, **shown}
                conditions.append(last)
            else:
                last = {"code": code, "credits": credits, "passed": passed,
                        "free_elective": block["kind"] == OUTSIDE_KIND, **shown}
                block["courses"].append(last)
            i = j + (4 if passed else 3)
            last_end = i
            continue
        i += 1
    close_note(len(cells))

    course_blocks = [b for b in blocks if not b.pop("conditions", False)]
    seen: set[str] = set()
    for b in course_blocks:
        for c in b["courses"]:
            if c["code"] in seen:
                raise MybkError(f"Môn {c['code']} xuất hiện hai lần trong file.")
            seen.add(c["code"])
    if not seen:
        raise MybkError("Không đọc được môn nào trong file PDF.")

    out: dict[str, Any] = {
        "status": "OK",
        "format": "pdf",
        "official_program_code": m_prog.group(1),
        "specialization": (program or "")[: m_prog.start()].strip(" -") or None,
        "total_required": int(totals.group(2)),
        "total_earned": int(totals.group(1)),
        "exported_semester": _semester_of_date(updated) if updated else None,
        "updated_at": f"{updated.group(3)}-{updated.group(2)}-{updated.group(1)}" if updated else None,
        "cohort_hint": _cohort(_after(lines, "Mã sinh viên:")),
        "blocks": course_blocks,
        "graduation_conditions": conditions,
        "lists_only_passed": False,
        "student": {
            "faculty": lines[0] if lines and ":" not in lines[0] else None,
            "full_name": _after(lines, "Họ và tên:"),
            "student_number": _after(lines, "Mã sinh viên:"),
            "class_code": _after(lines, "Mã lớp:"),
            "applied_from_year": _after(lines, "Áp dụng từ năm:"),
            "gpa_10": _after(lines, "Điểm TBTL hệ 10:"),
            "gpa_4": _after(lines, "Điểm TBTL hệ 4:"),
        },
    }
    out["checks"] = self_checks(out)
    return out


def _semester_of_date(m: re.Match[str]) -> str:
    """Ngay cap nhat -> ky dang dien ra (uoc luong): thang 9-12 ky 1, 1-5 ky 2, 6-8 ky he."""
    month, year = int(m.group(2)), int(m.group(3))
    if month >= 9:
        return f"{year % 100:02d}1"
    if month <= 5:
        return f"{(year - 1) % 100:02d}2"
    return f"{(year - 1) % 100:02d}3"


def parse_bytes(data: bytes) -> dict[str, Any]:
    if len(data) > MAX_BYTES:
        raise MybkError("File quá lớn (tối đa 5 MB).")
    fmt = detect_format(data)
    if fmt == "pdf":
        return parse_pdf_lines(read_pdf_lines(data))
    if fmt != "xlsx":
        raise MybkError("Chỉ nhận file tiến độ myBK dạng PDF hoặc Excel (.xlsx).")
    return parse_rows(read_rows(data))


def main() -> int:
    data = sys.stdin.buffer.read()
    try:
        out = parse_bytes(data)
    except MybkError as exc:
        out = {"status": "INPUT_ERROR", "error": str(exc)}
    sys.stdout.reconfigure(encoding="utf-8")
    json.dump(out, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
