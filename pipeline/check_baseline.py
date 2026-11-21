"""Kiểm tra mốc bối cảnh dự án: chạy lại các sự thật ghi trong
docs/01-boi-canh.md thay vì tin vào trí nhớ.

    cd pipeline
    .venv/Scripts/python check_baseline.py

Chỉ ĐỌC: đọc file, gọi API đọc công khai của backend local, chạy test.
Không sửa gì.

Mỗi dòng ra một trong bốn nhãn:
    DUNG      khớp với tài liệu
    KHAC      lệch với tài liệu: tài liệu cũ, hoặc có gì đó đã thay đổi
    CHUA_LAM  khớp với tài liệu, và là việc kế hoạch còn phải làm (ghi kèm mã việc)
    BO_QUA    không kiểm tra được lúc này (ví dụ backend chưa chạy)

Thoát với mã 1 nếu có dòng KHAC.
"""

from __future__ import annotations

import copy
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent
ROOT = PIPELINE.parent
DOCS = ROOT / "docs"
API = "http://localhost:3210/api/"

sys.path.insert(0, str(PIPELINE))
sys.stdout.reconfigure(encoding="utf-8")

results: list[tuple[str, str, str]] = []


def report(label: str, name: str, detail: str = "") -> None:
    results.append((label, name, detail))
    print(f"[{label:<8}] {name}" + (f"  ({detail})" if detail else ""))


def check(name: str, ok: bool, detail: str = "") -> None:
    report("DUNG" if ok else "KHAC", name, detail)


# --- 1. File nền tảng -------------------------------------------------------

def check_files() -> None:
    for rel in [
        "CLAUDE.md",
        "docs/01-boi-canh.md",
        "docs/02-ke-hoach.md",
        "docs/README.md",
        "docs/03-thiet-ke.md",  # T1 (luong du lieu da gop vao)
        "docs/04-luat-qd285.md",  # T2
        "docs/05-kiem-thu.md",
        # 20/11 (kqyuu22): encoding.lp + solve.py cu thay bang engine ASP + adapter solve_asp.py.
        "pipeline/planner/solve_asp.py",
        "pipeline/engine/asp/core/encoding.lp",
        "pipeline/planner/solve_cpsat.py",
        "pipeline/planner/validate.py",
    ]:
        check(f"Có file {rel}", (ROOT / rel).exists())


def git(*args: str) -> str:
    # core.quotepath=false: ten file co dau tieng Viet tra ve nguyen van, khong bi escape.
    out = subprocess.run(["git", "-c", "core.quotepath=false", *args], cwd=ROOT, capture_output=True,
                         text=True, encoding="utf-8")
    return out.stdout


def check_sensitive() -> None:
    tracked = git("ls-files").splitlines()
    check(
        "File bàn giao chứa mật khẩu KHÔNG bị git theo dõi",
        "docs/luu-tru/2026-11-15-ban-giao-claude-web-va-pipeline.md" not in tracked,
    )
    leaked = [f for f in tracked if "Mon_hoc_CTDT" in f or "điểm.pdf" in f.lower() or "diem" in f.lower()]
    check("File tiến độ myBK thật (Excel, PDF 'Bảng điểm') KHÔNG bị git theo dõi", not leaked, ", ".join(leaked))
    # 21/11: JSON API myBK cua nguoi duyet (co diem) va function.js (ma cua truong) o thu muc goc.
    leaked = [f for f in tracked if "ctdt-ben-tien-do" in f or f.endswith("function.js")]
    check("JSON tiến độ myBK thật và function.js của trường KHÔNG bị git theo dõi", not leaked, ", ".join(leaked))
    script_in_repo = any("build-vertical" in f for f in tracked)
    if script_in_repo:
        report("KHAC", "Script build-vertical.cjs đã có trong repo", "tài liệu ghi là chưa có; cập nhật T18")
    else:
        report("CHUA_LAM", "Script build-vertical.cjs chưa có trong repo", "T18")


# --- 2. Kế hoạch đang ở giai đoạn nào ---------------------------------------

def check_plan_phase() -> None:
    plan = (DOCS / "02-ke-hoach.md").read_text(encoding="utf-8")
    section = plan.split("## 10. Duyệt", 1)[-1]
    approved = []
    for line in section.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 2 and cells[0].isdigit() and cells[1]:
            approved.append(int(cells[0]))
    if approved:
        report("DUNG", f"Giai đoạn đã duyệt: {approved}", f"việc tiếp theo: giai đoạn {max(approved) + 1}")
    else:
        report("DUNG", "Chưa giai đoạn nào được duyệt", "việc tiếp theo: giai đoạn 0 (duyệt kế hoạch)")


# --- 3. Bộ giải --------------------------------------------------------------

def check_tests() -> None:
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "planner", "-q"],
        cwd=PIPELINE, capture_output=True, text=True, encoding="utf-8",
    )
    tail = (proc.stdout.strip().splitlines() or ["(không có output)"])[-1]
    check("Test của planner qua hết", proc.returncode == 0, tail)


def check_corequisite_semantics() -> None:
    """QĐ 285 Điều 2: song hành yêu cầu môn liên quan phải ĐẠT (hoặc học cùng kỳ).

    Truoc 20/11 con doc encoding.lp cu; nay ngu nghia song hanh / khuyen nghi / hoc truoc cua hai bo giai
    duoc kiem bang pytest (ca K2b, K7, K7b trong test_cases_k.py, chay o check_tests)."""
    # Ca K2: CS202 rớt; lộ trình viết tay xếp CS301 trước khi học lại CS202.
    from planner.facts import get_scenario, load_fixture
    from planner.validate import validate_plan

    fixture = copy.deepcopy(load_fixture(PIPELINE / "planner" / "fixtures" / "toy.json"))
    for sc in fixture["student"]["student_courses"]:
        if sc["course_code"] == "CS202":
            sc["status"] = "failed"
    scenario = copy.deepcopy(get_scenario(fixture, "base"))
    scenario["in_progress_results"] = {"CS201": "pass"}
    plan = [
        {"semester_code": "262", "courses": ["CS301", "CS302", "MA102"]},
        {"semester_code": "271", "courses": ["CS202", "CS401", "EL302", "EL304", "MA201"]},
    ]
    caught = any("CS301" in v and "CS202" in v for v in validate_plan(fixture, scenario, plan))
    if caught:
        report("DUNG", "Validator bắt được ca K2 (song hành với môn đã rớt)")
    else:
        report("CHUA_LAM", "Validator chưa bắt ca K2 (song hành với môn đã rớt)", "T3")


def check_clingo_engine_gaps() -> None:
    """20/11: engine ASP (kqyuu22) chua co mot so luat da duyet; test tuong ung danh dau xfail.
    Doc ASP-ADAPTER.md muc 7; khi engine bo sung du thi bo xfail va muc nay thanh DUNG."""
    tests = (PIPELINE / "planner" / "tests" / "test_cases_k.py").read_text(encoding="utf-8")
    n = tests.count("xfail")
    if n:
        report("CHUA_LAM", "Clingo (engine ASP) còn lệch luật đã duyệt: 11–25 TC, đồ án không xếp hè, S3/S4/S6/S8",
               f"{n} chỗ xfail trong test_cases_k.py; chờ nhóm thống nhất")
    else:
        report("DUNG", "Clingo (engine ASP) không còn test xfail")


def check_cli_and_real_fixture() -> None:
    """T10: planner.cli; T26: fixture KHMT 2023 that, tong 128 TC nhu PDF."""
    proc = subprocess.run(
        [sys.executable, "-m", "planner.cli"], cwd=PIPELINE, input=b"{ sai", capture_output=True,
    )
    try:
        status = json.loads(proc.stdout.decode("utf-8")).get("status")
    except json.JSONDecodeError:
        status = None
    check("planner.cli trả INPUT_ERROR cho JSON sai, không crash", status == "INPUT_ERROR", str(status))

    path = PIPELINE / "planner" / "fixtures" / "khmt2023.json"
    if not path.exists():
        report("CHUA_LAM", "Chưa có fixture KHMT 2023 thật", "T26")
        return
    from planner.facts import load_fixture
    from planner.normalize import normalize

    total = normalize(load_fixture(path))["_total_credits"]
    check("Fixture KHMT 2023: tổng tín chỉ chương trình = 128 (khớp PDF)", total == 128, f"thực tế {total}")


def check_phases_3_to_5() -> None:
    """GD 3 (ban chup quan he), GD 4 (API backend), GD 5 (trang Goi y)."""
    snap = PIPELINE / "planner" / "data" / "relations-snapshot.json"
    if snap.exists():
        data = json.loads(snap.read_text(encoding="utf-8"))
        check("Bản chụp quan hệ môn có ngày, 96 chương trình", data.get("curricula_count") == 96 and bool(data.get("taken_at")),
              f"{data.get('curricula_count')} chương trình, {data.get('relations_count')} quan hệ, ngày {data.get('taken_at')}")
    else:
        report("CHUA_LAM", "Chưa có bản chụp quan hệ môn", "T12")
    backend = ROOT / "Backend" / "src" / "planner"
    check("Backend có module planner (POST /api/plans/solve)",
          (backend / "planner.controller.ts").exists() and "plans" in (backend / "planner.controller.ts").read_text(encoding="utf-8"))
    page = (ROOT / "Frontend" / "src" / "pages" / "recommendations" / "index.tsx").read_text(encoding="utf-8")
    check("Trang Gợi ý không còn là 'Coming soon'", "ComingSoon" not in page and "solvePlan" in page)


def check_phases_6_and_8() -> None:
    """GD 6 (what-if, T17) va GD 8 (file tien do myBK, T19-T24). Lam ngay 19/11."""
    rec = ROOT / "Frontend" / "src" / "pages" / "recommendations"
    page = (rec / "index.tsx").read_text(encoding="utf-8")
    check("What-if: trang Gợi ý lưu mốc và gửi previous_plan (T17)",
          (rec / "whatIf.ts").exists() and "previous_plan" in page and "storeBaseline" in page)
    check("Có bộ đọc file tiến độ myBK (planner/mybk.py) (T19)", (PIPELINE / "planner" / "mybk.py").exists())
    # GD 9 (20/11): PDF la nguon duy nhat; man hinh xac nhan cu (MybkImport) khong con duoc dung.
    courses = ROOT / "Frontend" / "src" / "pages" / "courses"
    cpage = (courses / "index.tsx").read_text(encoding="utf-8")
    check("T29: trang Môn học có nút tải PDF myBK và thẻ tiến độ, không còn tự khai (file mẫu, nút Sửa)",
          (courses / "components" / "MybkProgress.tsx").exists() and "<MybkUploadButton" in cpage
          and "<MybkProgressCard" in cpage and "CourseStatusFileActions" not in cpage and "CourseEditModal" not in cpage)
    check("T30: trang Gợi ý không còn nút nhập myBK cũ", "MybkImport" not in page)
    backend = ROOT / "Backend" / "src"
    ctrl = (backend / "planner" / "planner.controller.ts").read_text(encoding="utf-8")
    ds = (backend / "database" / "data-source.ts").read_text(encoding="utf-8")
    plan = (ROOT / "docs" / "02-ke-hoach.md").read_text(encoding="utf-8")
    if "- [x] T28" in plan:
        report("DUNG", "T28: migration đã chạy trên Supabase và thử tải PDF thật (theo kế hoạch mục 6)")
    else:
        report("CHUA_LAM", "T28: migration chưa chạy trên Supabase / chưa thử tải PDF thật", "T28, cần người duyệt cho phép")
    check("T28: API mybk/import + mybk/progress, migration đã đăng ký trong data-source",
          "'mybk/import'" in ctrl and "'mybk/progress'" in ctrl and "StudentProgressImports1795600000000" in ds)
    mapping = PIPELINE / "planner" / "data" / "mybk-program-map.json"
    programs = json.loads(mapping.read_text(encoding="utf-8")).get("programs", {}) if mapping.exists() else {}
    check("Bảng nối mã myBK ↔ mã nhóm có DH_CQ_MT_KHM_2023 → CS-2023-KHMT (T20)",
          programs.get("DH_CQ_MT_KHM_2023") == "CS-2023-KHMT", f"{len(programs)} cặp")
    # File that chi doc tai may (khong commit); chi in so tong hop, khong in du lieu ca nhan.
    sys.path.insert(0, str(PIPELINE))
    from planner.mybk import parse_bytes  # noqa: E402
    passed = lambda out: {c["code"] for b in out["blocks"] for c in b["courses"] if c["passed"]}  # noqa: E731
    real_x = sorted(ROOT.glob("Mon_hoc_CTDT_*.xlsx"))
    real_p = ROOT / "Bảng điểm.pdf"
    xlsx = pdf = None
    if real_x:
        xlsx = parse_bytes(real_x[0].read_bytes())
        check("File Excel tiến độ thật (máy này) đọc được, tự kiểm tra tín chỉ qua: 111/128",
              (xlsx["total_earned"], xlsx["total_required"]) == (111, 128) and all(c["ok"] for c in xlsx["checks"]),
              f"{len(passed(xlsx))} môn đạt, {xlsx['total_earned']}/{xlsx['total_required']} TC")
    else:
        report("BO_QUA", "File Excel tiến độ thật", "không có Mon_hoc_CTDT_*.xlsx trên máy")
    if real_p.exists():
        pdf = parse_bytes(real_p.read_bytes())
        check("File PDF tiến độ thật (máy này, cập nhật 06/03/2026) đọc được: DH_CQ_MT_KHM_2023, 89/128, tự kiểm tra qua",
              pdf["official_program_code"] == "DH_CQ_MT_KHM_2023" and (pdf["total_earned"], pdf["total_required"]) == (89, 128)
              and all(c["ok"] for c in pdf["checks"]),
              f"{len(pdf['blocks'])} khối, {sum(len(b['courses']) for b in pdf['blocks'])} môn liệt kê, {len(passed(pdf))} môn đạt")
        rows = [c for b in pdf["blocks"] for c in b["courses"]]
        check("T28: PDF thật trả tên mọi môn và điểm số mọi môn đạt (để hiện lại đúng trang myBK)",
              all(c.get("name") for c in rows) and all(c.get("score") for c in rows if c["passed"]),
              f"{sum(bool(c.get('name')) for c in rows)}/{len(rows)} có tên, "
              f"{sum(bool(c.get('score')) for c in rows if c['passed'])}/{sum(c['passed'] for c in rows)} môn đạt có điểm")
        noted = [c["code"] for c in rows + pdf["graduation_conditions"] if c.get("note")]
        check("T28: PDF thật (cột Ghi chú trống) đọc ra 0 ghi chú, không dính tiêu đề nhóm khối",
              not noted, ", ".join(noted))
        st = pdf.get("student") or {}
        keys = ("faculty", "full_name", "student_number", "class_code", "applied_from_year", "gpa_10", "gpa_4")
        check("T28: PDF thật trả đủ 7 trường thông tin sinh viên (chỉ kiểm có/không, không in giá trị)",
              all(st.get(k) for k in keys), ", ".join(k for k in keys if not st.get(k)))
    else:
        report("BO_QUA", "File PDF tiến độ thật", "không có 'Bảng điểm.pdf' trên máy")
    if xlsx and pdf:
        extra = passed(pdf) - passed(xlsx)
        check("Môn đạt trong PDF (cũ hơn) đều có trong Excel (mới hơn)", not extra, ", ".join(sorted(extra)))
    report("CHUA_LAM", "Chưa chạy lộ trình thật của người duyệt cùng 3 what-if", "T24")


def check_phase_10() -> None:
    """GD 10 (21/11): T32 xem truoc PDF, tim chuong trinh theo curricula.source_code, liet ke mau thuan."""
    backend = ROOT / "Backend" / "src"
    ctrl = (backend / "planner" / "planner.controller.ts").read_text(encoding="utf-8")
    entity = (backend / "curriculum" / "entities" / "curriculum.entity.ts").read_text(encoding="utf-8")
    review = backend / "planner" / "mybk-review.ts"
    check("T32: API mybk/review + hàm thuần mybk-review.ts + test, entity Curriculum khai source_code",
          "'mybk/review'" in ctrl and review.exists() and (ROOT / "Backend" / "test" / "mybk-review.spec.ts").exists()
          and "source_code" in entity)
    ui = (ROOT / "Frontend" / "src" / "pages" / "courses" / "components" / "MybkProgress.tsx").read_text(encoding="utf-8")
    check("T32: nút tải PDF gọi reviewMybk rồi mở hộp xác nhận, import gửi apply_curriculum",
          "reviewMybk" in ui and "<Modal" in ui and "applyCurriculum" in ui)
    service = (backend / "planner" / "planner.service.ts").read_text(encoding="utf-8")
    check("Hiệu chỉnh (21/11): API mybk/adjustments, học kỳ khai lưu ở data.web, frontend không hiện cột điểm",
          "'mybk/adjustments'" in ctrl and "current_semester" in service and "adjustMybk" in ui
          and "'Điểm số'" not in ui and "'Điểm chữ'" not in ui)
    plan = (DOCS / "02-ke-hoach.md").read_text(encoding="utf-8")
    for task in ("T33", "T36"):
        if f"- [x] {task}" not in plan:
            report("CHUA_LAM", f"Giai đoạn 10: {task} chưa làm", task)
    # Bo ghep dau vao tim nhom "D. Hoc phan tot nghiep"; database 20/11 doi ten thanh "Tot nghiep".
    pinput = (backend / "planner" / "planner-input.ts").read_text(encoding="utf-8")
    if "categoryCodes('D.')" in pinput:
        report("KHAC", "planner-input.ts tìm nhóm 'D.'/'E.' nhưng database 20/11 không còn nhóm nào tên như vậy",
               "môn tốt nghiệp (ngưỡng 65/70/85%) không được nhận; nhóm mới tên 'Tốt nghiệp', 'Điều kiện tốt nghiệp'")


def check_last_semester_minimum() -> None:
    """QĐ 285 Đ15.3 không có ngoại lệ kỳ cuối; kế hoạch mục 3.3: cho phép nhưng phải cảnh báo."""
    src = (PIPELINE / "planner" / "solve_asp.py").read_text(encoding="utf-8")
    src += (PIPELINE / "planner" / "solve_cpsat.py").read_text(encoding="utf-8")
    if "warnings" in src:
        report("DUNG", "Bộ giải có trường cảnh báo (kỳ cuối dưới mức tối thiểu)")
    else:
        report("CHUA_LAM", "Kỳ cuối dưới mức tối thiểu được cho qua mà không cảnh báo", "T4")


# --- 4. Database qua API đọc công khai ---------------------------------------

def get(path: str) -> dict:
    with urllib.request.urlopen(API + path, timeout=30) as resp:
        return json.load(resp)


def all_pages(path: str) -> list:
    out, page = [], 1
    while True:
        sep = "&" if "?" in path else "?"
        data = get(f"{path}{sep}page={page}&take=100")
        out += data["data"]
        if not data.get("pagination", {}).get("hasNextPage"):
            return out
        page += 1


def check_database() -> None:
    try:
        curricula = get("curricula")
    except (urllib.error.URLError, OSError) as exc:
        report("BO_QUA", "Database (qua API)", f"backend chưa chạy ở {API}: {exc}")
        return

    # Database thay toan bo CTDT bang du lieu myBK ngay 20/11 (Thien, truong cho phep): 01-boi-canh muc 6e.
    check("Số chương trình = 132 (dữ liệu myBK 20/11)", curricula["pagination"]["itemCount"] == 132,
          f"thực tế {curricula['pagination']['itemCount']}")
    courses = get("courses")
    check("Số môn trong danh mục = 5675", courses["pagination"]["itemCount"] == 5675,
          f"thực tế {courses['pagination']['itemCount']}")

    target = next((c for c in all_pages("curricula") if c["code"] == "CS-2023-KHMT"), None)
    if target is None:
        check("Có chương trình CS-2023-KHMT", False)
        return
    n_courses = len(all_pages(f"curricula/{target['id']}/courses"))
    check("CS-2023-KHMT có 96 môn", n_courses == 96, f"thực tế {n_courses}")
    relations = all_pages(f"curricula/{target['id']}/relations")
    kinds = {}
    for r in relations:
        kinds[r["type"]] = kinds.get(r["type"], 0) + 1
    expected = {"recommended": 21, "prerequisite": 11, "prior": 2, "corequisite": 3}
    check("CS-2023-KHMT có 37 quan hệ (21 KN, 11 TQ, 2 HT, 3 SH)", kinds == expected, str(kinds))
    if "source_code" in target:
        check("CS-2023-KHMT có mã myBK DH_CQ_MT_KHM_2023 (cột source_code, T32)",
              target["source_code"] == "DH_CQ_MT_KHM_2023", str(target["source_code"]))
    else:
        report("BO_QUA", "Mã myBK của CS-2023-KHMT", "API danh sách chương trình không trả source_code")
    groups = all_pages(f"curricula/{target['id']}/groups")
    nested = sum(1 for g in groups if g.get("parent_group_id"))
    free = [g for g in groups if g.get("pool_scope") == "any"]
    check("CS-2023-KHMT có 10 khối: 5 khối con chuyên ngành, 1 khối tự chọn tự do 9 TC",
          len(groups) == 10 and nested == 5 and len(free) == 1 and free[0]["required_credits"] == 9,
          f"thực tế {len(groups)} khối, {nested} khối con, {len(free)} khối tự do")
    cats = {c["name"]: sorted(m["course"]["code"] for m in c["members"])
            for c in all_pages(f"curricula/{target['id']}/categories")}
    check("CS-2023-KHMT nhóm 'Tốt nghiệp' (trước 20/11 tên 'D. Học phần tốt nghiệp') = CO3335, CO4029, CO4337",
          cats.get("Tốt nghiệp") == ["CO3335", "CO4029", "CO4337"], str(cats.get("Tốt nghiệp")))
    limits = (target["min_semester_credits"], target["max_semester_credits"])
    check("Tín chỉ mỗi kỳ trong database vẫn là 11–24 (khác QĐ 285: 14–21)", limits == (11, 24),
          f"thực tế {limits}")
    req = urllib.request.Request(API + "plans/solve", data=b"{}", method="POST",
                                 headers={"Content-Type": "application/json", "Origin": "http://localhost:5173"})
    try:
        urllib.request.urlopen(req, timeout=30)
        code = 200
    except urllib.error.HTTPError as exc:
        code = exc.code
    check("POST /api/plans/solve tồn tại và cần đăng nhập (401 khi chưa đăng nhập)", code == 401, f"HTTP {code}")
    req = urllib.request.Request(API + "plans/mybk/preview", data=b"", method="POST",
                                 headers={"Origin": "http://localhost:5173"})
    try:
        urllib.request.urlopen(req, timeout=30)
        code = 200
    except urllib.error.HTTPError as exc:
        code = exc.code
    check("POST /api/plans/mybk/preview tồn tại và cần đăng nhập (401 khi chưa đăng nhập)", code == 401, f"HTTP {code}")
    req = urllib.request.Request(API + "plans/mybk/review", data=b"", method="POST",
                                 headers={"Origin": "http://localhost:5173"})
    try:
        urllib.request.urlopen(req, timeout=30)
        code = 200
    except urllib.error.HTTPError as exc:
        code = exc.code
    check("POST /api/plans/mybk/review (T32) tồn tại và cần đăng nhập (401 khi chưa đăng nhập)", code == 401, f"HTTP {code}")


def main() -> None:
    print("== Kiểm tra mốc bối cảnh BK Uni ==\n")
    check_files()
    check_sensitive()
    check_plan_phase()
    check_tests()
    check_corequisite_semantics()
    check_clingo_engine_gaps()
    check_last_semester_minimum()
    check_cli_and_real_fixture()
    check_phases_3_to_5()
    check_phases_6_and_8()
    check_phase_10()
    check_database()

    counts = {}
    for label, _, _ in results:
        counts[label] = counts.get(label, 0) + 1
    print("\nTổng:", ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    if counts.get("KHAC"):
        print("Có mục KHAC: tài liệu bối cảnh hoặc dự án đã lệch nhau. Xem lại trước khi làm tiếp.")
        sys.exit(1)


if __name__ == "__main__":
    main()
