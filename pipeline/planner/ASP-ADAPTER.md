# Adapter engine ASP (`solve_asp.py`)

Tài liệu cho người dùng hoặc sửa bộ giải "Clingo" của trang Gợi ý học phần. Từ 20/11/2026, lựa chọn `clingo` chạy **engine ASP** (`pipeline/engine/asp/core`, lấy từ nhánh `research-pipeline`) qua adapter `pipeline/planner/solve_asp.py`. Encoding Clingo cũ (`planner/encoding.lp`, `planner/solve.py`) đã bỏ.

## 1. Vị trí trong luồng

```
Database ──► PlannerService.loadSource ──► buildPlannerInput ──► JSON (stdin)
 (Backend/src/planner/planner.service.ts)   (planner-input.ts)        │
                                                                      ▼
                         python -m planner.cli --solver clingo|cpsat  (cli.py)
                                normalize ─► validate_input
                                     │
               ┌─────────────────────┴──────────────────────┐
         solve_cpsat (CP-SAT)                       solve_asp (adapter)
                                                     │  build_program: JSON ─► facts
                                                     │  Clingo: core/*.lp + policy.lp + facts
                                                     │  _decode: plan(X,I) ─► semesters, engine_report
               └─────────────────────┬──────────────────────┘
                              result.make_result ─► validate.py ─► JSON (stdout)
```

- **Một nguồn dữ liệu:** database. Backend ghép JSON (đầu vào chung của cả hai bộ giải); adapter chỉ đọc JSON đó, không đọc `pipeline/data/` hay file nào khác ngoài hai file trong `planner/data/` (mục 4.5).
- **Engine không biết JSON, adapter không chứa luật.** Luật nằm trong `core/*.lp` và `policy.lp`; adapter chỉ dịch dữ liệu.
- Hai bộ giải nhận **cùng** JSON nên so sánh được; kết quả khác nhau là bình thường (mục 7).

## 2. Các file

| File | Vai trò |
|---|---|
| `pipeline/engine/asp/core/encoding.lp` | Lõi tập hợp chung (`in`, `map`, `sum`, `card`, `empty`...). Không biết môn học |
| `pipeline/engine/asp/core/extension.lp` | Ngữ nghĩa lập lộ trình: lịch, khối, tiên quyết, tải từng kỳ, kỳ trống, GPA, học phí, lịch sử mở lớp... |
| `pipeline/engine/asp/core/translate.lp` | Đọc lịch sử học của sinh viên (lần học, điểm, kết quả) |
| `pipeline/engine/asp/core/optimize.lp` | Thứ tự mục tiêu `@8..@0` và các atom hiển thị |
| `pipeline/engine/asp/policy.lp` | Quy định của trường: tải tín chỉ, thang điểm (kèm bảng đổi điểm hệ 10 ra điểm chữ), trần điểm học lại, GPA tốt nghiệp, học phí, điều kiện ngoài môn. Sửa tay |
| `pipeline/planner/solve_asp.py` | Adapter: `build_program` (JSON → facts, hàm thuần), `solve_asp` (gọi Clingo), `_decode` (kết quả) |
| `pipeline/planner/result.py` | Dựng kết quả chung cho mọi bộ giải (`make_result`, `plan_map`, `diff`) |
| `pipeline/planner/data/course-tags.json` | Tag của môn: `{"tags": {"AI": ["CO3061", ...]}}` (đang trống, nhóm tự điền) |
| `pipeline/planner/data/mybk-code-aliases.json` | Mã myBK → mã web cho điều kiện tốt nghiệp (`ENG_GC_600` → `ENG_GC`) |
| `pipeline/planner/tests/test_solve_asp.py` | Test riêng của adapter và engine, đáp án tính tay |

## 3. Cách gọi

```bash
cd pipeline
.venv/Scripts/python -m planner.cli --solver clingo --time-limit 30 < input.json   # như backend
.venv/Scripts/python -m planner.run_scenarios --facts base                          # xem facts của toy.json
.venv/Scripts/python -m planner.compare                                             # so engine ASP với CP-SAT
```

```python
from planner.solve_asp import solve_asp, build_program
result = solve_asp(fixture, scenario, previous_plan=None, time_limit=30.0)
```

Từ web: `POST /api/plans/solve` với `"solver": "clingo"`. Không cần sửa frontend: khóa `clingo` giữ nguyên, chỉ đổi bộ giải phía sau.

## 4. Đầu vào → facts

`build_program(fixture_đã_normalize, scenario)` trả `(facts, ngữ cảnh)`. Mã môn được giữ nguyên dạng chuỗi (`"CO3001"`), nên đọc ngược kết quả không cần bảng tra.

### 4.1 Lịch

Engine đánh số kỳ liên tục từ kỳ đầu tiên trong `semesters` (ký hiệu `YYS`, S = 1, 2, 3 là kỳ 1, kỳ 2, kỳ hè): `251 → 1, 252 → 2, 253 → 3, 261 → 4...`. Chỉ số tính từ **mã kỳ**, không từ vị trí trong danh sách, nên fixture bỏ qua kỳ hè vẫn đúng.

| JSON | Facts / hằng |
|---|---|
| `semesters[0]` | `enroll_part_in(S)` |
| `student.current_semester` | `-c t=<chỉ số>` (kỳ đã học) |
| kỳ cuối của `semesters`, hoặc `scenario.graduate_by` | `-c n=<chỉ số>` (chân trời) |
| kỳ trong `t+1..n` mà `semesters` không liệt kê | `empty(s(I))` |
| `scenario.summer_opt_in` khác rỗng | `-c extra_sem=1` (luật kỳ hè của engine: mọi môn được xếp vào kỳ hè) |

Mã kỳ không đúng dạng `YYS` → `FixtureError` → `INPUT_ERROR`.

### 4.2 Chương trình

| JSON (sau `normalize`) | Facts |
|---|---|
| khối `required` | `in(C, gK)`, `map(l, gK, tổng TC)`, `map(u, gK, tổng TC)` |
| khối `elective` | `elective_group(gK)`, `map(l, gK, required_credits or 0)`, `map(u, gK, tổng TC các môn)`, `map(min_courses, gK, required_count)` |
| tín chỉ | `map(c, C, TC)` |
| tổng | `map(l, total_degree, tổng các cận dưới)`, `map(u, total_degree, tổng TC mọi môn)` (không đặt trong `policy.lp` vì mỗi chương trình khác nhau) |
| quan hệ `prerequisite` / `corequisite` | `prereq(C, R)` / `coreq(C, R)`; `prior` và `recommended` không xuất |
| cấp độ (chữ số đầu của mã) | `course_level(C, L)` |
| `rules.course_level` (QĐ 285 Đ15.4) | `ban(C, I)` cho các kỳ chưa đủ năm học |
| `graduation_courses` + `rules.graduation_thresholds` (Đ15.5) | `milestone(C, TC cần − TC ngoài chương trình)` |
| `opened_semesters` (mới, từ `course_opened_semesters`) | `offer_hist(C, S, số kỳ đã mở)`, `offer_seen(S, số kỳ quan sát)` |
| khối con theo chuyên ngành (`normalize` lưu ở `_specializations`) | `major(M)`, `major_course(M, C)`, `major_min(M, required_count)`; chuyên ngành sinh viên chọn: `student_major(M)` |
| `planner/data/course-tags.json` | `tag(C, Tag)` |

### 4.3 Sinh viên

Mọi môn đã học được ghi ở kỳ hiện tại `t` (web không lưu kỳ học của từng môn). Môn ngoài chương trình không đưa vào engine (đã tính vào tự chọn tự do bởi `normalize`).

| Trạng thái (`student_courses`) + điểm (`student.scores`) | Facts |
|---|---|
| `completed`, có điểm hệ 10 | `taken`, `raw_score(C, điểm×100)`, `map(g, C, chữ)` |
| `completed`, không có điểm | `taken`, `result(C, passed)` |
| `failed` | như trên với `result(C, failed)` khi không có điểm |
| `in-progress`, giả định đậu | `taken` (engine ghi nhận lạc quan) |
| `in-progress`, giả định rớt | `taken`, `result(C, failed)` |
| `not-started` nhưng file myBK có điểm < 4.0 | `taken` + điểm: một lần học rớt (file myBK ghi môn chưa đạt thành "Chưa học") |

Điểm hệ 10 được đổi ra điểm chữ theo `grade_min_score` trong `policy.lp` (A+ từ 9.5, A từ 8.5, …, D từ 4.0, dưới 4.0 là F); khi có điểm số thì điểm chữ trong file bị bỏ qua. Điểm chữ quyết định đậu/rớt và GPA hệ 4; GPA hệ 10 dùng đúng điểm số của môn. Điểm chữ không có trong thang của `policy.lp` (vd "MT") bị bỏ qua kèm cảnh báo. Điểm chỉ có khi sinh viên tải file **PDF** myBK (file Excel không có điểm).

### 4.4 Điều kiện tốt nghiệp

Môn điều kiện (`conditions`: nhóm "E. Điều kiện tốt nghiệp", cộng các mã `GRADUATION_CONDITION_CODES` = `ENG_GC`, `ENG_GC_600`, `SA4001` trong `Backend/src/planner/planner-input.ts`, vì chương trình nhập lại từ myBK ngày 20/11 không có nhóm E) thành `external_requirement(R, course, cumulative, blocking)` + `external_milestone(R, graduation, 1)`. Đạt khi trạng thái môn là `completed` hoặc file myBK ghi đạt (`student.graduation_conditions`, qua bảng alias) → `external_progress(R, t, 1)`. Chưa đạt thì engine báo `graduation_blocked(R)`, adapter thành cảnh báo; **không** làm UNSAT.

`social_work_days` (ngày công tác xã hội) có trong `policy.lp` nhưng web chưa có dữ liệu, nên luôn được báo là chưa đạt. "Hoạt động sinh viên" của database là điều kiện khác (người duyệt xác nhận 20/11).

### 4.5 Kịch bản

| `scenario` | Facts |
|---|---|
| `locked` | `pin(C, I)` |
| `not_offered` + `offerings.records` (`not-offered`) | `closed(C, I)` |
| `max_credits` | `sem_max(I, N)` cho mọi kỳ tương lai |
| `semester_limits` | `sem_max(I, N)` / `sem_min(I, N)` cho đúng kỳ đó |
| `skip_semesters` (mới) | `skip(I)`: sinh viên chủ động nghỉ kỳ I |
| `preferences`, `previous_plan` | Không dùng (engine chưa có S3–S11); khác biệt với mốc do `cli.py` tính |

## 5. Quy định (`policy.lp`) và đối chiếu database

`policy.lp` là quy định của trường, dùng chung cho mọi chương trình: tải 14–21 TC kỳ chính, kỳ hè 0–12 (QĐ 285 Đ15.3), điểm đạt 4.0, thang điểm chữ, GPA tốt nghiệp 2.50 (chỉ báo cáo, không ràng buộc), học phí.

- **Trần điểm học lại** `retake_grade_cap(b)`: quy ước kinh nghiệm, không phải quy định đã kiểm chứng. Khi trần hạ điểm chữ của lần học lại, GPA hệ 10 cũng dùng điểm giữa của điểm chữ đã hạ (B → 7.5) thay cho điểm số thật. Hiện không có tác dụng vì web chưa có lịch sử nhiều lần học.
- **Học phí:** số liệu lấy từ dữ liệu minh họa của nhánh `research-pipeline`, chưa đối chiếu PL4–5. Bỏ hết `fee_rule` thì engine bỏ mục tiêu học phí (không UNSAT).
- **Đối chiếu:** mỗi lần giải, adapter so mức tín chỉ của chương trình (`curricula.min/max_semester_credits`) và `PLANNER_RULES` của backend với `policy.lp`; lệch thì ghi vào `warnings`. Engine luôn dùng `policy.lp`.
- Kỳ cuối có môn được miễn mức tối thiểu (giống CP-SAT); QĐ 285 hiện hành không có ngoại lệ này.

## 6. Đầu ra

Giống CP-SAT (mục 4 của `README.md`), thêm `engine_report`:

| Khóa | Nội dung |
|---|---|
| `objective` | `[{level, priority, value}]`: giá trị từng mức mục tiêu (chỉ các mức có phần tử) |
| `gaps` | Kỳ chính bị bỏ trống trước kỳ cuối có môn (đã thành cảnh báo) |
| `gpa` | `{"gpa_4": 3.0, "score_10": 7.5}`; thêm `gpa_required_avg`, `gpa_best_case`, cờ `gpa_already_satisfied`, `gpa_requirement_impossible` khi có |
| `majors` | `[{code, count, earned}]` theo chuyên ngành |
| `graduation_blocked`, `external_missed`, `external_pending` | Điều kiện ngoài môn |
| `offering_misses` | `[{course, semester, missed_percent}]`: môn xếp vào kỳ mà lịch sử ít mở |
| `fees` | Học phí từng kỳ (đơn vị `money_scale` của `policy.lp`) |
| `course_tags` | Tag của các môn trong lộ trình |
| `degree_complete`, `ready_to_graduate` | Cờ của engine |
| `ground_and_solve_ms` | Thời gian grounding + giải |

`status`: `OPTIMAL` (đã chứng minh tối ưu), `SAT_NOT_PROVEN_OPTIMAL` (hết giờ khi đang tối ưu), `UNSAT`, `TIMEOUT` (hết giờ chưa có lộ trình). `infeasible_reason` khi UNSAT vẫn do CP-SAT tính (cố ý: hai bộ giải có thể không đồng ý).

### Thứ tự mục tiêu (`optimize.lp`)

| Mức | Mục tiêu |
|---|---|
| @8 | Không bỏ trống kỳ chính (kỳ trống chỉ dùng khi không còn cách nào, kèm cảnh báo) |
| @7 | Xong sớm nhất |
| @6 | Học lại môn rớt sớm |
| @5 | Đúng phần năm học môn thường mở lớp (thay "popularity" cũ) |
| @4 | Học phí thấp |
| @3 | Môn đặc biệt gần kỳ điển hình |
| @2 | Môn cấp 1–2 trước |
| @1 | Đều tải |
| @0 | Sở thích (`interest`, đang tạm dừng) |

## 7. Khác biệt với CP-SAT

Cố ý giữ, để so sánh hai bộ giải. Các test tương ứng được đánh dấu `xfail` (không strict) trong `tests/test_cases_k.py`: engine chạy nhiều luồng nên đôi khi tình cờ chọn đúng đáp án của test (báo `XPASS`). Khi engine có thêm mục tiêu, cập nhật bảng này và bỏ dấu `xfail`.

| Khác biệt | Test |
|---|---|
| Tải tín chỉ theo `policy.lp` (14–21), không theo chương trình/`PLANNER_RULES` (11–25); 14 TC là cứng (trừ kỳ cuối) | `test_cli_base_matches_contract[clingo]` chấp nhận vi phạm "vượt tối đa" của toy |
| Chưa có S4 môn muốn học | `test_k4_wanted_course` |
| Chưa có S6 khuyến nghị, thứ tự `recommendations_first` | `test_k7_*`, `test_k7d_*` |
| Chưa có S8 khoảng tín chỉ đẹp, S11 đủ 11 TC (đều tải @1 thay thế) | `test_s8_both_solvers_agree[band0]`, `test_last_semester_below_minimum_is_warned` |
| Luật kỳ hè của engine: bật một kỳ hè là mở mọi kỳ hè (`extra_sem` toàn cục); mọi môn được xếp vào kỳ hè; không S7/S9, không loại đồ án | `test_k8_opt_in_summer_used_minimally`, `test_k8c_*`, `test_k8d_*` |
| Chưa có S3 giữ lộ trình mốc | (what-if có thể đổi cả môn không liên quan) |
| Kỳ trống là mềm có cảnh báo; nghỉ kỳ bằng `skip_semesters` | `test_solve_asp.py` |

Các test toy khác chạy engine ASP với tải tín chỉ của toy (fixture `toy_policy` trong `tests/conftest.py`, ghi bản sao `policy.lp` vào thư mục tạm) để kiểm tra phần còn lại của luật: song hành, cấp độ môn, khóa môn, hạn tốt nghiệp, ngưỡng môn tốt nghiệp, giới hạn từng kỳ.

## 8. Thời gian

- Giới hạn mềm `--time-limit` (backend gửi 30 giây cho `clingo`): Clingo chỉ kiểm tra giữa các bước lan truyền; grounding không ngắt được.
- Giới hạn cứng: `PLANNER_TIMEOUT_MS` của backend (mặc định 60 giây) giết tiến trình và trả `TIMEOUT`.
- Clingo chạy `THREADS = 4` luồng (`solve_asp.py`). Kết quả nhiều luồng không tất định: giữa các lộ trình tốt ngang nhau, mỗi lần chạy có thể trả một lộ trình khác.
- Đo 20/11/2026 (Clingo 5.8.3, máy dev 8 luồng):
  - Fixture `khmt2023.json`: `OPTIMAL` trong khoảng 1–2,5 giây kể cả grounding; toy.json dưới 0,1 giây.
  - **Dữ liệu thật** (KHMT trên database chung, 21 kỳ, lịch sử mở lớp 19 kỳ, sinh viên thử), sau khi `ENG_GC_600`, `SA4001` thành điều kiện: engine ASP `OPTIMAL` 8,6 giây cho cả request (6,6 giây grounding + giải); thêm kỳ hè và nghỉ kỳ: `OPTIMAL` 14,7 giây. CP-SAT: `OPTIMAL` 2,5 giây.
  - Trước khi sửa (hai mã trên còn là môn 0 TC phải xếp): 1 luồng hết 30 giây vẫn `SAT_NOT_PROVEN_OPTIMAL`; 4 luồng tìm được lộ trình tốt nhất ở cả 3 lần chạy nhưng chỉ chứng minh tối ưu 1/3 lần; CP-SAT 17 giây.
  - Nhiều luồng hiếm khi kẹt ở bước chứng minh tới hết giới hạn kể cả trên fixture dễ (khoảng 1/13 lần chạy bộ test); lộ trình trả về vẫn hợp lệ, `status` là `SAT_NOT_PROVEN_OPTIMAL`. Giới hạn mềm có thể vượt vài giây.
  - Mỗi lần gọi `planner.cli` mất thêm khoảng 12 giây chỉ để nạp thư viện Python (clingo, ortools) trên máy đo.

## 9. Sửa, thêm, gỡ

- **Thêm một loại dữ liệu:** backend thêm trường vào JSON (`planner-input.ts`) → `build_program` sinh fact → khai `#defined` và luật trong `core/*.lp` → test trong `test_solve_asp.py`. CP-SAT bỏ qua trường lạ.
- **Đổi quy định:** sửa `policy.lp`, chạy `pytest planner`.
- **Gỡ engine ASP:** xóa `solve_asp.py`, `tests/test_solve_asp.py`, `tests/conftest.py`, thư mục `pipeline/engine/`, hai file trong `planner/data/` ở mục 2; trong `cli.py` bỏ import và mục `"clingo"` của `SOLVERS`; trong test bỏ tham số `clingo`. Backend chỉ cần bỏ `clingo` khỏi `@IsIn` của DTO nếu muốn.
