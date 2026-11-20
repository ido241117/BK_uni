"""Doc file tien do myBK (T19). Chi dung file bia cung dinh dang, khong dung file that."""

import io
import json
import subprocess
import sys
from pathlib import Path

import openpyxl
import pytest

from planner.mybk import MybkError, parse_bytes

PIPELINE = Path(__file__).resolve().parents[2]
HEADER = ["Stt", "Mã sinh viên", "Mã lớp", "Mã học kỳ", "Số TC CTĐT", "Số TCTL", "Khối kiến thức", "BB/TC",
          "Số TC Y/c", "Số MH Y/c", "Số TC Đạt", "Số MH Đạt", "Mã môn học", "Tên môn học", "Số tín chỉ",
          "Điểm số", "Điểm chữ", "Điểm đạt", "Xét TCTD", "Cập nhật cuối", "Ghi chú"]
# (khoi, loai, TC y/c, TC dat, ma mon, TC, xet TCTD)
ROWS = [
    ("(1) TOAN", "BB", "6", "6", "MA101", "3", ""),
    ("(1) TOAN", "BB", "6", "6", "MA102", "3", ""),
    ("(2) COSONGANH", "BB", "7", "4", "CS201", "4", ""),
    ("(3) TUCHON", "TC", "3", "3", "EL301", "3", ""),
    ("(3) TUCHON", "TC", "3", "3", "EL302", "3", ""),
    ("(4) CC_GDTC", "BB", "0", "0", "CCGDTC", "0", ""),
    ("(5) NGOAICTDT", "NGOAICTDT", "0", "0", "XX3001", "3", "X"),
]


def xlsx(rows=ROWS, header=HEADER, total_earned="19") -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(header)
    for i, (block, kind, req, earned, code, credits, tctd) in enumerate(rows, start=1):
        ws.append([float(i), "2399999", "XX23KH01", "20253", "40", total_earned, block, kind, req, "0", earned,
                   "1", code, f"Mon {code}", credits, "8.5", "A", "1", tctd, "01/01/2026", ""])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_parses_blocks_and_totals():
    out = parse_bytes(xlsx())
    assert out["status"] == "OK"
    assert out["total_required"] == 40 and out["total_earned"] == 19
    assert out["exported_semester"] == "253"
    assert out["cohort_hint"] == 2023  # tu MSSV bia 2399999; MSSV khong co trong ket qua
    names = [b["name"] for b in out["blocks"]]
    assert names == ["(1) TOAN", "(2) COSONGANH", "(3) TUCHON", "(4) CC_GDTC", "(5) NGOAICTDT"]
    tuchon = out["blocks"][2]
    assert tuchon == {"name": "(3) TUCHON", "kind": "TC", "required_credits": 3, "earned_credits": 3,
                      "courses": [{"code": "EL301", "credits": 3, "passed": True, "free_elective": False},
                                  {"code": "EL302", "credits": 3, "passed": True, "free_elective": False}]}
    assert out["blocks"][4]["courses"][0]["free_elective"] is True
    assert all(c["ok"] for c in out["checks"])


def test_no_personal_data_in_output():
    text = json.dumps(parse_bytes(xlsx()), ensure_ascii=False)
    for secret in ("2399999", "XX23KH01", "Mon MA101", "8.5", "01/01/2026"):
        assert secret not in text


def test_self_check_flags_total_mismatch():
    out = parse_bytes(xlsx(total_earned="25"))
    check = next(c for c in out["checks"] if c["id"] == "total_earned")
    assert check["ok"] is False and "25" in check["detail"]


def test_self_check_flags_block_short():
    rows = [r if r[4] != "MA102" else ("(1) TOAN", "BB", "6", "6", "MA102", "2", "") for r in ROWS]
    out = parse_bytes(xlsx(rows=rows, total_earned="18"))
    check = next(c for c in out["checks"] if c["id"] == "block_earned")
    assert check["ok"] is False and "(1) TOAN" in check["detail"]


def test_rejects_other_excel():
    with pytest.raises(MybkError, match="Không phải file tiến độ myBK"):
        parse_bytes(xlsx(header=["Mã môn", "Tên môn học", "Tín chỉ", "Trạng thái"]))


def test_rejects_broken_pdf_and_garbage():
    with pytest.raises(MybkError, match="PDF"):
        parse_bytes(b"%PDF-1.7 ...")
    with pytest.raises(MybkError, match="PDF hoặc Excel"):
        parse_bytes(b"hello")


def test_rejects_duplicate_course():
    rows = ROWS + [("(1) TOAN", "BB", "6", "6", "MA101", "3", "")]
    with pytest.raises(MybkError, match="MA101 bị lặp"):
        parse_bytes(xlsx(rows=rows))


# --- PDF: dong chu nhu PyMuPDF tra ve (mot o mot dong), du lieu bia ---------------------------
COLS = ["Stt", "Mã môn học", "Tên môn học", "Điểm", "số", "Điểm", "chữ", "Tín", "chỉ", "Đạt", "Ghi chú"]
OK, NOT_OK, PASS = "\uf058", "\uf111", "\uf00c"
PDF_LINES = [
    "Khoa Bia", "Ngành: Nganh Bia - DH_CQ_XX_BIA_2023", "Áp dụng từ năm: 2023", "Họ và tên: TEN BIA",
    "Mã sinh viên: 2399999", "Mã lớp: XX23KH01", "Số tín chỉ tích lũy: 10/40", "Điểm TBTL hệ 10: 7.0/10",
    "Cập nhật cuối: 06/03/2026 04:00", *COLS,
    "Toán", "6/6", OK, "Khối kiến thức", "Bắt buộc",
    "1", "MA101", "Giai tich", "7.5", "B", "3", PASS,
    "2", "MA102", "Dai so", "12", "--", "3", PASS,
    "Tự chọn (Nhóm C)", "4/6", NOT_OK, "Khối kiến thức", "Tự chọn",
    "1", "\uf162 EL301", "Mon tu chon", "co ten hai dong", "8", "B+", "4", PASS,
    *COLS,  # sang trang moi
    "2", "\uf162 EL302", "Mon chua hoc", "--", "--", "3", "Ghi chu bia",
    "Chứng chỉ Giáo dục Thể chất", OK, "Khối kiến thức", "Bắt buộc",
    "1", "CCGDTC", "Chung chi", "21", "--", "0", PASS,
    "Điều kiện tốt nghiệp", NOT_OK, "Khối kiến thức", "Bắt buộc",
    "1", "ENG_GC_600", "Dieu kien tieng Anh", "--", "--", "0",
    "2", "SA4001", "Hoat dong", "--", "--", "0",
]


def test_pdf_lines_blocks_conditions_and_not_passed():
    from planner.mybk import parse_pdf_lines

    out = parse_pdf_lines(PDF_LINES)
    assert out["format"] == "pdf" and out["lists_only_passed"] is False
    assert out["official_program_code"] == "DH_CQ_XX_BIA_2023" and out["specialization"] == "Nganh Bia"
    assert (out["total_earned"], out["total_required"]) == (10, 40)
    assert out["updated_at"] == "2026-03-06" and out["exported_semester"] == "252" and out["cohort_hint"] == 2023
    assert [b["name"] for b in out["blocks"]] == ["Toán", "Tự chọn (Nhóm C)", "Chứng chỉ Giáo dục Thể chất"]
    tc = out["blocks"][1]
    assert tc["kind"] == "TC" and (tc["earned_credits"], tc["required_credits"]) == (4, 6)
    assert tc["courses"] == [
        {"code": "EL301", "credits": 4, "passed": True, "free_elective": False,
         "name": "Mon tu chon co ten hai dong", "score": "8", "letter": "B+", "note": None},
        {"code": "EL302", "credits": 3, "passed": False, "free_elective": False,
         "name": "Mon chua hoc", "score": None, "letter": None, "note": "Ghi chu bia"},
    ]
    toan = out["blocks"][0]["courses"]
    assert [(c["name"], c["score"], c["letter"]) for c in toan] == [("Giai tich", "7.5", "B"), ("Dai so", "12", None)]
    assert out["graduation_conditions"] == [
        {"code": "ENG_GC_600", "passed": False, "name": "Dieu kien tieng Anh", "score": None, "letter": None, "note": None},
        {"code": "SA4001", "passed": False, "name": "Hoat dong", "score": None, "letter": None, "note": None},
    ]
    assert all(c["ok"] for c in out["checks"])  # 6 + 4 + 0 = 10
    # Tu 20/11 PDF tra ca thong tin sinh vien, dung chuoi nhu tren file (du lieu bia).
    assert out["student"] == {"faculty": "Khoa Bia", "full_name": "TEN BIA", "student_number": "2399999",
                              "class_code": "XX23KH01", "applied_from_year": "2023",
                              "gpa_10": "7.0/10", "gpa_4": None}


def test_pdf_note_skips_group_headings():
    """Tieu de nhom khoi nam giua hai khoi khong bi coi la ghi chu cua mon dung truoc (gap o file that)."""
    from planner.mybk import parse_pdf_lines

    k = PDF_LINES.index("Tự chọn (Nhóm C)")
    lines = PDF_LINES[:k] + ["Khối kiến thức Ngành", "Môn học ngoài Chương trình đào tạo"] + PDF_LINES[k:]
    out = parse_pdf_lines(lines)
    assert out["blocks"][0]["courses"][-1]["note"] is None
    assert out["blocks"][1]["courses"][-1]["note"] == "Ghi chu bia"


def test_pdf_lines_rejects_other_pdf():
    from planner.mybk import parse_pdf_lines

    with pytest.raises(MybkError, match="Không phải file PDF tiến độ myBK"):
        parse_pdf_lines(["Quy định học vụ", "Điều 1", "Phạm vi"])


def test_pdf_roundtrip_with_real_pdf_bytes():
    """Tao PDF that bang PyMuPDF (can phong co dau tieng Viet) roi doc lai qua parse_bytes."""
    import pymupdf

    font = Path("C:/Windows/Fonts/arial.ttf")
    if not font.exists():
        pytest.skip("khong co phong Arial de ve chu tieng Viet")
    doc = pymupdf.open()
    page = doc.new_page(height=2400)
    page.insert_font(fontname="vn", fontfile=str(font))
    for k, line in enumerate(PDF_LINES):
        page.insert_text((40, 20 + 14 * k), line, fontname="vn", fontsize=9)
    out = parse_bytes(doc.tobytes())
    assert out["format"] == "pdf" and out["official_program_code"] == "DH_CQ_XX_BIA_2023"
    assert sum(len(b["courses"]) for b in out["blocks"]) == 5


def test_cli_stdin_stdout():
    proc = subprocess.run([sys.executable, "-m", "planner.mybk"], input=xlsx(), capture_output=True,
                          cwd=PIPELINE, check=True)
    assert json.loads(proc.stdout.decode("utf-8"))["status"] == "OK"
    bad = subprocess.run([sys.executable, "-m", "planner.mybk"], input=b"nope", capture_output=True,
                         cwd=PIPELINE, check=True)
    assert json.loads(bad.stdout.decode("utf-8"))["status"] == "INPUT_ERROR"
