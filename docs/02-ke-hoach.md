# 02 · Kế hoạch: bộ giải lộ trình, dữ liệu và trang "Gợi ý học phần"

Ngày lập: 18/11/2026. Cập nhật 24/11. Trạng thái từng giai đoạn ở **mục 10 (Duyệt)** và `docs/README.md`. Tóm tắt: 0–2 đã duyệt; 3–6, 8–11 đã làm, chờ duyệt; 7 chặn; **12 (what-if theo đặc tả mục 12) code xong 23/11, chưa bấm thử web**.

Tài liệu đi kèm: [thiết kế](03-thiet-ke.md) (gồm luồng dữ liệu, T1), [luật QĐ 285](04-luat-qd285.md) (T2), [kiểm thử](05-kiem-thu.md), [tổng kết hai trang](06-tong-ket.md).

> **Đọc nhanh:** mục 2–5 là kế hoạch gốc (18–19/11); chỗ nào đã đổi có dòng **"Hiện hành"**. Việc đang làm: mục 6 (giai đoạn 11, 12), mục **12** (đặc tả và kế hoạch what-if). Quyết định: mục 9.

Đây là kế hoạch **duy nhất**. Mọi việc đã bàn trong các phiên 15–18/11 đều nằm ở mục 5 (danh sách tổng). Việc nào không có trong danh sách thì chưa được giao.

---

## 1. Cách làm việc

1. **Mỗi lần chỉ làm một giai đoạn.** Xong giai đoạn nào, dừng lại báo cáo, chờ duyệt rồi mới sang giai đoạn sau.
2. **Hợp đồng dữ liệu trước, code sau.** Mục 4 chốt hình dạng dữ liệu đi qua từng lớp. Muốn đổi thì sửa tài liệu này trước.
3. **Đáp án do người duyệt nắm.** Các ca kiểm tra quan trọng có đáp án xếp tay, ghi ở mục 7 trước khi code.
4. **Báo cáo cuối mỗi giai đoạn gồm đúng bốn thứ:**
   - Danh sách file đã thêm hoặc sửa.
   - Lệnh để tự chạy kiểm tra, kèm kết quả thật đã chạy.
   - Những gì **chưa làm** hoặc **chưa kiểm tra được**.
   - Quyết định mới phát sinh, ghi vào mục 9.
5. **Không có gì được nói là "xong" nếu chưa chạy thật.**

---

## 2. Kiến trúc

```
                         ┌─ Sinh viên khai tay trên trang Môn học (đã có)
Trạng thái môn  ◄────────┤
(student_courses)        └─ Tải file tiến độ myBK (giai đoạn 8)

Trang Gợi ý (React)
   │  POST /api/plans/solve   (kịch bản + nút chỉnh)
   ▼
Backend NestJS: module planner
   │  đọc database: chương trình, môn, nhóm, quan hệ, trạng thái môn
   │  + bản chụp quan hệ môn có nhãn nguồn (giai đoạn 3)
   │  ghép thành đầu vào bộ giải (JSON)
   │  gọi:  python -m planner.cli --solver cpsat|clingo
   ▼
pipeline/planner (Python): kiểm tra đầu vào → bộ giải → validator → JSON kết quả
```

| Quyết định | Lý do |
|---|---|
| Bộ giải giữ bằng Python, backend gọi qua dòng lệnh | Không viết lại bộ giải; test riêng từng lớp |
| **Không sửa schema, không chạy migration trên Supabase chung** | Database dùng chung. Thứ cần lưu thêm (ví dụ bảng nối mã myBK) để trong file của repo cho tới khi được duyệt |
| Tín chỉ mỗi kỳ 11–25 theo người duyệt (QĐ 285 ghi 14–21), không theo database (đang để 11–24) | Database dùng chung, không tự sửa |
| Dữ liệu sinh viên lấy từ trạng thái môn đã có | Chạy được ngay, không phụ thuộc parser |
| Mặc định CP-SAT, cho chọn Clingo | CP-SAT chứng minh tối ưu nhanh ở cỡ thật |

**Hiện hành (24/11):** trạng thái môn đến từ **PDF myBK + Hiệu chỉnh** ở trang Môn học (giai đoạn 9–10, Q2), không còn tự khai trên trang Gợi ý. Sinh viên chỉ dùng CP-SAT (Q13; Clingo ẩn). Trạng thái trang Gợi ý lưu ở `student_progress_imports.data.web.planner`. Đã có 2 thứ ghi vào database ngoài trạng thái môn: bảng `student_progress_imports` (migration, người duyệt cho phép 20/11) và `student_profiles.curriculum_id` khi nhập file. Sơ đồ đầy đủ: [06 mục 1](06-tong-ket.md).

---

## 3. Ràng buộc cứng và mềm

### 3.1 Cứng: vi phạm thì không có lộ trình

| Mã | Ràng buộc | Nguồn | Giai đoạn |
|---|---|---|---|
| H1 | Mỗi môn xếp nhiều nhất một kỳ | Hiển nhiên | Đã có |
| H2 | Hoàn thành mọi môn bắt buộc | Chương trình | Đã có |
| H3 | Đủ tín chỉ / số môn mỗi nhóm tự chọn | Chương trình | Đã có |
| H4 | Tiên quyết: môn liên quan phải **đạt** ở kỳ trước | QĐ 285, Điều 2 | Đã có |
| H5 | Song hành: môn liên quan **đạt** ở kỳ trước hoặc học cùng kỳ | QĐ 285, Điều 2 | Đã có (GĐ 2) |
| ~~H6~~ | **Bỏ** (người duyệt, 18/11): bộ giải không xét quan hệ học trước (HT). Database có 50 quan hệ HT trên 96 chương trình; KHMT 2023 có 2 (CO3031 sau CO2003, PE1005 sau PE1003) | QĐ 285 không định nghĩa HT (Đ2, tr.2) | 2: gỡ khỏi Clingo, CP-SAT, validator |
| H15 | Chuyên ngành: nếu sinh viên chọn chuyên ngành mục tiêu (`target_specialization_id`), các môn chọn trong khối gốc (ví dụ "Tự chọn nhóm C") phải thuộc khối con của chuyên ngành đó. Không chọn thì bỏ qua khối con | Mô tả chuyên ngành trong database (KHMT 2023) | 2 |
| H7 | Tín chỉ mỗi kỳ chính **11–25** (người duyệt chọn theo thực tế 18/11). Sinh viên được hạ mức tối đa, cả lộ trình hoặc từng kỳ (xem 3.3) | Người duyệt. QĐ 285 Đ15.3 ghi 14–21; 11 và 25 là ngoại lệ có điều kiện. **Hiện hành (23/11):** kỳ chính 11–25, hè ≤ 12; ô "muốn … TC" của sinh viên thắng cả hai, vượt thì cảnh báo; 11 TC là mềm (S11) | 2 |
| H8 | Môn không mở thì không xếp | Kịch bản | Đã có |
| H9 | Môn bị khóa vào kỳ nào phải nằm đúng kỳ đó | Kịch bản | Đã có |
| H10 | Học xong trước kỳ X | Sinh viên chọn | 2 |
| H11 | Cấp độ môn: cấp 2 từ năm 2, cấp 3 trở lên từ năm 3. **Năm học tính theo khóa**: kỳ `YYS` thuộc năm thứ `YY − (khóa mod 100) + 1` (khóa 2023: kỳ 23x là năm 1, kỳ 25x là năm 3). Cấp độ lấy từ chữ số đầu của mã môn | QĐ 285, Đ15.4, tr.12; PL1, tr.27. Cách tính năm: người duyệt chọn 18/11 cho dễ tính (Đ24 tính theo tín chỉ tích lũy). **Hiện hành (22/11, Q6):** năm học theo TC tích lũy 28/56/84 (`rules.year_by_credits`) | 2 |
| H12 | Thực tập ≥ 65%, đồ án chuyên ngành ≥ 70%, khóa luận ≥ 85% **tổng tín chỉ chương trình** (môn đang học tính là đạt). Khóa luận thêm chuẩn tiếng Anh Nghe–Đọc, MOS (khóa ≥ 2021). Thực tập song hành đồ án; cả hai tiên quyết khóa luận | QĐ 285, Đ15.5, tr.12; PL7, tr.36; PL9, tr.40 | 2 |
| H14 | Kỳ hè chỉ xếp thực tập ngoài trường; tối đa 12 kỳ chính tính từ năm vào trường. **Hiện hành:** hè do sinh viên bật (19/11), ≤ 12 TC, không đồ án; lịch sử mở lớp là mềm (Q9, 22/11), sinh viên báo "kỳ này có mở" được (W2) | QĐ 285, Đ14.1, tr.10; Đ5.2, tr.4 | 2 |
| H13 | Khối tự chọn tự do: ô trống N tín chỉ, không có tiên quyết | Chương trình | 2 |

Giả định đi kèm, hiển thị trên giao diện:
- Môn xếp trong tương lai được giả định sẽ đạt.
- Môn đang học được giả định đạt, trừ khi kịch bản nói rớt (khớp QĐ 285, Điều 15.1).
- Môn không có thông tin mở lớp được giả định có mở.
- Kỳ cuối được dưới mức tối thiểu (11), **kèm cảnh báo**. Quy định hiện hành không có ngoại lệ này (Đ15.3), và Đ37.2 phạt buộc tạm dừng nếu đăng ký dưới mức tối thiểu. Chờ hỏi phòng đào tạo.
- ~~Năm học tính theo khóa~~ (hiện hành 22/11: theo tín chỉ tích lũy, Đ24).
- Chuẩn ngoại ngữ, MOS, GDQP, GDTC sinh viên không khai thì giả định đã đạt.
- Cấp 4 học từ năm 3 (theo Đ15.4). PL1 ghi từ năm 4: chờ hỏi.
- ~~Không xếp môn thường vào kỳ hè~~ (hiện hành 19/11: hè do sinh viên bật, ≤ 12 TC; QĐ 285 không ghi giới hạn tín chỉ kỳ hè).

Đã đọc đủ 58 trang QĐ 285 ngày 18/11. Kết quả đối chiếu từng giả định: [luật QĐ 285, mục 8](04-luat-qd285.md#8-đối-chiếu-với-các-giả-định-ở-mục-31-của-kế-hoạch).

### 3.2 Mềm: cố gắng thỏa, không thỏa vẫn có lộ trình

| Mã | Mong muốn | Mặc định | Báo lại trong kết quả |
|---|---|---|---|
| S1 | Học xong sớm nhất | Bật, ưu tiên cao nhất | Kỳ tốt nghiệp dự kiến |
| S2 | Không học thừa tín chỉ | Bật | Tổng tín chỉ |
| S3 | Ít thay đổi so với lộ trình trước | Bật khi chạy what-if | Môn bị dời |
| S4 | Muốn học môn X (trong nhóm tự chọn) | Tắt | Đáp ứng / không đáp ứng |
| S5 | Các kỳ đều tải | Tắt | Chênh lệch kỳ nặng nhất và nhẹ nhất |
| S6 | Giữ khuyến nghị (KN, `recommended`): môn liên quan nên học ở kỳ trước | Bật | Danh sách cặp môn bị phá khuyến nghị, ghi rõ "lộ trình này không theo khuyến nghị X trước Y" |
| S7 | Kỳ hè có học thì đẹp nhất **6–9 TC** (`rules.summer_preferred_load`; thực tập không tính) | Bật khi có kỳ hè được bật | TC từng kỳ hè và phần lệch |
| S10 | Ưu tiên kỳ chính hơn kỳ hè: ít tín chỉ hè (thực tập không tính) | Bật khi có kỳ hè được bật | Tổng TC học hè |
| S11 | Kỳ chính (trừ kỳ cuối) đủ 11 TC, nhưng không học thừa để đủ | Bật | Tổng số TC thiếu so với 11 |
| S8 | Kỳ chính 15–18 TC (`preferred_load`); kỳ cuối không tính phần thiếu | Bật nếu chương trình có `preferred_load` | Tổng số TC lệch khỏi khoảng |
| S9 | Kỳ hè ưu tiên môn đại cương (cấp 1) và cơ sở ngành (cấp 2) theo chữ số cấp độ trong mã môn (QĐ 285 PL1, tr.27); thực tập không tính | Bật khi có kỳ hè được bật | Danh sách môn cấp 3 trở lên bị xếp vào hè |

Quy tắc: **sinh viên nói "phải" thì cứng, nói "muốn" thì mềm.** **Mỗi mong muốn mềm đều được báo lại là đáp ứng hay không**; đây là chỗ giao diện nối với ràng buộc mềm.

Ý người duyệt (18/11): khuyến nghị chỉ là lời khuyên; không có lời giải nào giữ được thì chấp nhận phá, nhưng phải nói rõ cho sinh viên. KHMT 2023 có 18 quan hệ KN; hiện cả hai bộ giải **bỏ qua** KN.

**Hiện hành (giai đoạn 12, 23/11):** sinh viên sắp và bật/tắt 3 mục: S1 ra trường sớm, S8 kỳ chính 15–18 TC, S2 không học dư (mặc định theo thứ tự này, W12 chưa chốt); sau đó là các mục ẩn S6, S4, OH (lịch sử mở lớp), S3, rồi S9, S7, S11. "ST" (lệch ô TC từng kỳ) luôn đứng đầu khi sinh viên đặt ô TC. Thứ tự gốc dưới đây giữ để tra lịch sử.

**Thứ tự (người duyệt chốt 18/11):**
- **Mặc định: S1 > S6 > S4 > S9 > S7 > S2 > S11 > S8 > S5 > S3 > S10** (S7–S11 thêm ngày 19/11). Trước hết tốt nghiệp sớm nhất; trong các lộ trình tốt nghiệp sớm nhất, chọn lộ trình phá ít khuyến nghị nhất.
- **Tùy chọn của sinh viên: S6 > S1 > S4 > S9 > S7 > S2 > S11 > S8 > S5 > S3 > S10** (`preferences.recommendations_first: true`). Chỉ phá khuyến nghị khi không lộ trình nào giữ được, kể cả lộ trình tốt nghiệp muộn hơn; bộ giải chấp nhận lùi kỳ tốt nghiệp để giữ khuyến nghị.

**Nói rõ cho sinh viên:**
- Lộ trình mặc định phá khuyến nghị nào thì liệt kê từng cặp ("không theo khuyến nghị học MA102 trước CS301"), kèm nút "Ưu tiên giữ khuyến nghị".
- Bấm nút thì giải lại với tùy chọn trên, rồi báo kỳ tốt nghiệp **trước và sau** ("giữ đủ khuyến nghị thì xong ở 272, muộn hơn 1 kỳ"). Nếu vẫn còn khuyến nghị không giữ được (ví dụ vòng lặp với tiên quyết), liệt kê các cặp đó.

### 3.3 Tín chỉ mỗi kỳ (H7) chi tiết

Bộ giải xếp **tất cả các kỳ còn lại cùng một lúc**, không xếp lần lượt từng kỳ. Vì vậy khi một kỳ bị giới hạn thấp, phần tín chỉ còn lại tự dồn sang các kỳ khác, miễn không kỳ nào vượt mức tối đa.

Ví dụ: còn 4 kỳ và 60 TC. Sinh viên khai kỳ 262 chỉ học tối đa 11 TC. Ba kỳ sau phải gánh 49 TC, tức trung bình 16,3 TC, dưới 25, nên vẫn tốt nghiệp đúng hạn. Nếu ba kỳ sau không gánh nổi, hoặc tiên quyết bắt phải học nối tiếp, thì kỳ tốt nghiệp lùi lại và kết quả báo rõ "lùi 1 kỳ vì giới hạn ở kỳ 262".

| Tình huống | Mức áp dụng | Ai quyết |
|---|---|---|
| Mặc định | **11–25** mỗi kỳ chính | Người duyệt, 18/11 |
| Sinh viên muốn học nhẹ hơn | `max_credits` (mọi kỳ) hoặc `semester_limits` (từng kỳ), không thấp hơn 11 | Sinh viên |
| Kỳ chính dưới 11 TC (kể cả kỳ cuối) | **Cho phép**, không học thừa để đủ; kết quả ghi chú "nên trao đổi với phòng đào tạo". Bộ giải cố gắng đủ 11 TC bằng mong muốn mềm S11, đứng dưới S2 (không học thừa) | Người duyệt, 19/11 |
| Sinh viên tự đặt tối thiểu cho một kỳ (`semester_limits[ky].min`) | Cứng | Sinh viên |

Giao diện ghi một dòng: "Mức 11–25 rộng hơn QĐ 285 (14–21). Mức 11 và 25 chỉ dùng được khi đủ điều kiện ở Điều 15.3."

**Hiện hành (23/11):** bỏ ô "Tối đa mỗi kỳ" (`max_credits`) trên trang; sinh viên đặt "muốn … TC" từng kỳ (`semester_targets`, lệch ±2), ô này thắng mức 11–25 và trần hè 12 (sửa lỗi `max_cap` 23/11).

---

## 4. Hợp đồng dữ liệu

### 4.1 Giao diện → backend: `POST /api/plans/solve`

```json
{
  "solver": "cpsat",
  "max_credits": 18,
  "graduate_by": null,
  "in_progress_results": { "CO3005": "pass", "CO3117": "fail" },
  "locked": [ { "course_code": "CO3061", "semester_code": "262" } ],
  "not_offered": [ { "course_code": "CO3001", "semester_code": "262" } ],
  "preferences": { "wanted_courses": ["CO3117"], "balanced_load": false, "recommendations_first": false },
  "previous_plan": { "CO3001": "262", "CO4337": "271" }
}
```

Sinh viên, chương trình và trạng thái môn **không gửi lên**: backend đọc từ tài khoản đang đăng nhập.

### 4.2 Backend → bộ giải

Định dạng fixture hiện có (`pipeline/planner/fixtures/toy.json`), thêm các trường của 4.1, và mỗi quan hệ môn có thêm `source`: `curriculum` (chương trình của sinh viên), `inferred` (suy ra từ chương trình khác hoặc đề cương). Trong lúc phát triển, đầu vào được ghi ra file để kiểm tra tay.

**Mô tả đầy đủ** cách thu dữ liệu, từng bước xử lý, đầu vào và đầu ra của từng trường, bên trong CP-SAT và Clingo, cách xử lý đầu ra: [luồng dữ liệu](03-thiet-ke.md). Request ở 4.1 có thêm hai trường `semester_limits` (H7) và `student_flags` (H11, H12), định nghĩa ở mục 1.4 của file đó.

### 4.3 Bộ giải → giao diện

```json
{
  "status": "OPTIMAL",
  "solver": "cpsat",
  "solve_ms": 180,
  "semesters": [
    { "semester_code": "262", "credits": 17,
      "courses": [ { "code": "CO3001", "credits": 3, "reason": "required", "locked": false } ] }
  ],
  "graduation_semester": "271",
  "preferences_report": [ { "id": "S4", "detail": "Muốn học CO3117", "satisfied": true } ],
  "assumptions": ["Môn xếp trong tương lai được giả định sẽ đạt"],
  "unverified_prerequisites": ["CO3089"],
  "violations": [],
  "diff_vs_previous": ["~ CO4337 dời 271 -> 272"],
  "infeasible_reason": null
}
```

`status`: `OPTIMAL`, `SAT_NOT_PROVEN_OPTIMAL`, `UNSAT`, `TIMEOUT`, `INPUT_ERROR`. `violations` khác rỗng nghĩa là bộ giải có lỗi; giao diện hiện cảnh báo đỏ.

### 4.4 Parser file tiến độ → dữ liệu chuẩn hóa (giai đoạn 8)

```json
{
  "official_program_code": "DH_CQ_MT_KHM_2023",
  "specialization": "Khoa học Máy tính",
  "total_required": 128, "total_earned": 111,
  "blocks": [
    { "name": "Cơ sở ngành", "kind": "BB", "required_credits": 24, "earned_credits": 24,
      "courses": [ { "code": "CO2003", "credits": 4, "passed": true } ] }
  ],
  "graduation_conditions": [ { "code": "SA4001", "passed": false } ]
}
```

Không có tên, MSSV hay điểm số trong dữ liệu được lưu.

---

## 5. Danh sách tổng

Ký hiệu cột "Ở đâu": **P** = chỉ `pipeline/` và `docs/`; **W** = có sửa Backend hoặc Frontend.

| # | Việc | Ở đâu | Giai đoạn | Phụ thuộc |
|---|---|---|---|---|
| T1 | Tài liệu một trang về luồng dữ liệu (vào gì, bộ giải nhận gì, trả gì) cho thầy và nhóm | P | 1 | — |
| T2 | Đọc nốt 58 trang QĐ 285, ghi luật liên quan tới lập lộ trình, kèm điều và trang | P | 1 | — |
| T3 | Sửa song hành theo QĐ 285 (H5) | P | 2 | — |
| T4 | Tín chỉ 11–25, hạ mức tối đa cả lộ trình hoặc từng kỳ, cảnh báo kỳ cuối dưới mức tối thiểu (H7, mục 3.3) | P | 2 | T2 |
| T5 | Học xong trước kỳ X (H10) | P | 2 | — |
| T6 | Cấp độ môn, năm học tính theo khóa (H11) | P | 2 | T2 |
| T7 | Ngưỡng tín chỉ môn tốt nghiệp + chuẩn tiếng Anh + MOS (H12); kỳ hè chỉ cho thực tập, tối đa 12 kỳ chính (H14) | P | 2 | T2 |
| T8 | Ô trống tự chọn tự do (H13) | P | 2 | — |
| T9 | Mong muốn S4, S5, **S6 (khuyến nghị KN)** và báo cáo đáp ứng | P | 2 | — |
| T10 | Lệnh `planner.cli` nhận JSON stdin, trả JSON theo 4.3 | P | 2 | — |
| T11 | Sửa đồng bộ Clingo, CP-SAT, validator; giữ test đối chiếu chéo; gỡ ràng buộc học trước (H6) | P | 2 | T3–T9, T25 |
| T25 | Khối lồng nhau và chuyên ngành (H15); môn 0 TC; môn "điều kiện" (nhóm E như ENG_GC, SA4001) không xếp vào kỳ mà thành cờ đầu vào | P | 2 | — |
| T26 | Fixture dựng từ KHMT 2023 thật (lấy qua API đọc công khai, không có dữ liệu sinh viên) để chạy thử bộ giải trên cỡ thật | P | 2 | T25 |
| T12 | Bản chụp quan hệ môn của 96 chương trình qua API đọc công khai, có ngày | P | 3 | — |
| T13 | Đo độ nhất quán tiên quyết của cùng một môn giữa các chương trình | P | 3 | T12 |
| T14 | Tầng dữ liệu tiên quyết: chương trình của sinh viên → suy ra → không có; gắn nhãn nguồn | P | 3 | T13 |
| T15 | API `POST /api/plans/solve` | W | 4 | T10, T14 |
| T16 | Trang Gợi ý: giả định đậu/rớt, nút cứng, nút mềm, kết quả, chọn bộ giải | W | 5 | T15 |
| T17 | What-if: giữ mốc, hiện môn dời kỳ và kỳ tốt nghiệp trước/sau | W | 6 | T16 |
| T18 | Tìm lại script trích chương trình `build-vertical.cjs` (không có trong repo), đưa vào repo | P | 7 | Hỏi bạn cùng nhóm |
| T19 | Parser PDF tiến độ myBK theo 4.4, tự kiểm tra tổng tín chỉ, đối chiếu Excel | P | 8 | — |
| T20 | Tự nhận chương trình: so danh sách môn trong file với các chương trình, lưu cặp mã myBK ↔ mã nhóm vào file trong repo | P | 8 | T19 |
| T21 | Kiểm tra sinh viên chọn đúng chương trình (so môn đã đạt với chương trình đã chọn) | W | 8 | T20 |
| T22 | Nút "Tải file myBK" + màn hình xác nhận (đang học, môn rớt) → ghi trạng thái môn | W | 8 | T19 |
| T23 | Dùng file tiến độ làm bài kiểm tra cho dữ liệu chương trình của nhóm (môn thiếu, tín chỉ lệch) | P | 8 | T19, T20 |
| T24 | Chạy trên hồ sơ thật của người duyệt: lộ trình cơ sở + 3 what-if | P | 8 | T19, T11; cần danh sách môn đang học kỳ 261 |
| T27 | Kéo `origin/main` về để code khớp schema Supabase (15 migration); sao lưu trạng thái môn của tài khoản thử trước mỗi lần ghi | W | 9 | — |
| T28 | Backend: API ghi trạng thái môn **đúng như file PDF** (môn đạt → hoàn thành, môn "--" → chưa học; môn không có trong file thì không đụng tới) | W | 9 | T27 |
| T29 | Trang Môn học: nút "Tải PDF tiến độ myBK", hiện đúng nội dung file, ghi database; bỏ tự khai (Tải file mẫu, Nhập từ file, Sửa) | W | 9 | T28 |
| T30 | Trang Gợi ý: bỏ nút myBK cũ; ghi rõ "chưa có môn đang học" tới khi có popup/tab đang học (người duyệt tự làm) | W | 9 | T29 |
| T31 | Kiểm trên local bằng PDF thật: thẻ trang Môn học khớp số môn đạt và TC tích lũy của PDF; cập nhật 01, 03, `check_baseline.py` | W | 9 | T29 |
| T32 | Backend `POST /api/plans/mybk/review`: đọc file, **tìm chương trình theo `curricula.source_code`** (21/11), liệt kê mâu thuẫn file ↔ chương trình, tương ứng `CCGDTC` ↔ PE1003/PE1005, so với trạng thái môn đang có trong database, trả danh sách khác biệt (mã, tên, web đang ghi, file ghi) và cờ "đã từng tải file"; không ghi gì. `import` nhận thêm `apply_curriculum` (đặt chương trình trong hồ sơ). Frontend: hộp xác nhận + hiện đủ trường đọc được | W | 10 | T28 |
| T33 | Backend `POST /api/plans/mybk/import` nhận thêm `choices` (mã môn → trạng thái sinh viên chọn); môn không có trong `choices` thì theo file. Test hàm thuần | W | 10 | T32 |
| T34 | Frontend luồng tải file: **lần đầu** (chưa có tiến độ) ghi luôn; **lần thứ n** mở hộp xác nhận "Thông tin từ file có thể khác với web hiện tại; bạn vẫn có thể tùy chỉnh. Bấm Xác nhận thì ghi đè", bảng khác biệt có ô chọn từng môn. Đổi tên nút tải | W | 10 | T33 |
| T35 | Frontend sửa tay trên bảng môn: cột Trạng thái thành ô chọn, nút "Cập nhật" ghi database rồi tải lại từ database; nhãn "Khác file myBK"; bỏ cột Học kỳ dự kiến (đã làm 20/11, chưa commit) | W | 10 | — |
| T36 | Kiểm bằng tài khoản thử: tải lần 1 → sửa tay vài môn → tải lần 2 thấy đúng các môn khác biệt → tùy chỉnh → Xác nhận → database đúng lựa chọn | W | 10 | T34, T35 |
| T37 | (21/11) Sửa `buildPlannerInput`: database 20/11 đổi tên nhóm "D. Học phần tốt nghiệp" → "Tốt nghiệp", "E. Điều kiện tốt nghiệp" → "Điều kiện tốt nghiệp", nên bộ giải không nhận môn tốt nghiệp (ngưỡng 65/70/85% H12 mất tác dụng) cho cả 132 chương trình. `check_baseline.py` báo KHAC | P | — | Chờ người duyệt |
| ~~T38 (21/11)~~ | Mong muốn mềm "kỳ hay mở lớp": **đã làm** trong sprint 11 dưới tên mục "OH" (`rules.offering_soft`, Q9). Mã T38 được dùng lại ở mục 11.8 | P | — | — |
| T39–T50 | Sprint "Gợi ý theo ý sinh viên" (22/11): đề xuất ở mục 11.8; trạng thái ở mục 6, giai đoạn 11. **Nội dung đầy đủ chưa được ghi lại** | W | 11 | — |
| T51–T66 | What-if theo đặc tả mục 12 (23/11): kế hoạch và checklist ở **mục 12.12** | W | 12 | — |

### Chờ trường trả lời (không chặn việc nào ở trên)

| Câu hỏi | Hỏi ai | Thay đổi gì nếu có câu trả lời |
|---|---|---|
| Bản xuất quan hệ môn theo mã chương trình | Phó Khoa (dự kiến thứ 6, 21/11) | Nạp thêm vào T12, các quan hệ thành nguồn `official` |
| Mã chương trình myBK có xác định duy nhất một phiên bản không | Phó Khoa | T20 |
| Định nghĩa "học trước" ở văn bản nào | Phó Khoa | H6 |
| Cấp 4 học từ năm 3 (Đ15.4) hay năm 4 (PL1)? | Phó Khoa | H11 |
| Kỳ cuối còn dưới mức tối thiểu thì xử lý thế nào (Đ37.2 phạt buộc tạm dừng)? | Phòng đào tạo | H7 |
| Giới hạn tín chỉ kỳ hè | Phòng đào tạo | H14, kỳ hè |

### Chưa lên lịch

Môn tương đương, thay thế; học phí, budget, sở thích, GPA dự kiến (W3, W4, W9); đăng nhập SSO myBK. (Đã làm và bỏ khỏi danh sách: học kỳ hè, sinh viên đổi thứ tự mong muốn, lưu kịch bản vào tài khoản, giải thích chi tiết vì sao không có lộ trình.)

---

## 6. Các giai đoạn và cách kiểm tra

### Giai đoạn 0: Duyệt kế hoạch (không code)
- **Xong khi:** người duyệt ghi "Đã duyệt" vào mục 10, kèm chỗ muốn sửa.

### Giai đoạn 1: Tài liệu (T1, T2)
- [x] File luồng dữ liệu một trang, người duyệt đọc hiểu và gửi được cho thầy.
- [x] File luật từ QĐ 285: mỗi luật có số điều, số trang; ghi rõ giả định nào ở mục 3.1 đã được xác nhận hoặc bác bỏ.

### Giai đoạn 2: Bộ giải theo quy định (T3–T11, T25, T26)
- [x] `.venv/Scripts/python -m pytest planner -q` toàn bộ qua (65 test, 18/11; 98 test ngày 19/11 sau giai đoạn 8).
- [x] Ca K1–K4 (mục 7) ra đúng đáp án, cả hai bộ giải (`tests/test_cases_k.py`).
- [x] Ca K5–K7d ra đúng đáp án, cả hai bộ giải. K6 (môn tốt nghiệp) qua cả hai bộ giải nhưng **đáp án K6 chưa được người duyệt xác nhận**.
- [x] JSON sai (mã môn không tồn tại) → `INPUT_ERROR` kèm lý do, không crash (`tests/test_cli.py`).
- [x] Chạy trên chương trình KHMT 2023 thật (sinh viên bịa): CP-SAT `OPTIMAL` 440 ms, hợp lệ; Clingo `SAT_NOT_PROVEN_OPTIMAL` sau 30 giây, cùng giá trị mục tiêu.

### Giai đoạn 3: Dữ liệu tiên quyết (T12–T14)
- [x] Bản chụp có ngày, có số chương trình và số quan hệ: `pipeline/planner/data/relations-snapshot.json`, 19/11, 96 chương trình, 2 012 quan hệ.
- [x] Báo cáo (`python -m planner.relations report ...`): 493 môn có mặt ở ≥ 2 chương trình; 371 môn có TQ/SH giống nhau ở mọi nơi, 122 môn lệch (phần lớn dạng "đa số chương trình không ghi, vài chương trình có ghi").
- [x] KHMT 2023: 10/96 môn có quan hệ TQ/SH nguồn `curriculum`, 0 môn chỉ có `inferred`, 80 môn không ở trong quan hệ TQ/SH nào. Toàn bộ 96 chương trình: nếu suy ra (ngưỡng ≥ 50%) thì 43 chương trình có thêm tổng 231 quan hệ. **Theo người duyệt (19/11), bộ giải không dùng quan hệ suy ra.**

### Giai đoạn 4: API backend (T15)
- [x] Đăng nhập tài khoản test `khmt.demo@bkuni.local` trên localhost, `curl -X POST http://localhost:3210/api/plans/solve` (kèm cookie đăng nhập, header `Origin`), nhận `OPTIMAL` (19/11).
- [~] Đầu vào: test `Backend/test/planner.spec.ts` kiểm tra chương trình, khối bắt buộc suy ra, quan hệ, giả định đậu/rớt, và **không có tên, MSSV**. Ghi ra file bằng `PLANNER_DUMP_DIR` đã có nhưng chưa thử trên backend đang chạy.
- [x] CP-SAT: `OPTIMAL`, `solver: "cp-sat"`, 177 ms.
- [x] Clingo: `OPTIMAL`, 168 ms, cùng `graduation_semester` (262) và tổng tín chỉ (9) với CP-SAT.
- [x] Chưa chọn chương trình → HTTP 400 "Bạn chưa chọn chương trình đào tạo trong hồ sơ…" (test).

### Giai đoạn 5: Trang Gợi ý (T16)
- [ ] Mở trang bằng tài khoản test, bấm Giải, thấy lộ trình. **Chưa bấm thử trên trình duyệt** (AI không có trình duyệt trong phiên này); trang biên dịch được (`npm run build`), và request trang gửi đã chạy đúng qua API.
- [x] (qua API) Đổi CO4029 đang học sang "rớt": khóa luận CO4337 lùi từ 262 sang 271.
- [x] (qua API) Khóa CO4337 vào kỳ hè 263: `UNSAT`, lý do "Bỏ một trong các lựa chọn sau thì có lộ trình: khóa CO4337 vào kỳ 263".
- [x] (qua API) Muốn học 3 môn với tối đa 11 TC: 2 môn báo "không đáp ứng được"; giao diện hiện "Không đáp ứng được" cạnh mục đó.

### Giai đoạn 6: What-if (T17)
Đã làm 19/11: nút "Lưu làm mốc" (lưu trong localStorage của trình duyệt), mỗi lần giải gửi `previous_plan` (bật S3), thẻ "So với lộ trình mốc" (kỳ tốt nghiệp trước/sau, môn dời kỳ, môn mới, môn bỏ), nhãn "dời từ …" trên từng môn, nút "Về mốc", "Lấy làm mốc mới", "Xóa mốc". Code: `Frontend/src/pages/recommendations/whatIf.ts`, `PlanResultView.tsx`, `index.tsx`.
- [x] (qua API, tài khoản test, 19/11) Rớt CO4029 so với mốc: CO4337 dời 262 → 271, thêm CO4029; S3 báo "1 môn đổi".
- [x] (qua API) CO3051 không mở ở 262: thay bằng CO3029, vẫn xong 262. Ghép với rớt CO4029: xong 271, đổi CO4337, CO3051 → CO3013.
- [x] (qua API) Giải lại đúng kịch bản lúc lưu mốc, kèm mốc: lộ trình giống hệt mốc.
- [ ] Khóa môn kỳ tới so với mốc: chưa chạy.
- [ ] **Chưa bấm thử trên trình duyệt** (thẻ so sánh, Về mốc, tải lại trang vẫn còn mốc).

### Giai đoạn 7: Script trích chương trình (T18)
- [ ] Script nằm trong repo, chạy lại được cho KHMT 2023 và ra đúng dữ liệu đang có trong database. **Chặn**: 19/11 đã tìm trên ổ D và thư mục người dùng, không có `build-vertical.cjs`; cần bạn cùng nhóm gửi.

### Giai đoạn 8: File tiến độ myBK (T19–T24)
Đã làm 19/11 (PDF và Excel): `pipeline/planner/mybk.py` đọc file; `POST /api/plans/mybk/preview` (backend, file chỉ trong bộ nhớ, tối đa 5 MB) đối chiếu với database; nút "Tải file tiến độ myBK" + màn hình xác nhận trên trang Gợi ý, lưu bằng API ghi nhiều môn sẵn có.
- [x] Đọc file Excel của người duyệt (chạy tại máy, không commit): 41 môn, 111/128 TC, hai phép tự kiểm tra qua (`check_baseline.py`).
- [x] Đọc file PDF của người duyệt (`Bảng điểm.pdf`, myBK cập nhật 06/03/2026): `DH_CQ_MT_KHM_2023`, 17 khối, 85 môn liệt kê, 32 môn đạt, 89/128 TC, 2 điều kiện tốt nghiệp (ENG_GC_600, SA4001); hai phép tự kiểm tra qua.
- [x] PDF và Excel của cùng một người: hai file **khác thời điểm** (PDF 89 TC, Excel 111 TC) nên không so bằng nhau được; đã kiểm: mọi môn đạt trong PDF đều có trong Excel (`check_baseline.py`).
- [x] Tự nhận đúng CS-2023-KHMT từ file Excel của người duyệt (qua API, 19/11). Các khóa KHMT 2019–2023 khớp bằng nhau (97,5%) vì cùng danh sách môn; phân biệt bằng khóa suy từ 2 chữ số đầu MSSV. Với PDF: nhận theo mã chương trình qua bảng nối (`method: program_code`).
- [x] (test) Chọn chương trình khác khóa với file → cảnh báo; chọn chương trình khớp kém hơn rõ → cảnh báo (`Backend/test/planner.spec.ts`). Chưa thử trên web vì phải sửa hồ sơ trên database chung.
- [x] File định dạng lạ → HTTP 400 "Chỉ nhận file Excel (.xlsx) tải từ myBK."; số môn đã khai không đổi (qua API).
- [x] So file với dữ liệu chương trình (T23): không lệch tín chỉ. Lệch: `CCGDTC` (myBK) không có trong danh mục web; PDF **không liệt kê** 11 môn mà CS-2023-KHMT của web có: CO3129, CO3131, CO3133, CO3135, CO3137, CO3139, CO3151, CO3153, ENG_GC (myBK ghi `ENG_GC_600`), PE1003, PE1005 (myBK ghi chứng chỉ `CCGDTC`). Cần nhóm xem lại dữ liệu chương trình.
- [ ] Lộ trình thật của người duyệt cùng ba what-if (T24): cần người duyệt tải file trên web, khai môn đang học kỳ 261, rồi chạy.
- [x] Test chỉ dùng file bịa cùng định dạng (`planner/tests/test_mybk.py`, 8 test).

### Giai đoạn 9: Sprint "PDF là nguồn duy nhất" (T27–T31), mở 20/11
Người duyệt chốt 20/11: bỏ tự khai trạng thái môn; trang Môn học chỉ nhận PDF tiến độ myBK, hiện đúng file và ghi database đúng như file. Môn đang học và màn hình kiểm tra để popup/tab riêng, người duyệt tự làm sau. Thử thẳng trên Supabase bằng một tài khoản; sao lưu trạng thái môn của tài khoản đó trước khi ghi.
- [x] T27 (20/11) Kéo `origin/main` (fast-forward tới `655780b`), giữ nguyên thay đổi chưa commit; repo có đủ 15 migration như Supabase; backend chạy lại, jest planner 11 qua. Còn: sao lưu trước lần ghi đầu (làm cùng T28).
- [x] T28 Đã làm (20/11): `mybk.py` (PDF) trả tên, điểm số, điểm chữ, ghi chú từng môn và khối `student`; migration `1795600000000-student-progress-imports` (bảng `student_progress_imports`, mỗi tài khoản 1 dòng, JSON) + entity; `POST /api/plans/mybk/import` (một transaction: ghi đè dòng tiến độ + trạng thái môn đúng như file), `GET /api/plans/mybk/progress`; hàm thuần `planImportStatuses` (jest 3 test). pytest 102, jest planner 14 qua. Migration đã chạy trên Supabase (người duyệt cho phép; xin quyền CREATE; đổi chủ bảng sang `bk_owner`). Tài khoản thử của người duyệt (trước đó 0 môn): tải PDF thật qua API → 31 môn Đã hoàn thành = 89 TC, khớp PDF.
- [~] T29 (20/11) Trang Môn học: nút "Tải PDF tiến độ myBK" (không bước xác nhận), thẻ "Tiến độ hoàn thành CTĐT" hiện từng khối (đạt/cần), môn (Stt, mã, tên, TC, ✓), điều kiện tốt nghiệp; bỏ file mẫu, Nhập từ file, nút Sửa. Điểm, ghi chú, thông tin sinh viên chưa hiện. Build + lint qua; **chưa bấm thử trên trình duyệt** (API đã chạy thật).
- [x] T30 (20/11) Trang Gợi ý bỏ nút myBK cũ, ghi chú "chưa có môn đang học". `MybkImport.tsx` còn trong thư mục (chưa commit, xóa là mất hẳn) nhưng không dùng.
- [ ] T31 Thẻ trang Môn học khớp PDF thật (chạy tại máy, không commit file).

### Giai đoạn 10: Sprint "Sinh viên chốt trạng thái" (T32–T36), mở 20/11
Người duyệt chốt 20/11: database là thứ web hiển thị; mọi màn hình đọc từ database, mọi lần bấm xác nhận/cập nhật đều ghi database. File myBK có thể đọc sai hoặc chưa cập nhật (ví dụ môn đang học), nên sinh viên sửa tay được. Tải file lần đầu ghi luôn; tải lại lần thứ n thì cho xem khác biệt, tùy chỉnh, rồi Xác nhận ghi đè.
- [x] T32 (21/11) `POST mybk/review` (`mybk-review.ts`, hàm thuần; `planner.service.ts`), `import` + `apply_curriculum`, entity khai `source_code`. jest 20 qua (6 test mới), build + lint frontend qua. Gọi `review` bằng PDF thật trên tài khoản demo (không ghi): tìm đúng CS-2023-KHMT, cảnh báo 8 môn CO3129–CO3153 (PDF cũ), `CCGDTC` → PE1003, PE1005. **Chưa bấm trên trình duyệt; chưa gọi `import` mới** (ghi database, chờ tài khoản tài khoản thử A). Chi tiết: [03 mục 4b](03-thiet-ke.md#4b-luồng-tải-pdf-tiến-độ--database-f9-giai-đoạn-910-cập-nhật-2111).
- [ ] T33 Import nhận `choices`; test.
- [~] T34 Hộp xác nhận đã có (21/11), hiện **mọi lần** kể cả lần đầu (người duyệt đồng ý 21/11); chưa có ô chọn trạng thái từng môn (cần T33); tên nút chưa đổi.
- [x] T35 (21/11, thành nút **Hiệu chỉnh**) sửa trạng thái mọi môn, thêm môn, khai học kỳ hiện tại; `PUT mybk/adjustments` ghi database. jest 25 qua; chạy API trên tài khoản thử B (đã trả lại môn thử). Chưa bấm trên trình duyệt; chưa có chuyển nhóm.
- [ ] T36 Kịch bản lần 1 → sửa tay → lần 2 chạy đúng trên tài khoản thử.

### Giai đoạn 11: Sprint "Gợi ý theo ý sinh viên" (T38–T50), mở 22/11
> Nội dung từng việc T38–T45, T47–T50 **chưa được ghi lại** (mất từ phiên 22/11); dưới đây chỉ có T45b, T46. Theo README: T40, T42, T43 xong; T41, T45, T47 gần xong. Đề xuất gốc của các mã ở mục 11.8.
- [~] T45b (23/11) Gọn trang Gợi ý theo người duyệt (xem nhật ký 23/11): `warning_items` (report.py, cli.py; `warnings` giữ nguyên), nút không mở / ô TC trên bảng, xác nhận chuẩn tiếng Anh. Sửa lỗi "FREE_6_1: chua tung mo ky he" (validate.py). pytest 68 + 7 xfail + 1 xpass (các bộ liên quan), jest planner 23 qua, typecheck + lint qua. **Chưa bấm thử trên trình duyệt.** Còn (đã hẹn): gõ mã môn bất kỳ vào ô khối / ô tự chọn tự do, thêm môn bất kỳ vào kỳ ngay trên bảng.
- [~] T46 (22/11) Hiệu chỉnh: ô "Môn đang học kỳ này" mở ra được, hiện mã, tên, TC, khối được tính; **mọi môn trong mọi khối** (đã học, đang học, chưa học, ngoài CTĐT) có cột "Tính vào khối" sửa được, kể cả "Bắt buộc" (id `required`); chọn riêng thì nhắc "Có thể khác cách tính của myBK" (thay nhãn "Bạn chọn", người duyệt 22/11). Trang Gợi ý: mở trang luôn giải lại (đọc trạng thái/khối mới từ database), nút "Giải lại lộ trình" đưa lên đầu cột trái. Test jest tích hợp: PUT adjustments → `data.web.block_choices` → solve nhận `block_overrides`. Chọn khối cho môn bất kỳ (lưu `data.web.block_choices`, gửi bộ giải `student.block_overrides`). Bộ giải: môn đang học giả định đậu (cả ngoài CTĐT) được trừ vào tự chọn tự do (`_assumed_pass`). Trang Gợi ý hiện môn ngoài CTĐT trong "Nếu đậu hoặc rớt", có tên trên bảng. pytest test_normalize 11 qua (bộ đầy đủ 139 + 7 xfail + 1 xpass trước lần sửa cuối), jest 99 qua, typecheck + lint frontend qua. **Chưa bấm thử trên trình duyệt.** Còn: thêm môn ngoài CTĐT vào ô "Muốn học"/ghim ở trang Gợi ý (hiện chỉ có môn trong CTĐT).

---

### Giai đoạn 12: What-if theo đặc tả mục 12 (T51–T66), mở 23/11
Kế hoạch và checklist chi tiết ở mục 12.12. Giao diện mới làm sau; giai đoạn này chỉ chốt chức năng trên giao diện hiện có. Trước khi code: trả lời W12 (W10, W11, W13 chốt 23/11, mục 12.10).

## 7. Ca kiểm tra có đáp án xếp tay

Người duyệt xác nhận **trước khi** code giai đoạn 2. K1–K4 tính trên chương trình bịa `toy.json` với mức tín chỉ của fixture (3–12).

| Ca | Đầu vào | Đáp án mong đợi | Xác nhận |
|---|---|---|---|
| K1 | Kịch bản `base` | Xong ở kỳ 271, 20 TC | [x] 18/11 |
| K2 | Validator; CS202 rớt (là song hành của CS301); lộ trình viết tay: CS301 ở 262, CS202 học lại ở 271 | Báo vi phạm song hành ở CS301. (Cách hiểu cũ của web cho lọt) | [x] 18/11 |
| K2b | Bộ giải, cùng đầu vào K2 | CS202 ở 262, cùng kỳ hoặc trước CS301; vẫn xong ở 271, tổng 23 TC | [x] 18/11 |
| K3 | `base`, tối đa 9 TC mỗi kỳ | Xong ở kỳ 272 | [x] 18/11 |
| K4 | `base`, muốn học EL303 | EL303 có trong lộ trình, vẫn xong ở 271 | [x] 18/11 |
| K5 | `base`, bật cấp độ môn. Khóa 2025, nên kỳ 26x là năm 2, kỳ 27x là năm 3 | Kỳ 262 (năm 2) chưa được học môn cấp 3 (CS3xx, EL3xx) và cấp 4 (CS401); MA201 cần MA102 đạt trước. Nên 262 chỉ có MA102 (3 TC). CS401 phải sau CS301 (sớm nhất 271) nên **xong ở kỳ 272**, tổng vẫn 20 TC | [x] 18/11 |
| K5b | Như K5 nhưng khóa 2024 (kỳ 26x là năm 3) | Giống `base`: xong ở 271, 20 TC | [x] 18/11 |
| K6 | `base`, gán CS401 là khóa luận, ngưỡng 85%. Tổng TC chương trình toy = 30 bắt buộc + 6 tự chọn = 36, nên cần ceil(30,6) = 31 TC trước kỳ học CS401 | Trước 262 có 16 TC, kỳ 262 tối đa 12, nên trước 271 tối đa 28 < 31: CS401 sớm nhất 272. **Xong ở 272, 20 TC**. Validator phải bắt lộ trình `base` (CS401 ở 271 khi mới 25 TC) | [ ] chờ xác nhận (đã chạy qua cả hai bộ giải) |
| K7 | `base`, bật S6. Thêm khuyến nghị: nên học CS401 trước EL302 | Giữ được khuyến nghị mà không lùi kỳ: bỏ EL302, chọn EL303 (cùng kỳ 262 với CS301) + EL304. **Xong ở 271, 20 TC**, S6 đáp ứng. Đúng với cả hai cách xếp S6 | [x] 18/11 |
| K7b | `base`, bật S6. Thêm khuyến nghị tạo vòng: nên học CS401 trước CS301 (trong khi CS401 có tiên quyết CS301) | Không lộ trình nào giữ được nên **phải phá**, vẫn xong ở 271, 20 TC. `preferences_report` ghi S6 **không đáp ứng**, nêu cặp CS301–CS401 | [x] 18/11 |
| K7c | `base`, bật S6, **mặc định**. Thêm khuyến nghị: nên học MA102 trước CS301 | MA102 rớt nên học lại sớm nhất ở 262, giữ khuyến nghị thì CS301 sớm nhất 271 và CS401 sớm nhất 272. Mặc định S1 thắng: **xong ở 271, 20 TC**, giống `base`; S6 **không đáp ứng**, nêu cặp MA102–CS301 | [x] 18/11 |
| K7d | Như K7c, `recommendations_first: true` | S6 thắng: **xong ở 272, 20 TC**, S6 đáp ứng. Ví dụ một lộ trình: 262 MA102, CS302 · 271 CS301, MA201, EL302, EL304 · 272 CS401. Báo "muộn hơn 1 kỳ để giữ khuyến nghị" | [x] 18/11 |
| K8 | `base` thêm kỳ hè 263, tối đa 9 TC mỗi kỳ, **không bật hè** | Giống K3: xong ở 272; kỳ 263 không có môn | [ ] chờ xác nhận (đã chạy qua cả hai bộ giải) |
| K8b | Như K8, **bật hè 263** | 262 và 271 chỉ chứa 18 < 20 TC nên phải dùng hè ít nhất 2 TC. S9 đứng trên: ưu tiên môn cấp 1–2, nên chọn MA201 hoặc MA102 (3 TC) thay vì CS401 (2 TC, cấp 4). **Xong ở 271**, hè là MA201 hoặc MA102; S7 báo 3 TC, dưới khoảng 6–9 | [ ] chờ xác nhận (đáp án đổi ngày 19/11 vì S9 > S7; đã chạy qua cả hai bộ giải) |
| K8d | Như K8b, đánh dấu MA201 là đồ án (`summer_excluded`) | Hè chỉ còn MA102. **Xong ở 271**, hè là MA102 | [ ] chờ xác nhận (đã chạy qua cả hai bộ giải) |
| K8c | Như K8b nhưng CS401 đổi thành 3 TC (tổng 21 TC, hè phải chứa 3 TC) | Môn 3 TC xếp hè được: MA201, MA102 (cấp 1–2) hoặc EL3xx, CS401 (cấp 3–4). S9 chọn cấp 1–2: **xong ở 271**, môn hè là MA201 hoặc MA102 | [ ] chờ xác nhận (đã chạy qua cả hai bộ giải) |

---

## 8. Những gì KHÔNG làm

- Không sửa schema, không chạy migration, không sửa dữ liệu trên Supabase chung.
- Không đổi trang Phân tích hay heuristic cũ. (Trang Phân tích đã gỡ 28/11.)
- Không cho AI tư vấn dùng kết quả bộ giải. (Tính năng AI tư vấn đã gỡ 28/11.)
- Không đăng nhập myBK hay thu mật khẩu; file tiến độ do sinh viên tự tải lên.
- Không lưu file tiến độ gốc; không đưa tên, MSSV, điểm thật vào code hay test. (Từ 20/11: điểm, họ tên, MSSV, mã lớp, điểm TBTL **được lưu** trong database theo tài khoản, xem nhật ký. Code, test và commit vẫn chỉ dùng dữ liệu bịa.)

---

## 9. Nhật ký quyết định

| Ngày | Quyết định | Trạng thái |
|---|---|---|
| 28/11 | **Gỡ tab "Chương trình" và trang Phân tích** theo yêu cầu người duyệt (có người kiểm code): trang Môn học chỉ còn tiến độ myBK + Hiệu chỉnh, mã môn là link `/courses/:code`. Xóa bảng thẻ, sơ đồ điều kiện, `/courses/analysis`, component, CSS, API frontend; backend xóa `/student-plan-courses/*`, `PUT/DELETE /student-courses/me/:courseId`, `GET /course-outlines/summaries`. Bảng `student_plan_courses` để nguyên trên DB chung. Q2 hết đối tượng (không còn bảng thẻ ghi `student_courses`) | Đã duyệt (người duyệt 28/11) |
| 28/11 | **Gỡ tính năng AI tư vấn (chatbot)** theo yêu cầu người duyệt: xóa trang, API, CSS, module backend, tool, entity, test, biến `DEEPSEEK_*`, hàm `search`/`similar` của Elasticsearch (chỉ tool AI gọi) và các mục AI trong báo cáo LaTeX (FR-7, UC-10 cũ, mục RAG). Không viết migration: bảng cũ để nguyên trên DB chung | Đã duyệt (người duyệt) |
| 28/11 | **Gỡ Elasticsearch** (không còn ai đọc index): module `outline/search`, API `search/status`, `search/reindex`, script reindex, docker-compose, biến môi trường, test, bài lab ES; bỏ Search Index khỏi sơ đồ kiến trúc. Copy nguồn sơ đồ `Report/ClassDiagram`, `Report/ERD` từ DACN2, bỏ advisor, sinh lại PDF cho LaTeX bằng Inkscape | Đã duyệt (người duyệt) |
| 23/11 | Gộp 9 commit remote (bộ phân loại tag, thẻ sở thích cho Clingo): giữ trang Gợi ý mới; ô chọn thẻ sở thích chưa hiện vì chọn bộ giải đang ẩn (Q13), phần backend và ASP giữ nguyên. Báo đồng đội | Đề xuất (cần đồng đội đồng ý) |
| 23/11 | Trang Gợi ý gọn lại: bỏ khung "Ghim môn vào kỳ" và "Môn không mở ở kỳ" ở cột trái; "không mở" thành nút trên thẻ môn (hỏi xác nhận, chip ở đầu kỳ bấm × để bỏ); số TC muốn là ô ngay đầu mỗi kỳ; cảnh báo gắn vào đúng môn / kỳ (nhãn "Lưu ý"), lời nhẹ nhàng; cảnh báo chỉ là nhắc thì sinh viên tự xác nhận (chuẩn tiếng Anh → ghi ENG_GC* Đã hoàn thành). Bỏ nhãn "mới so với mốc", "dời từ" trên bảng. Validator: ô FREE_ và luật mở lớp mềm (Q9) không còn là lỗi kỳ hè | Đã duyệt (người duyệt) |
| 22/11 | **T46: hoàn toàn tôn trọng lựa chọn của sinh viên về khối.** Môn bất kỳ (kể cả ngoài CTĐT) được tính vào khối sinh viên chọn ở Hiệu chỉnh; web không chặn khối nào, chỉ nhắc sinh viên tự hỏi khoa về việc công nhận. Mặc định: khối của file myBK, môn ngoài CTĐT tính vào tự chọn tự do. Sửa cùng ngày: áp cho **mọi môn** (đã/đang/chưa học), chỉ nhắc "có thể khác cách tính của myBK"; mở trang Gợi ý luôn giải lại từ database | Đã duyệt (người duyệt) |
| 18/11 | Backend gọi bộ giải Python qua dòng lệnh | Đề xuất |
| 18/11 | Không sửa Supabase chung; dữ liệu thêm để trong file của repo | Đề xuất |
| 18/11 | Song hành theo QĐ 285: môn liên quan phải đạt | Đề xuất |
| 18/11 | "Học trước" giữ nghĩa của web tới khi có văn bản | Giả định |
| 18/11 | Thứ tự mong muốn cố định S1 > S4 > S2 > S5 > S3 | Đề xuất |
| 18/11 | Khối lấy từ file tiến độ của từng sinh viên, không chuẩn hóa giữa các ngành | Đề xuất |
| 18/11 | Không cho sinh viên tải PDF chương trình đào tạo; nhóm tự trích | Đề xuất |
| 18/11 | Lên web trước (giai đoạn 4–6), parser myBK sau (giai đoạn 8) | Đề xuất |
| 18/11 | Cho phép dùng tài khoản test `khmt.demo@bkuni.local` trên localhost | Đã duyệt |
| 18/11 | Giai đoạn 0 (kế hoạch) | Đã duyệt |
| 18/11 | Khuyến nghị (KN) thành mềm S6: không giữ được thì phá, nhưng báo rõ. "Học trước" (HT) giữ cứng như cũ | Đã duyệt (người duyệt; trước đó AI hiểu nhầm là HT, đã sửa) |
| 18/11 | Năm học tính theo khóa cho dễ tính, không theo tín chỉ tích lũy (Đ24) | Đã duyệt (người duyệt) |
| 18/11 | Tín chỉ mỗi kỳ 11–25 theo kinh nghiệm thực tế; kỳ cuối dưới mức tối thiểu cho phép kèm cảnh báo | Đã duyệt 11–25 (người duyệt); phần kỳ cuối là đề xuất |
| 18/11 | Mặc định S1 > S6 (tốt nghiệp sớm trước, rồi ít phá khuyến nghị); sinh viên chọn được S6 > S1; luôn báo rõ cặp bị phá và kỳ tốt nghiệp trước/sau | Đã duyệt (người duyệt) |
| 18/11 | Bỏ hẳn quan hệ học trước (HT) khỏi bộ giải | Đã duyệt (người duyệt) |
| 19/11 | Làm liền giai đoạn 3, 4, 5 rồi mới báo cáo (khác quy tắc mỗi lần một giai đoạn) | Đã duyệt (người duyệt yêu cầu) |
| 19/11 | GĐ 3: suy ra TQ/SH từ chương trình khác khi ≥ 50% chương trình có cả hai môn ghi quan hệ đó | **Bỏ** (người duyệt 19/11: không cần). Khi giải chỉ dùng quan hệ của chính chương trình; `relations.py` còn giữ để chụp và báo cáo độ nhất quán |
| 19/11 | 11 TC ở kỳ chính thành mong muốn mềm S11 dưới S2: không học thừa để đủ; kỳ chính nào dưới 11 TC (kể cả kỳ giữa, kỳ cuối) được ghi chú trao đổi phòng đào tạo. Mức 11–25 giữ nguyên | Đã duyệt (người duyệt) |
| 19/11 | GĐ 4: backend gọi `python -m planner.cli` qua stdin/stdout; cấu hình `PLANNER_DIR`, `PLANNER_PYTHON`, `PLANNER_TIMEOUT_MS`, `PLANNER_DUMP_DIR` (đều không bắt buộc). Giới hạn 20 lần/phút/người | Đề xuất (đã làm) |
| 19/11 | GĐ 4: backend dùng luật 11–25 TC, cấp độ môn, hè 12 TC, 15–18 TC, 6–9 TC, ngưỡng 65/70/85% cho mọi chương trình (`PLANNER_RULES` trong `planner-input.ts`), không dùng mức 11–24 của database | Đề xuất (đã làm) |
| 19/11 | GĐ 4: khi `UNSAT` mà không do lựa chọn của sinh viên, bộ giải thử nới từng luật của trường (cấp độ môn, mức tối thiểu, ngưỡng môn tốt nghiệp) để nói luật nào chặn | Đề xuất (đã làm) |
| 19/11 | Câu chữ hiện cho sinh viên (báo cáo mong muốn, cảnh báo, giả định, lý do không có lộ trình) chuyển sang tiếng Việt có dấu; thông báo lỗi nội bộ của validator giữ không dấu | Đề xuất (đã làm) |
| 18/11 | Môn bắt buộc = môn của chương trình **không thuộc khối tự chọn gốc nào**, giống cách trang Phân tích của web đang làm (`analyze.ts`). Database gần như không có khối `required` | Đề xuất, sau khi quét database |
| 18/11 | Môn tốt nghiệp lấy theo nhóm "D. Học phần tốt nghiệp" (KHMT 2023: CO3335, CO4029, CO4337); môn điều kiện lấy theo nhóm "E. Điều kiện tốt nghiệp" (ENG_GC, SA4001) | Đề xuất; mới kiểm tra trên KHMT 2023 |
| 18/11 | GĐ 2: thêm bước chuẩn hóa dữ liệu dùng chung `planner/normalize.py` (bỏ môn điều kiện, khối chuyên ngành, ô tự chọn tự do `FREE_k`, tổng TC chương trình). Cả hai bộ giải và validator dùng chung bước này; luật vẫn viết riêng | Đề xuất (đã làm) |
| 18/11 | GĐ 2: chuẩn tiếng Anh và MOS cho khóa luận chỉ **cảnh báo**, không chặn xếp lịch (bộ giải không biết sinh viên đạt chuẩn vào kỳ nào) | Đề xuất (đã làm) |
| 18/11 | GĐ 2: thực tập được xếp cả kỳ chính lẫn kỳ hè; kỳ hè chỉ xếp thực tập, không có mức tối thiểu | Đề xuất (đã làm) |
| 18/11 | GĐ 2: tín chỉ tích lũy cho môn tốt nghiệp = môn đã đạt trong chương trình + môn xếp ở các kỳ trước + TC ngoài chương trình tính vào tự chọn tự do. Chưa trừ phần học vượt nhóm tự chọn (Đ20.1) | Đề xuất (đã làm) |
| 18/11 | GĐ 2: fixture `khmt2023.json` (chương trình thật, sinh viên bịa) được tạo bằng `planner/fetch_curriculum.py` qua API đọc công khai; không chứa dữ liệu cá nhân | Đề xuất (đã làm) |
| 19/11 | Song hành xếp cùng kỳ: bộ giải cho phép, nhưng **cảnh báo** "môn này chỉ được tính tín chỉ khi môn song hành đạt" | Đã duyệt (người duyệt) |
| 19/11 | Thứ tự tính tín chỉ theo file tiến độ myBK: bắt buộc > tự chọn > tự chọn tự do; khi xét tự chọn tự do, phần học vượt nhóm tự chọn (môn trong chương trình) tính trước, môn ngoài chương trình tính sau | Đã duyệt (người duyệt) |
| 19/11 | Kỳ hè do **sinh viên tự bật** (`summer_opt_in`); không bật thì kỳ hè chỉ xếp thực tập. Đã bật thì chỉ xếp môn từng mở hè trong lịch sử, và vẫn có mong muốn mềm S7 "ít học hè" | Đã duyệt (người duyệt) |
| 19/11 | Kỳ hè tối đa **12 TC**, cứng, sinh viên chỉnh được (`rules.summer_credits_max`, `semester_limits`) | Đã duyệt (người duyệt) |
| 19/11 | Mong muốn mềm S8: kỳ chính đẹp nhất **15–18 TC** (gói 18 tín của trường); kỳ cuối không tính phần thiếu | Đã duyệt (người duyệt) |
| 19/11 | Thứ tự mới: S1 > S6 > S4 > **S7** > **S9** > S2 > **S8** > S5 > S3. S8 đặt dưới S2 để không học thêm môn chỉ cho đủ 15 TC; S9 dưới S7 nên bộ giải chọn ít tín chỉ hè trước, rồi mới chọn loại môn | Đề xuất |
| 19/11 | S9: kỳ hè ưu tiên môn đại cương, cơ sở ngành (mềm) | Đã duyệt (người duyệt) |
| 19/11 | Đổi thứ tự: **S9 > S7** (hè ưu tiên đại cương tự nhiên, xã hội, một số môn cơ sở; các môn này mới hay mở hè) | Đã duyệt (người duyệt) |
| 19/11 | **Không xếp đồ án vào kỳ hè** (cứng): môn có chữ "đồ án" trong tên (`summer_excluded`, KHMT: CO3101–CO3111, CO3119, CO3127, CO4029, CO4337). Thực tập ngoài trường vẫn xếp hè được nếu đủ điều kiện | Đã duyệt (người duyệt) |
| 19/11 | S7 đổi nghĩa thành "kỳ hè có học thì 6–9 TC"; "ưu tiên kỳ chính hơn kỳ hè" chuyển thành S10, ưu tiên thấp nhất | Đã duyệt khoảng 6–9 (người duyệt); việc tách S10 là đề xuất |
| 19/11 | Sinh viên tự xác nhận môn có mở sau đợt đăng ký 2 (`not_offered`) và tự khóa môn vào một kỳ (`locked`): dùng chức năng sẵn có, không thêm gì | Đã duyệt (người duyệt) |
| 18/11 | Kỳ hè chỉ xếp thực tập ngoài trường (H14) | **Thay bằng** quyết định 19/11: sinh viên tự bật kỳ hè (`summer_opt_in`) |
| 19/11 | Người duyệt: làm hết các giai đoạn còn lại rồi kiểm một lần | Đã duyệt (người duyệt yêu cầu) |
| 19/11 | GĐ 6: mốc what-if lưu trong localStorage của trình duyệt, theo tài khoản và chương trình; không lưu database. Ô tự chọn tự do không đưa vào mốc | Đề xuất (đã làm) |
| 19/11 | GĐ 8: đọc file bằng Python (`planner/mybk.py`), backend nhận file trong bộ nhớ rồi gọi Python như bộ giải; đối chiếu chương trình ở backend (cần database) | Đề xuất (đã làm) |
| 19/11 | GĐ 8: Excel chỉ có môn đã đạt, nên màn hình xác nhận cho sinh viên tự chọn "đang học"/"rớt" cho môn còn lại; môn web ghi "đã hoàn thành" mà myBK không có thì mặc định về "chưa học", có ghi chú | Đề xuất (đã làm) |
| 19/11 | GĐ 8: khóa suy từ 2 chữ số đầu MSSV trong file (chỉ trả năm, không trả MSSV), dùng để phân biệt các khóa có cùng danh sách môn | Đề xuất (đã làm) |
| 19/11 | GĐ 8: đọc PDF bằng PyMuPDF (`pymupdf`, chữ sạch hơn `pypdf`); dò khối theo mẫu "<tên> <đạt/cần> <biểu tượng> Khối kiến thức Bắt buộc/Tự chọn"; khối "Điều kiện tốt nghiệp" thành `graduation_conditions` | Đề xuất (đã làm) |
| 19/11 | GĐ 8: PDF ghi "--" cho cả môn chưa học và môn rớt, không ghi môn đang học: màn hình xác nhận dùng chung cách với Excel (sinh viên tự chọn) | Đề xuất (đã làm) |
| 18/11 | Cấp 4 học từ năm 3 theo Đ15.4 (PL1 ghi năm 4) | Giả định, chờ hỏi |
| 18/11 | Chuẩn ngoại ngữ, MOS, GDQP, GDTC: sinh viên khai qua `student_flags`; không khai thì giả định đạt | Đề xuất |
| 20/11 | **Bỏ tự khai** trạng thái môn; PDF myBK là nguồn duy nhất, ghi đè database đúng như file, môn không có trong file thì không đụng tới. Thay quyết định 19/11 "không tự lưu, sinh viên xác nhận từng môn" | Đã duyệt (người duyệt) |
| 20/11 | Không dùng Postgres local (rỗng, thiếu 3 migration). Thử thẳng trên Supabase; lệnh ghi chỉ đụng dòng của tài khoản đang đăng nhập; sao lưu dòng đó trước khi ghi | Đã duyệt (người duyệt) |
| 20/11 | Database là nguồn hiển thị duy nhất; sinh viên sửa tay trạng thái môn, bấm Cập nhật thì ghi database. Tải file lần đầu ghi luôn, lần thứ n hỏi xác nhận kèm khác biệt và cho tùy chỉnh trước khi ghi đè (giai đoạn 10). Bỏ cột Học kỳ dự kiến ở trang Môn học | Đã duyệt (người duyệt) |
| 20/11 | Lưu cột "Ghi chú" từng môn (backend có, frontend chưa dùng). Không lưu đoạn "Độ ưu tiên thứ tự khi xét hoàn thành…" ở đầu file (giống nhau cho mọi sinh viên) | Đã duyệt (người duyệt) |
| 21/11 | Dữ liệu CTĐT trên database thay bằng dữ liệu myBK ngày 20/11 (Thiên); **trường đã cho phép** lấy (Thiên xin thầy), không phải cào | Ghi nhận (người duyệt) |
| 21/11 | Luồng PDF: tìm chương trình theo `curricula.source_code` = mã CTĐT của file (thay bảng nối viết tay); cho sinh viên xác nhận khi chương trình và file mâu thuẫn, rồi mới ghi; hiện **toàn bộ** thông tin đọc được | Đã duyệt (người duyệt) |
| 21/11 | Hộp xác nhận hiện mọi lần tải (kể cả lần đầu), vì lần đầu cũng phải xác nhận chương trình: chọn PDF → `review` (không ghi) → hộp xác nhận → `import` ghi → giao diện đọc lại từ database. Thay T34 "lần đầu ghi luôn". Không làm nút kiểm thử riêng sau khi ghi | Đã duyệt (người duyệt) |
| 21/11 | Mâu thuẫn mức lỗi (không tìm được chương trình, file không qua tự kiểm tra) khóa nút Xác nhận | Đề xuất (đã làm) |
| 21/11 | `CCGDTC` ↔ PE1003, PE1005: hiện hai mã, suy theo tên môn "Giáo dục thể chất"; không ghi trạng thái hai môn này | **Thay bằng** dòng dưới (cùng ngày) |
| 21/11 | `CCGDTC` đạt thì tính PE1003, PE1005 Đã hoàn thành (ghi khi lưu); nối cố định, chỉ cho chương trình có quy định ghi `CCGDTC` (46 chương trình khóa 2023; khóa 2024, 2026 myBK dùng PE1009, PE1011… chưa xử lý). Hộp xác nhận chỉ một dòng, bỏ dòng giải thích | Đã duyệt (người duyệt) |
| 21/11 | Nút **"Nhập tiến độ từ myBK"** (đổi tên, trả lời câu hỏi T34) cho **2 cách**: (1) tải PDF, có hướng dẫn chọn **"Lưu dưới dạng PDF"**, không chọn "Microsoft Print to PDF" (file không có chữ; bộ đọc báo đúng lỗi này); (2) **dán nội dung trang** (Ctrl+A, Ctrl+C, Ctrl+V): dấu ✓ mất nên "đạt" suy từ điểm (4–10 khác F; 12 = miễn; 21 = đạt), tự kiểm tra cộng tín chỉ khối vẫn chặn suy sai. Cả hai đi qua cùng hộp xác nhận | Đã duyệt (người duyệt); đã làm |
| 21/11 | Nút **"Hiệu chỉnh"** dưới thẻ tiến độ: để sẵn, bị khóa, tooltip "Sắp có"; chức năng người duyệt thiết kế sau | **Thay bằng** các dòng dưới (cùng ngày) |
| 21/11 | **Mỗi lần nhập (PDF hoặc dán), trạng thái môn trên web theo đúng file mới**: môn file không nhắc tới bị xóa (= mặc định Chưa học), kể cả môn đã hiệu chỉnh tay; hộp xác nhận liệt kê trước "Chưa học (file không có)". Thay quy tắc 20/11 "môn không có trong file thì không đụng tới" (gây sót IM3047 ở tài khoản thử B). Học kỳ đã khai vẫn giữ | Đã duyệt (người duyệt) |
| 21/11 | Hiệu chỉnh: mỗi lần đổi trạng thái hoặc xóa có hộp xác nhận OK/Hủy; GDTC hiện một dòng "Giáo dục thể chất" (không mã), đổi thì đổi cả PE1003 + PE1005; khối cuối tên "Môn ngoài chương trình đào tạo", xóa được môn ở khối này | Đã duyệt (người duyệt); đã làm |
| 21/11 | **Hiệu chỉnh** (thay T35): sinh viên sửa trạng thái **mọi môn** (4 trạng thái), **thêm môn bất kỳ** trong danh mục (mặc định Đang học), **khai học kỳ hiện tại**; môn "Đang học" là môn của kỳ đó, bộ giải xếp từ kỳ sau. Lưu ghi `student_courses` + `student_progress_imports.data.web.current_semester` (không migration; nhập lại file vẫn giữ). Nội dung file giữ nguyên; dòng khác file có nhãn "Khác file" | Đã duyệt (người duyệt); đã làm |
| 21/11 | Frontend **không hiện điểm** (điểm số, điểm chữ; bỏ luôn dòng điểm TBTL). Dữ liệu điểm vẫn lưu trong JSON | Người duyệt chốt bỏ 2 cột điểm; bỏ dòng TBTL là đề xuất |
| 21/11 | Chuyển nhóm (kéo môn sang khối khác): **chưa làm**, để sau. Người duyệt muốn sinh viên được hiệu chỉnh mọi thứ; nhưng nhóm ảnh hưởng cách bộ giải tính tín chỉ khối, cần thiết kế riêng | Chờ người duyệt |
| 21/11 | **Bộ giải không xếp GDTC** (PE1003, PE1005) vào lộ trình: coi như điều kiện tốt nghiệp (`NOT_SCHEDULED_CODES` trong `planner-input.ts`). File không cho biết GDTC (khóa 2024, 2026 myBK ghi môn thể thao PE1009… thay vì `CCGDTC`) thì hộp xác nhận báo "Chưa hoàn thành GDTC", không báo PE1003/PE1005 là thiếu; môn 0 TC ngoài chương trình không tính tự chọn tự do. Khi có file thật khóa 2024+, nối theo khối GDTC của file | Đã duyệt (người duyệt) |
| 21/11 | Môn có trong file mà không thuộc chương trình: báo "tính vào tự chọn tự do" (mức thông tin), không còn là cảnh báo. Bỏ khung "Trạng thái môn ở bảng dưới lấy đúng từ file…" | Đã duyệt (người duyệt) |
| 21/11 | Đặt chương trình trong hồ sơ theo file chỉ khi sinh viên tích ô (mặc định tích); đổi chương trình thì bỏ chuyên ngành mục tiêu | **Thay bằng** dòng dưới (cùng ngày) |
| 21/11 | **Mã CTĐT myBK là gốc**: bấm Xác nhận là tài khoản theo chương trình của file, **bỏ ô tích** và bỏ việc tự chọn chương trình. Người dùng chỉ thấy mã myBK (`DH_CQ_MT_KHM_2023`), không thấy mã nội bộ của web (`CS-2023-KHMT`). Cột `curriculum_id` vẫn giữ (nhiều trang, API đang dùng) nhưng chỉ đặt từ file | Đã duyệt (người duyệt) |
| 21/11 | Trang Môn học: thông báo "Chưa có chương trình đào tạo" kèm nút tải PDF, thay nút "Điền hồ sơ" | Đã duyệt (người duyệt) |
| 21/11 | Trang Hồ sơ: hiện thông tin từ PDF (chỉ đọc); **tạm bỏ** số điện thoại, ngày sinh, địa chỉ, mục tiêu tín chỉ. Làm **sau khi gộp `main`** (Thiên đã viết lại trang Hồ sơ) | Đã duyệt (người duyệt); chưa làm |
| 21/11 | Chuyên ngành mục tiêu (H15): không đặt ở Hồ sơ; khai riêng ở trang bộ giải, làm sau (người duyệt nắm ngành KHMT, ngành khác phải xem lại) | Đã duyệt (người duyệt); chưa làm |
| 21/11 | Trang Môn học (sinh viên) **bỏ** hàng thống kê (môn đã khai, môn hoàn thành, TC), bảng tóm tắt theo kỳ và bảng môn bên dưới thẻ tiến độ; chỉ còn thẻ tiến độ PDF. Chỗ thêm/bớt/sửa trạng thái sau khi đọc file: nút **"Hiệu chỉnh"**, người duyệt tự thiết kế (thay hướng T35 "cột Trạng thái thành ô chọn"). Quản trị vẫn có bảng tra cứu danh mục môn | Đã duyệt (người duyệt); đã làm |
| 21/11 | Sidebar thu gọn được còn cột icon (72px), nhớ lựa chọn trong trình duyệt (`localStorage`, khóa `bkuni.sider.collapsed`) | Đã duyệt (người duyệt); đã làm |
| 21/11 | Môn có mở hay không: sinh viên tự đánh trong what-if (đã có `not_offered`). Ưu tiên kỳ hay mở: mềm, ưu tiên thấp, xét 2–3 năm gần nhất (T38), làm sau | Đã duyệt (người duyệt) |
| 23/11 | Giai đoạn 12: chỉ bấm Giải mới gọi bộ giải, kể cả lúc mở trang (W10); bỏ "Môn không được rớt" (W11); bỏ nút Khóa kỳ (W13, muốn khóa thì ghim + ô TC); giao diện giữ Ant Design, đủ chức năng mẫu M1–M18 | Đã duyệt (người duyệt) |
| 23/11 | Thứ tự ưu tiên mặc định: Ra trường sớm > 15–18 TC > Không học dư (cả 3 bật), mục ẩn S6, S4, OH, S3 đứng sau | Đề xuất (W12 chưa chốt) |
| 23/11 | Mốc what-if = bản lưu gắn sao trong tài khoản (`data.web.planner.plans`); mốc cũ trong trình duyệt chuyển thành bản "Mốc cũ" | Đề xuất |
| 23/11 | Ô tự chọn tự do: môn gõ mã ngoài chương trình thành khối bắt buộc riêng trừ vào ô trống (`student.free_choices`); mã không có trong bảng môn thì 400 | Đề xuất |
| 21/11 | Môn đang học: chỗ riêng (người duyệt tự làm, như GĐ 9). Rớt hay chưa học, chuyên ngành (H15) từ file: chưa xét | Đã duyệt (người duyệt) |
| 21/11 | Không gọi API myBK thay sinh viên (cần mật khẩu, trái mục 8 của 01); chỉ nhận file sinh viên tự tải lên | Đề xuất |
| 20/11 | Lưu nội dung file tiến độ (khối, môn, đạt/chưa, **điểm**, điều kiện tốt nghiệp) vào bảng mới `student_progress_imports` (JSON, mỗi tài khoản một dòng) để hiển thị lại đúng trang myBK. Cần **1 migration trên Supabase chung**; thay quy tắc "không lưu điểm" ở mục 8. Sửa cùng ngày: **lưu hết** cả họ tên, MSSV, mã lớp, khoa, điểm TBTL hệ 10 và hệ 4 (`student` trong JSON); frontend chưa gọi ra | Đã duyệt (người duyệt) |

---

## 10. Duyệt

Chỉ cần ghi "Đồng ý" hoặc "Không" vào cột thứ hai.

| Giai đoạn | Đồng ý? | Ngày | Ghi chú |
|---|---|---|---|
| 0 | Đồng ý | 18/11 | Kèm 5 ghi chú, đã xử lý: khuyến nghị thành mềm, H7, bộ giải OR-Tools ở GĐ 4, bảng duyệt, mô tả luồng dữ liệu |
| 1 | đồng ý | | |
| 2 | Đồng ý | 19/11 | Người duyệt nói "0–2 xong rồi, làm tiếp 3, 4, 5". Các ca K6, K8–K8d chưa được xác nhận riêng |
| 3 | | | Đã làm 19/11, chờ duyệt |
| 4 | | | Đã làm 19/11, chờ duyệt |
| 5 | | | Đã làm 19/11, chờ duyệt; chưa bấm thử trên trình duyệt |
| 6 | | | Đã làm 19/11, chờ duyệt; chưa bấm thử trên trình duyệt |
| 7 | | | Chặn: chưa có `build-vertical.cjs` |
| 8 | | | Đã làm 19/11 (PDF + Excel), chờ duyệt; chưa làm T24 |
| 9 | | | Sprint mở 20/11; T27, T28, T30 xong; T29 chờ bấm thử trên trình duyệt; T31 chờ chọn chương trình cho tài khoản thử |
| 11 | | | Sprint mở 22/11 (T38–T50, xem mục 6). Người duyệt bấm web 22–23/11 và góp ý, đã sửa; phần lớn giao diện đã được giai đoạn 12 thay |
| 10 | | | Sprint mở 20/11. T32 xong 21/11 (code + test + API thật, chưa bấm web); T34 một phần; T33, T35, T36 chưa làm. "Hộp xác nhận mọi lần" đã duyệt 21/11. Chờ người duyệt chốt tên nút, việc bỏ thẻ kế hoạch cũ |
| 12 | | | Mở 23/11: đặc tả mục 12 + mẫu tương tác + kế hoạch T51–T66 (12.12). W10, W11, W13 chốt 23/11; W12 tạm theo gợi ý. **T51–T65 code xong 23/11 (tối), test tự động qua; chưa bấm thử web (T66, 05 mục G)** |
| Ngoài kế hoạch (28/11) | | | Gỡ AI tư vấn + Elasticsearch; gỡ tab "Chương trình" + trang Phân tích (nhật ký mục 9). Code + test tự động xong, chưa bấm thử web |

---

## 11. Gợi ý học phần: phân tích lại (bản nháp 22/11, chờ người duyệt sửa và chốt)

> **24/11:** Q1, Q2, Q13 đã chốt (cột "Bạn chọn"); Q5, Q6, Q7, Q9, Q12, Q14, Q15 đã làm theo hướng gợi ý trong sprint 11 (xem nhật ký mục 9). Bảng nút bấm 11.6 là giao diện **trước** giai đoạn 12; giao diện hiện hành ở mục 12 và [06](06-tong-ket.md).

> Cách dùng mục này: sửa thẳng vào file. Ở bảng quyết định 11.7, ghi lựa chọn vào cột **"Bạn chọn"** (ví dụ `3`, hoặc `khác: ...`). Muốn bình luận thì thêm một dòng bắt đầu bằng `> Góp ý:` ngay dưới chỗ đó. Bản xem đẹp (chỉ đọc): https://claude.ai/artifact/6AQedEe5hhwWSoL9kfTURb. **File này là bản gốc**; hai bản lệch nhau thì tin file này.

### 11.1 Câu hỏi cốt lõi

Sinh viên mở trang Gợi ý để hỏi: *"Với những gì mình đã học, mình còn phải học gì, xếp vào kỳ nào để tốt nghiệp đúng hạn hoặc sớm nhất? Nếu kỳ này rớt hay một môn không mở thì kế hoạch đổi ra sao?"* Giá trị khác biệt của trang là **what-if nhiều học kỳ**. Còn kiểm tra tiên quyết cho một kỳ thì trang đăng ký môn của trường đã làm.

Ba vấn đề lớn nhất hiện nay:
- **Đầu vào chưa chắc:**
  - PDF myBK không phân biệt "rớt" với "chưa học", và không có "đang học" (chỉ có khi sinh viên khai ở Hiệu chỉnh).
  - Điều kiện tốt nghiệp nằm ở hai chỗ: Hiệu chỉnh và trang Quy định của Thiên (đã ẩn 22/11).
- **Luật chưa chốt lại:**
  - Tín chỉ mỗi kỳ có 4 con số: 11–25 (của ta), 14–21 (QĐ 285), 11–24 (database), 14–21 (engine ASP).
  - Năm học đang tính theo khóa, trong khi QĐ Đ24 tính theo tín chỉ tích lũy.
  - 45/132 chương trình không nhận ra đồ án chuyên ngành.
- **Kết quả khó tin:**
  - Bộ giải tự chọn môn tự chọn thay sinh viên.
  - Hai bộ giải theo luật khác nhau (3 xfail).
  - Mốc what-if chỉ nằm trên trình duyệt.
  - Chưa ai bấm thử bằng tài khoản thật.

### 11.2 Workflow 7 bước (xong bước trước mới qua bước sau)

| # | Bước | Làm gì | Xong khi |
|---|---|---|---|
| 1 | Chốt câu hỏi sản phẩm | Q1–Q2 | Có 1 câu mô tả và phác giao diện kết quả được duyệt |
| 2 | Kiểm kê, chuẩn hóa dữ liệu | Mỗi nguồn ở 11.3: giữ, bỏ hay suy ra; ai được sửa; lệch thì tin nguồn nào. Q3, Q4, Q9–Q12, Q16 | Có bảng "trường → nguồn → cách dùng" và phép kiểm trong `check_baseline.py` |
| 3 | Chốt bộ luật | Luật cứng/mềm cuối cùng, mỗi luật có điều QĐ 285 hoặc ghi "nhóm tự quyết". Q5–Q8 | Mục 3 của file này viết lại và được duyệt |
| 4 | Thuật toán | Chọn bộ giải cho sinh viên (Q13), sửa theo bộ luật mới, ca kiểm có đáp án xếp tay | pytest qua, không còn xfail do lệch luật ở bộ giải được chọn |
| 5 | Giao diện, nút bấm | Bỏ nút trùng, đổi tên cho rõ (Q12, Q15) | Mỗi nút ở 11.6 có ý nghĩa một câu; typecheck, lint qua |
| 6 | Kiểm bằng dữ liệu thật | Tài khoản thử A, B: giải + 3 what-if, so với cách tự xếp tay | Người duyệt xác nhận (T24) |
| 7 | What-if và mốc | Q14 | Lưu mốc → đổi kịch bản → về mốc chạy đúng trên web |

### 11.3 Dữ liệu thô và ta làm gì với nó

| Nguồn | Có gì | Không có / lệch | Ta đang làm gì | Câu cần chốt |
|---|---|---|---|---|
| PDF / chữ dán myBK (`student_progress_imports.data`) | Mã CTĐT, khối, môn của khối (kể cả chưa học), ✓ đạt, điểm, TC tích lũy, điều kiện tốt nghiệp | Không có "đang học"; "--" vừa là chưa học vừa là rớt; không có kỳ đã học | Ghi trạng thái đúng theo file vào `student_courses` mỗi lần nhập | Q3, Q4 |
| Hiệu chỉnh (`student_courses`, `data.web`) | 4 trạng thái, học kỳ hiện tại, ghi chú | Trạng thái bị ghi đè khi nhập lại file (học kỳ, ghi chú giữ) | Đầu vào duy nhất của bộ giải về trạng thái môn | Q2 |
| `curricula` (132) | `source_code`, tổng TC, mức TC/kỳ 11–24 | Mức TC/kỳ khác QĐ (14–21) | Tìm chương trình theo mã myBK; bộ giải **không** dùng mức TC của database | Q5 |
| `curriculum_courses` | Môn, kỳ khuyến nghị | KHMT 2023 chỉ 37/96 môn có kỳ khuyến nghị | Mềm S6 | Q10 |
| `course_groups` | Bắt buộc/tự chọn, TC hoặc số môn cần, khối con chuyên ngành; mới từ main: kỳ khuyến nghị của khối | Tự chọn tự do không liệt kê môn | H3, H13, H15 | Q7, Q8 |
| `course_categories` | "Tốt nghiệp" / "Học phần tốt nghiệp" / "Tốt nghiệp bậc cử nhân", "Điều kiện tốt nghiệp" | Tên đồ án không thống nhất ("Đồ án 2", "Đồ án ngành 1"…) | Nhận môn cho ngưỡng 65/70/85% (T37, 22/11) | Q11 |
| `course_relations` | TQ, HT, SH, KN theo chương trình (KHMT 2023: 37) | Chưa biết lấy từ đề cương hay CTĐT; HT đã bỏ | H4, H5; không dùng quan hệ suy ra | Q16 |
| `course_opened_semesters` | Kỳ môn **đã từng** mở (KHMT 2023: 201–261, có hè) | Không phải kế hoạch mở lớp | Hè chỉ xếp môn từng mở hè; ASP dùng thêm | Q9 |
| `curriculum_regulations` + `student_regulation_statuses` | GDQP, GDTC, tiếng Anh, hoạt động SV; sinh viên tự bật | Trùng điều kiện tốt nghiệp của ta; trang đã ẩn 22/11 | Bộ giải chưa đọc | Q12 |
| `student_profiles` | Chương trình, năm vào trường, chuyên ngành mục tiêu | Chuyên ngành ít ai điền | Năm học theo khóa (H11), H15 | Q6, Q8 |
| QĐ 285 | TQ/SH, TC/kỳ, cấp độ, ngưỡng tốt nghiệp, 12 kỳ chính | Rải rác; PL1 lệch Đ15.4 | Tóm ở `04-luat-qd285.md` | Q5, Q6 |
| Học phí, GPA (`policy.lp`, điểm PDF) | Engine ASP tính | CP-SAT bỏ qua | Chỉ ở báo cáo ASP | ngoài phạm vi? |

### 11.4 Luồng khi bấm "Giải lộ trình"

1. Trang gom kịch bản, gọi `POST /api/plans/solve`.
2. Backend `loadSource` đọc database của tài khoản.
3. `buildPlannerInput` ghép JSON cho bộ giải (không có tên, MSSV).
4. `python -m planner.cli` kiểm tra đầu vào và chuẩn hóa.
5. Chạy bộ giải CP-SAT hoặc Clingo.
6. `validate_plan` kiểm lại kết quả một cách độc lập.
7. Có lộ trình thì trả từng kỳ, lý do, mong muốn đáp ứng hay không. Không có thì `_explain_unsat` bỏ thử từng lựa chọn của sinh viên, rồi nới từng luật, để chỉ ra cái đang chặn.
8. Trang hiện kết quả và so với mốc.

Chi tiết: 03 mục 3, Phụ lục C.

### 11.5 Thuật toán và kết quả (hiện trạng)

- **Bài toán:** biến 0/1 "môn c xếp vào kỳ k" cho mỗi môn chưa đạt, mỗi kỳ còn lại. Thỏa mọi luật cứng; trong các cách thỏa, chọn tốt nhất theo thứ tự mong muốn mềm.
- **Cứng:**
  - H1 mỗi môn ≤ 1 kỳ · H2 đủ bắt buộc · H3 đủ TC khối tự chọn
  - H4 TQ đạt kỳ trước · H5 SH đạt trước hoặc cùng kỳ
  - H7 11–25 TC/kỳ chính · H8 môn không mở · H9 khóa môn · H10 xong trước kỳ X
  - H11 cấp độ theo năm · H12 ngưỡng 65/70/85% · H13 tự chọn tự do · H14 ≤ 12 kỳ chính, hè chỉ khi bật · H15 chuyên ngành
- **Mềm (ưu tiên giảm dần):** S1 xong sớm → S6 giữ khuyến nghị → S4 môn muốn học → S9 hè ưu tiên cấp 1–2 → S7 hè 6–9 TC → S2 không học thừa → S11 kỳ chính đủ 11 TC → S8 kỳ chính 15–18 TC → S5 đều tải → S3 ít đổi so với mốc → S10 ít học hè.
- **Bộ giải:**
  - CP-SAT: mặc định, gộp mong muốn thành tổng có trọng số; KHMT 2023 dưới 1 giây, OPTIMAL.
  - Engine ASP: luật trong `policy.lp`, có GPA, học phí, kỳ nghỉ; lệch luật đã duyệt ở 3 chỗ.
  - Validator độc lập kiểm lại kết quả của cả hai.
- **Trả về:** trạng thái (OPTIMAL / SAT_NOT_PROVEN_OPTIMAL / UNSAT / TIMEOUT), kỳ học xong, TC còn lại, môn từng kỳ kèm lý do, mong muốn không đáp ứng, cảnh báo, giả định. UNSAT thì chỉ ra cái chặn.

### 11.6 Từng nút bấm trên trang Gợi ý

| Nút / ô | Sinh viên hiểu là | Hệ thống làm gì | Vấn đề | Gợi ý |
|---|---|---|---|---|
| Đậu / Rớt từng môn đang học | "Nếu rớt môn X thì sao?" | `in_progress_results`; rớt thì xếp lại sau | Chỉ hiện khi đã khai Đang học ở Hiệu chỉnh | Giữ: what-if quan trọng nhất |
| Tối đa TC mỗi kỳ | "Mình muốn học nhẹ" | Hạ trần H7 (11–25) | Mặc định 25 cao hơn QĐ (21) | Q5 |
| Học xong trước kỳ | "Ra trường trước kỳ X" | H10; không kịp thì UNSAT kèm lý do | — | Giữ |
| Bật kỳ hè | "Chịu học hè" | `summer_opt_in`; hè ≤ 12 TC, không đồ án, chỉ môn từng mở hè | Thực tập luôn xếp hè được kể cả khi không bật | Giữ, nói rõ trên nút |
| Khóa môn vào kỳ | "Chắc chắn học kỳ Y" | H9 | — | Giữ |
| Môn không mở ở kỳ | "Kỳ Y không mở môn này" | H8 | Sinh viên khó biết trước | Q9 |
| Môn muốn học | "Thích môn tự chọn này" | S4 | Không chọn thì bộ giải tự chọn | Q7 |
| Các kỳ đều tải | "Đừng dồn một kỳ" | S5 | — | Giữ |
| Ưu tiên giữ khuyến nghị | "Học đúng kế hoạch khoa" | S6 lên trên S1 | Chỉ 37/96 môn có kỳ khuyến nghị | Q10 |
| Chuẩn tiếng Anh, MOS | "Có chứng chỉ chưa" | `student_flags`; không khai thì giả định đạt | Trùng ENG_GC_600 ở Hiệu chỉnh | Bỏ, lấy từ Hiệu chỉnh (Q12) |
| Chọn bộ giải | Sinh viên không hiểu khác gì | `solver` | Hai bộ giải khác luật | Ẩn (Q13) |
| Kỳ muốn nghỉ (chỉ Clingo) | "Bảo lưu kỳ Y" | `skip_semesters` | CP-SAT không hỗ trợ | Q13 |
| Giải lộ trình | "Xếp cho mình" | Cả luồng 11.4 | — | Giữ |
| Lưu làm mốc / Về mốc / Lấy làm mốc mới / Xóa mốc | "Giữ kế hoạch này để so" | localStorage; mỗi lần giải gửi mốc (S3), so ở trình duyệt | Đổi máy mất mốc | Q14 |

### 11.7 Mười sáu quyết định (ghi vào cột "Bạn chọn")

**Chặn** = phải chốt trước khi code bước tương ứng.

| Mã | Câu hỏi | Vì sao hỏi | Lựa chọn | Gợi ý của AI | Bạn chọn |
|---|---|---|---|---|---|
| Q1 **chặn** | Trang trả lời câu hỏi gì? | Quyết định mọi thứ phía sau | 1) Lộ trình mọi kỳ tới tốt nghiệp + what-if · 2) Chỉ kỳ tới · 3) Kỳ tới nổi bật, các kỳ sau thu gọn | **3**: sinh viên hành động ở kỳ tới, nhưng chỉ lộ trình đủ mới cho biết có kịp tốt nghiệp | **Chốt 22/11:** bộ giải luôn tính toàn bộ lộ trình tới tốt nghiệp; 1 và 3 chỉ khác cách hiện ở frontend, quyết ở Q15. Kỳ tới phải đáng tin hơn (xem Q9) |
| Q2 **chặn** | Trạng thái môn đưa vào bộ giải lấy từ đâu? | 3 chỗ cùng ghi `student_courses`: nhập PDF, Hiệu chỉnh, bảng thẻ của Thiên | 1) Chỉ PDF + Hiệu chỉnh, khóa Lưu ở bảng thẻ · 2) Cả ba, lần ghi sau thắng | **1**: một nguồn thì giải thích được kết quả | **Chốt 22/11: 1.** Bộ giải chỉ lấy từ nhập PDF + Hiệu chỉnh. Bảng thẻ của Thiên (tab Chương trình) vẫn ghi được `student_courses`: **chưa xử lý**, người duyệt sẽ trao đổi với Thiên sau. **28/11: đã gỡ tab Chương trình**, chỉ còn nhập PDF + Hiệu chỉnh ghi `student_courses` |
| Q3 | "--" trong PDF là chưa học hay rớt? | PDF không phân biệt; rớt tự chọn được chọn môn khác (Đ3) | 1) Mặc định Chưa học, sinh viên tự đổi Rớt · 2) Suy từ điểm | **1**: bộ giải xử lý hai trạng thái như nhau | |
| Q4 | Môn đang học mặc định ra sao? | — | 1) Giả định đậu (Đ15.1) · 2) Bắt chọn đậu/rớt từng môn | **1**, giữ ô đậu/rớt làm what-if | |
| Q5 **chặn** | Mức TC mỗi kỳ chính? | Đã chốt 11–25 (18/11) nhưng QĐ Đ15.3 ghi 14–21; ASP dùng 14–21; nguyên nhân chính của xfail | 1) Giữ 11–25 · 2) Mặc định 14–21, sinh viên hạ tới 11 / nâng tới 25 kèm cảnh báo | **2**: mặc định đúng quy định, ngoại lệ là lựa chọn có ý thức | |
| Q6 | "Năm thứ mấy" (mở môn cấp 3, 4) tính thế nào? | Đang theo khóa; Đ24 theo TC tích lũy (28/56/84), PDF đã có số TC | 1) Theo khóa · 2) Theo TC tích lũy, cộng dần qua từng kỳ | **2**; còn PL1 lệch Đ15.4 thì hỏi Phó Khoa | |
| Q7 **chặn** | Bộ giải có tự chọn môn tự chọn thay sinh viên? | Sinh viên thấy môn mình không định học | 1) Giữ · 2) Xếp "ô tự chọn X TC khối Y"; hiện tên môn khi sinh viên đã chọn | **2**, kèm cảnh báo môn chọn cho ô phải thỏa tiên quyết | |
| Q8 | Chuyên ngành hỏi ở đâu? | Có `specialization_required` (main); KHMT 2023 có 5 chuyên ngành | 1) Lấy từ hồ sơ, thiếu thì bộ giải chọn dễ nhất · 2) Trang Gợi ý hỏi trước khi giải nếu bắt buộc | **2** | |
| Q9 | Môn có mở kỳ tới không? | Chỉ có lịch sử "đã từng mở" | 1) Giả định mở, sinh viên tự khai · 2) Chưa từng mở loại kỳ đó thì cấm · 3) Như 1 + cảnh báo "3 năm chưa mở kỳ 2" | **3** | |
| Q10 | Kỳ khuyến nghị khi môn không có? | 37/96 môn có | 1) Chỉ của môn · 2) Thiếu thì lấy của khối (main) | **2** | |
| Q11 | 45 chương trình: "Đồ án 1/2/ngành" có là đồ án chuyên ngành (70%)? | Không nhận thì ngưỡng 70% không áp; KHMT 2023 không ảnh hưởng | 1) Nhận theo quy tắc tên · 2) Để nguyên, hỏi trường | **2** cho tới khi có người dùng ngoài KHMT | |
| Q12 | Điều kiện tốt nghiệp xử lý ra sao? | Có ở 3 chỗ | 1) Một nguồn là Hiệu chỉnh; Gợi ý chỉ hiện "còn thiếu" · 2) Giữ ô khai riêng ở Gợi ý | **1**, bỏ ô Chuẩn tiếng Anh/MOS; MOS ghi thành giả định | |
| Q13 **chặn** | Sinh viên dùng bộ giải nào? | Hai bộ giải khác luật | 1) Giữ cả hai trên giao diện · 2) CP-SAT cho SV, ASP chạy ngầm đối chiếu · 3) ASP cho SV | **2**, đưa "kỳ muốn nghỉ" vào CP-SAT; bàn với đồng đội viết ASP | |
| Q14 | Mốc what-if lưu ở đâu? | Đổi máy mất mốc | 1) Trình duyệt · 2) `data.web.baseline` (không migration) | **2** | |
| Q15 | Kết quả hiện gì, thứ tự nào? | — | — | (1) "Tốt nghiệp sớm nhất kỳ X, còn Y TC" (2) Kỳ tới: môn nên đăng ký + lý do (3) Các kỳ sau thu gọn (4) Điều kiện còn thiếu, cảnh báo (5) Mong muốn chưa đáp ứng (6) So với mốc | |
| Q16 | Quan hệ TQ/SH có đáng tin? | KHMT 2023: 37 trên database vs 32 PDF CTĐT; chung 31, mất 1 (HT PE1005 sau PE1003), thêm 6 (2 SH, 1 HT, 3 KN) | 1) Tin database · 2) Kiểm 7 chỗ khác với đề cương trước | **2** cho KHMT 2023; chương trình khác ghi "chưa kiểm" | |

### 11.8 Việc cụ thể sau khi chốt (đề xuất, chưa giao)

| Mã | Việc | Phụ thuộc | Xong khi |
|---|---|---|---|
| T38 | Viết lại mục 3 (bộ luật) theo Q5–Q11 | Q1, Q5–Q11 | Người duyệt duyệt |
| T39 | Kiểm 7 quan hệ khác nhau của KHMT 2023 với đề cương | Q16 | Ghi vào 01 |
| T40 | Sửa CP-SAT: TC/kỳ (Q5), năm theo TC (Q6), ô tự chọn (Q7), kỳ nghỉ (Q13) | T38 | pytest qua, có ca đáp án xếp tay |
| T41 | Backend: chuyên ngành, kỳ khuyến nghị khối, điều kiện từ Hiệu chỉnh | Q8, Q10, Q12 | jest qua |
| T42 | Trang Gợi ý: bỏ ô trùng, ẩn chọn bộ giải, bố cục theo Q15 | T40, T41 | typecheck, lint qua |
| T43 | Mốc what-if lưu ở `data.web.baseline` | Q14 | Đổi trình duyệt vẫn thấy mốc |
| T24 | Tài khoản thử A, B với 3 what-if; so với tự xếp tay | T42 | Người duyệt xác nhận |

## 12. Đặc tả what-if (bản nháp 23/11 theo danh sách nhóm chốt, chờ duyệt)

> Cách dùng: sửa thẳng vào file. Muốn góp ý thì thêm dòng `> Góp ý:` ngay dưới chỗ đó. Cột "Hiện có" ghi **theo code đọc ngày 23/11**, chưa bấm thử trên web. Câu cần chốt đánh mã W1–W9 để khỏi trùng với các mã Q.

### 12.1 Mục tiêu (một câu)

Sinh viên chỉnh thoải mái mọi thứ chỉnh được, ngay trên lộ trình. Bộ giải kiểm lại và trả về: **giải được không, vi phạm quy định nào, cảnh báo gì; không giải được thì vì sao**. Sinh viên lưu được nhiều lộ trình và so sánh chúng.

### 12.2 Sinh viên chỉnh được gì

| # | Chỉnh | Cứng / mềm | Gửi bộ giải bằng | Hiện có | Còn thiếu |
|---|---|---|---|---|---|
| E1 | Môn đang học, đậu/rớt môn đang học, khối của môn | Cứng | Hiệu chỉnh → `student_courses`; `in_progress_results`; `data.web.block_choices` | Có | — |
| E2 | Ghim môn vào kỳ, kể cả môn học lại (đã đạt, học cải thiện) | Cứng, tuyệt đối | `locked`, `pins_absolute`; học lại qua `retakes` (`solve_cpsat.py:164-183`) | Có | Báo rõ khi ghim làm vỡ luật khác |
| E3 | Số TC muốn học từng kỳ | Ưu tiên cao nhất ("ST"), lệch ±2 | `semester_targets` | Có. Ô này thắng luật 11–25 và trần hè 12 (sửa 23/11) | Cảnh báo nhỏ khi vượt luật; lời nhắn nêu lý do thật khi không đạt |
| E4 | Có học hè không, học hè nào | Cứng | `summer_opt_in` (danh sách kỳ) | Có | — |
| E5 | Nghỉ kỳ chính nào | Cứng | `skip_semesters` (`solve_cpsat.py:171`) | Có | Kiểm giới hạn 12 kỳ chính khi có kỳ nghỉ, nghỉ 2 kì chính liên tiếp hoặc nhìu hơn cảnh báo xin phép phòng đào tạo | 
| E6 | Giả định đậu/rớt | Cứng | `in_progress_results` | Có, cho môn đang học | **W1** |
| E7 | Môn có mở / không mở ở kỳ | Không mở: cứng. Lịch sử mở lớp: mềm "OH" | `not_offered` | Có "không mở" | "Có mở" để gỡ cảnh báo lịch sử: **W2** |
| E8 | Thứ tự ưu tiên | Mềm, xếp hạng | `preferences.order` | Có, nhưng chỉ cho S1, S6, S4, S5, S10, OH, S3 | Xem 12.3 |
| E9 | Budget (trần học phí), **làm sau** | **W3** | Chưa có | Chưa | Cần làm học phí trước (12.3) |
| E10 | Khối: giữ như hiện tại, chọn môn trong khối bằng ô xổ xuống | Cứng | `block_choices`, ô "Chọn môn trong khối" | Có, cho ô còn trống | Ô đã có tên môn: nút "Đổi môn khác cùng khối" |

### 12.3 Thứ tự ưu tiên (E8): sinh viên sắp thứ tự và bật/tắt từng mục

| Mục nhóm chốt | Mã bộ giải | Hiện trạng | Việc |
|---|---|---|---|
| Thời gian ra trường (min) | S1 | Sinh viên kéo được | — |
| Học thừa khối tự chọn (min) | S2 | Mục cố định bên trong | Chuyển sang `USER_PRIORITIES` |
| Số TC trong mức 15–18 | S8 | Mục cố định bên trong | Chuyển sang `USER_PRIORITIES` |
| Học phí tổng (min), **bàn sau** | Chưa có | Chỉ engine ASP tính | Thêm mục mới; dùng lại `fees.py` của mybk-planner (chưa kiểm độ đúng) |
| Interest, **bàn sau** | S4 (môn muốn học); tag Clingo | CP-SAT chỉ có "môn muốn học" | **W4** |

Các mục không có trong danh sách nhóm (S6, S5, S10, OH, S3, S9, S7, S11): **W5**.
> Góp ý người duyệt (23/11): các mục trên là what-if sinh viên tùy chọn; bộ giải ở backend có thể có nhiều mục hơn, chạy nền, không hiện trên giao diện. Lúc code thì hỏi lại.

### 12.4 Kiểm lộ trình của sinh viên (validate)

Sinh viên tạo lộ trình theo hai cách:
- bấm **Giải** để bộ giải đề xuất;
- **chỉnh trên lộ trình đã có**: kéo môn sang kỳ khác, đổi môn trong khối, thêm môn vào ô tự chọn tự do.

Mỗi lần chỉnh, bộ giải trả về bốn thứ:
1. **Giải được không.**
2. **Vi phạm quy định:** luật cứng bị vỡ, kèm điều QĐ 285 (ví dụ "Đ15.3: kỳ chính tối đa 25 TC").
3. **Cảnh báo:** mong muốn mềm không đạt (ví dụ "kỳ 271 chỉ 12 TC", "3 năm chưa mở hè").
4. **Nếu không giải được thì vì sao:** chỉ ra lựa chọn nào của sinh viên, hoặc luật nào, đang chặn. `_explain_unsat` đang làm phần này.

Hiện có:
- `validate_plan` (`validate.py:21`): kiểm độc lập kết quả của bộ giải.
- `_explain_unsat` (`cli.py`).

Không làm chế độ "chỉ kiểm" riêng (chốt W6, 23/11): môn sinh viên chuyển thành ghim, bấm Giải thì bộ giải kiểm và xếp lại phần còn lại.
> Góp ý người duyệt (23/11, đã làm): phải bấm nút Giải mới gọi bộ giải, không gọi tự động nữa.

### 12.5 Chỉnh trên lộ trình đề xuất

- Bấm một môn thì các kỳ đổi màu: hồng là chuyển vào được; xám là không được, kèm lý do ngắn (như Mẫu 2).
- Chuyển môn nghĩa là ghim môn vào kỳ mới. Sau đó bộ giải xếp lại phần còn lại, hoặc chỉ kiểm (tùy W6).
- Môn tự chọn đã có tên: ô xổ xuống để đổi sang môn khác cùng khối.
- Môn bắt buộc: chỉ đổi kỳ.
- Ô tự chọn tự do: gõ mã môn bất kỳ.
- Có nút **Hoàn tác**.

### 12.6 Lưu lịch sử lộ trình

- Sau mỗi lần giải hoặc chỉnh, sinh viên bấm **Lưu** được, kèm tên ngắn (ví dụ "Không học hè").
- Lưu ở `data.web.plans` trong `student_progress_imports` hoặc `student_profiles`, không cần migration (giống Q14). Giữ bao nhiêu bản: **W7**.
- Bỏ "mốc" hiện tại (localStorage). Mốc thành một bản lưu được đánh dấu.
> Góp ý người duyệt (23/11, đã làm): giữ trạng thái trang khi đăng xuất; lưu bản thì lưu cả lộ trình và mọi giả định what-if vào lịch sử.

### 12.7 So sánh (bộ chỉ số sửa 23/11 theo góp ý người duyệt, đã thử trên mẫu)

So hai bản đã lưu với nhau, hoặc một bản với **kế hoạch giảng dạy** (kỳ khuyến nghị trong `curriculum_courses`; KHMT 2023 mới có cho 37/96 môn). So sánh do trang tự tính, không gọi bộ giải.

| Chỉ số | Cách tính | Tốt hơn khi |
|---|---|---|
| Ra trường | Kỳ cuối cùng có môn | Sớm hơn |
| Kỳ chính ngoài 15–18 TC | Số kỳ chính (trừ kỳ cuối) có TC < 15 hoặc > 18 | Ít hơn |
| Kỳ chính nặng nhất | TC lớn nhất trong các kỳ chính | Nhẹ hơn |
| Học hè | Tổng TC các kỳ hè | Không so (tùy sinh viên) |
| Môn bắt buộc trễ hơn kế hoạch khoa | Số môn bắt buộc xếp sau kỳ khuyến nghị | Ít hơn |
| Cảnh báo | Số cảnh báo của lần giải | Ít hơn |

Dưới bảng chỉ số có hai phần:
- **Giả định khác nhau:** hè, nghỉ kỳ, ô TC, ghim, đậu/rớt, giả định rớt, không mở, ưu tiên, môn tự chọn, ô tự do. Dòng khác nhau tô hồng.
- **Môn đổi kỳ:** mã, tên môn, kỳ ở bản A → kỳ ở bản B.

Đã bỏ (23/11): "TC trung bình" (W8), bảng "Chỉ có ở…", dòng "Môn không được rớt" trong bảng so sánh.

### 12.8 System flow

1. Sinh viên bấm **Giải**. Trang gom kịch bản (12.2; môn đã chuyển là ghim) rồi gọi `POST /api/plans/solve`. Không có trường `mode` (W6).
2. Backend chạy `loadSource`, rồi `buildPlannerInput` (không có tên, MSSV), rồi `python -m planner.cli`.
3. CP-SAT xếp lộ trình quanh các ghim.
4. `validate_plan` kiểm lại. Không giải được thì chạy `_explain_unsat`.
5. Trả về: lộ trình, vi phạm (kèm điều QĐ), cảnh báo, lý do không giải được, các chỉ số ở 12.7.
6. Trang hiện chỉ số kèm nhãn thay đổi so với bản trước (KpiStrip, có từ 23/11). Sinh viên lưu bản vào `data.web.planner.plans` (T58).
7. So sánh do trang tự tính từ hai bản đã lưu, không gọi bộ giải.

### 12.9 UI/UX (khung, nhóm sửa sau)

> Chốt 23/11: **giao diện làm sau.** Trước mắt code chức năng bằng giao diện hiện có (Ant Design, style hiện tại); nhóm thiết kế song song trên mẫu tương tác (thư mục `BKUni-mau-what-if` trên Desktop của người duyệt, không đưa vào repo). Thiết kế áp lên sau, khi chức năng đã chốt.
>
> Mẫu chốt 23/11: nền trắng; học kỳ xếp dọc trên một đường thời gian, môn xếp ngang trong hàng; mỗi môn là chấm khuyết hồng + mã bên phải, tên bên dưới, rê chuột xem TC/khối/ghim; khối Kịch bản bên phải thu gọn được; Giải, Hoàn tác, Lưu nằm dưới lộ trình; tab Lộ trình / So sánh dưới tiêu đề.

- **Trên cùng:** dải chỉ số có nhãn tốt hơn/tệ hơn: Ra trường, Kỳ chính nặng nhất, Học hè; sau thêm Học phí, GPA dự kiến.
- **Giữa:** bảng các kỳ, thẻ môn bấm được (12.5). Kỳ có vi phạm thì viền cam, kèm một dòng lý do.
- **Bên:** ô kịch bản gọn: hè, nghỉ kỳ, thứ tự ưu tiên kéo thả, budget.
- **Dưới hoặc tab riêng:** lịch sử bản lưu, chọn hai bản để so.
- Nguyên tắc: ít chữ, mỗi lý do một dòng, nền trắng, hồng nhạt làm điểm nhấn.
- Các trạng thái cần vẽ: đang giải; giải được; giải được nhưng có cảnh báo; không giải được (kèm vì sao).

### 12.10 Câu cần chốt

| Mã | Câu hỏi | Gợi ý của AI | Nhóm chọn |
|---|---|---|---|
| W1 | "Giả định đậu/rớt" chỉ áp cho môn đang học, hay cả môn trong lộ trình tương lai (ví dụ "nếu kỳ 271 rớt CO3029")? | Cả hai. Môn tương lai rớt thì bộ giải xếp học lại | cả 2 |
| W2 | Có cần nút "kỳ này có mở" để gỡ cảnh báo lịch sử mở lớp không? | Có, nút này chỉ gỡ cảnh báo  | có |
| W3 | Budget là trần cứng (vượt thì không giải) hay mềm? | Mềm, kèm cảnh báo | để sau, chưa xét |
| W4 | Interest lấy từ "môn muốn học" hay từ tag sở thích (Clingo)? | Lấy từ tag, rồi quy ra môn muốn học | để sau, chưa xét |
| W5 | Các mục ưu tiên ngoài danh sách nhóm: ẩn hay giữ? | Giữ bên trong bộ giải, không hiện cho sinh viên | chỉ những mục nhóm kể ra mới lên UI, còn lại giữ trong |
| W6 | Khi chỉnh trên lộ trình: tự xếp lại phần còn lại, hay chỉ kiểm? | Mặc định chỉ kiểm, có nút "Xếp lại phần còn lại" | coi như cho bấm lại Giải |
| W7 | Giữ bao nhiêu bản lưu? | 10 | 10 |
| W8 | TC trung bình có tính kỳ hè không? | Không, hè hiện riêng | bỏ: chưa có chỉ số TC trung bình |
| W9 | GPA dự kiến (nhập điểm mong muốn từng môn) có vào danh sách này không? | Có, đặt cạnh Học phí | để sau |

**Đã chốt 23/11** (theo ghi chú người duyệt ở bảng trên):
- W1: cả môn đang học lẫn môn trong lộ trình tương lai.
- W2: có nút "Kỳ này có mở", chỉ gỡ cảnh báo lịch sử.
- W3, W4, W9 (budget, sở thích, GPA dự kiến): **để sau**, chưa xét.
- W5: giao diện chỉ hiện các mục nhóm kể ra (ra trường sớm, không học dư tự chọn, 15–18 TC; học phí và sở thích để sau). Mục khác giữ bên trong bộ giải; **lúc code hỏi lại người duyệt**.
- W6: sửa trên lộ trình rồi bấm lại **Giải** (bộ giải xếp lại phần còn lại, môn đã chuyển là ghim). **Chỉ bấm Giải mới gọi bộ giải**, không tự giải.
- W7: giữ 10 bản.
- W8: bỏ chỉ số TC trung bình (hiện chưa có).
- Nghỉ từ 2 kỳ chính liên tiếp: cảnh báo cần xin phép Phòng Đào tạo (góp ý ở E5).
- Lưu bản thì lưu cả lộ trình và mọi giả định what-if; giữ trạng thái trang khi đăng xuất (góp ý ở 12.6).

**Còn hỏi (trả lời trước khi làm việc tương ứng ở 12.12):**

| Mã | Câu hỏi | Gợi ý của AI | Nhóm chọn |
|---|---|---|---|
| W10 | Hiện trang **tự giải lại** 0,5 giây sau mỗi lần đổi và khi mở trang (`index.tsx:186-196`, T46). Theo W6 thì bỏ. Mở trang thì sao? | Mở trang hiện lại bản đang xem lần trước (đã lưu ở `data.web.planner`), kèm dòng "Dữ liệu ở Hiệu chỉnh đã đổi, bấm Giải để cập nhật" nếu có đổi | **Chốt 23/11:** chỉ bấm Giải mới giải, kể cả lúc mở trang |
| W11 | Ô chỉ số "Môn không được rớt" (rớt là trễ ra trường) trên trang Lộ trình: làm không, tính thế nào? | Làm, tính theo **đường găng** (môn nằm trên chuỗi tiên quyết dài nhất, không còn kỳ dư) trong bộ giải: nhanh. Giải lại từng môn thì đúng hơn nhưng chậm (~20 lần giải) | **Chốt 23/11: bỏ** |
| W12 | Thứ tự mặc định của 3 mục ưu tiên hiện ra? | Ra trường sớm > 15–18 TC > Không học dư tự chọn, cả 3 bật | |
| W13 | Bảng "Khóa kỳ" (`frozen_semesters`) đang có trên trang nhưng không có trong 12.2: giữ hay ẩn? | Ẩn khỏi giao diện, giữ trong bộ giải | **Chốt 23/11: bỏ khỏi giao diện.** Muốn khóa kỳ thì ghim môn và đặt ô TC |

### 12.11 Checklist

Checklist chi tiết theo từng việc ở **12.12**. Đã xong trước khi lập kế hoạch:
- [x] Ô TC từng kỳ thắng luật trần (test `test_semester_target_beats_max_credits`, 23/11)
- [x] Bỏ ô "Tối đa mỗi kỳ" (23/11)
- [x] Dải chỉ số có nhãn thay đổi (KpiStrip, 23/11; **chưa bấm thử**)
- [x] Đặc tả mục 12 và mẫu tương tác (23/11)

### 12.12 Kế hoạch làm (Giai đoạn 12, mã T51–T66)

> **Tiến độ 23/11 (tối):** người duyệt bảo code đủ chức năng một lượt. T51–T65 đã code, test tự động qua: pytest planner 165 + 7 xfail + 1 xpass (thêm `test_whatif12.py`, 16 ca), jest backend 104 qua, typecheck + lint frontend qua, logic trang 28/28 (script tạm). **Chưa bấm thử trên web (T66)**: kịch bản ở [05 mục G](05-kiem-thu.md). Dòng `[~]` là làm một phần hoặc chưa làm, có ghi lý do.

**Cách đi:** làm từ dưới lên: bộ giải → backend → trang Gợi ý (Ant Design, style hiện tại) → bấm thử. Mỗi việc đi đủ 4 bước của CLAUDE.md (Hiểu → Thiết kế → Làm → Kiểm) và dừng chờ duyệt. Xong mỗi việc thì cập nhật đủ ba nơi: mục Duyệt + nhật ký của file này, `01-boi-canh.md`, `pipeline/check_baseline.py`; đổi code hoặc API thì sửa `03-thiet-ke.md`.

**Nguyên tắc (người duyệt chốt 23/11):** code bằng Ant Design và style hiện tại, **không cần giống CSS của mẫu**, nhưng **mọi chức năng của mẫu phải có**. Kiểm theo danh sách dưới đây ở T66:

| # | Chức năng trong mẫu | Việc |
|---|---|---|
| M1 | Nút Giải; chỉ bấm mới giải; dòng "Đã sửa N chỗ, chưa kiểm" | T59 |
| M2 | Hoàn tác | T59 |
| M3 | Môn đang học: Đậu / Rớt | đã có |
| M4 | Ưu tiên 3 mục: bật/tắt, lên/xuống; học phí, sở thích hiện mờ "bàn sau" | T51, T60 |
| M5 | Từng kỳ: nghỉ (kỳ chính), học hè (kỳ hè), ô muốn TC; kỳ tắt thu gọn | đã có, sửa ở T60 |
| M6 | Bấm môn → kỳ được / không được kèm lý do; "Chuyển vào đây" = ghim | T61 |
| M7 | Trên môn: ghim / bỏ ghim, "kỳ này không mở", giả định rớt | đã có (ghim, không mở), T63 |
| M8 | Đổi môn khác cùng khối; gõ mã ở ô tự chọn tự do | T62 |
| M9 | Rê chuột vào môn: TC, loại môn, ghim, đã chuyển, giả định rớt, không mở | T61 |
| M10 | Trạng thái chung: đang giải / giải được / có cảnh báo / không giải được + vì sao | đã có một phần, T56 |
| M11 | Không giải được: nút **cách gỡ** bấm là áp dụng (bỏ ghim, không nghỉ, bật hè…) | T63 |
| M12 | Cảnh báo theo từng kỳ ngay trên kỳ đó; nút "Kỳ này có mở" | T52, T55, T63 |
| M13 | Môn chờ xếp (vừa giả định rớt / đổi môn, chưa giải) | T61 |
| M14 | Dải chỉ số: ra trường, kỳ chính nặng nhất, học hè, nhãn thay đổi so với lần giải trước | đã có (KpiStrip) |
| M15 | Lưu bản kèm tên; lịch sử 10 bản; gắn sao = mốc; Mở; So với đang xem; Xóa | T58, T64 |
| M16 | So sánh 2 bản hoặc với kế hoạch giảng dạy: chỉ số, giả định khác nhau, môn đổi kỳ kèm tên | T65 |
| M17 | Giữ trạng thái trang khi đăng xuất | T58 |
| M18 | Thu gọn / mở khối Kịch bản | T60 |

Bỏ so với mẫu: ô "Môn không được rớt" (W11), nút "Khóa kỳ" (W13).

**Chia phiên (gợi ý):**

| Phiên | Việc | Ghi chú |
|---|---|---|
| 1 | T51, T52, T53 | Chỉ bộ giải; chốt W12 trước T51 |
| 2 | T54, T55, T56 | Bộ giải; trường mới trong kịch bản |
| 3 | T57, T58 | Backend |
| 4 | T59, T60, T61 | Trang Gợi ý: Giải bằng nút, ưu tiên, chọn môn → kỳ sáng/mờ |
| 5 | T62, T63, T64 | Trang Gợi ý: đổi môn, giả định rớt, lịch sử |
| 6 | T65, T66 | So sánh; bấm thử bằng tài khoản thật |

#### A. Bộ giải (`pipeline/planner/`)

**T51. Ưu tiên sinh viên xếp được: thêm S2, S8** (12.3, W5, W12)
- [x] Hiểu: đọc `facts.py` (`USER_PRIORITIES`, `INTERNAL_PRIORITIES`, `preference_order`) và chỗ `solve_cpsat.py` gộp mục tiêu.
- [~] Hỏi người duyệt: thứ tự các mục ẩn (S6, S4, S5, S10, OH, S3, S9, S7, S11) đặt ở đâu so với 3 mục hiện ra. **23/11: chưa hỏi; tạm để 3 mục của sinh viên trước, rồi S6, S4, OH, S3 (W12 chưa chốt).**
- [x] Code: thêm `S2`, `S8` vào `USER_PRIORITIES`; `preferences.order` nhận được hai mã này; mục không có trong `order` giữ chỗ cố định bên trong.
- [x] Test: `order=["S8","S1"]` thì mọi kỳ chính (trừ kỳ cuối) nằm trong 15–18 khi làm được; `order=["S1","S8"]` thì kỳ ra trường không trễ hơn lần giải không có S8; tắt S2 thì cho phép học dư.
- [~] Clingo: ghi cảnh báo "chưa hỗ trợ thứ tự này" nếu khác (không sửa `policy.lp`). **Chưa làm** (sinh viên chỉ dùng CP-SAT).
- Xong khi: pytest qua; người duyệt xem 2 lần giải với 2 thứ tự khác nhau.

**T52. Cảnh báo quy định mới** (E3, E5)
- [x] Nghỉ từ 2 kỳ chính liên tiếp (`skip_semesters`): cảnh báo "Cần làm đơn xin phép Phòng Đào tạo", kèm điều QĐ 285 nếu có (tra `04-luat-qd285.md`; không có thì ghi "nhóm tự quyết").
- [x] Ô TC đầu kỳ (`semester_targets`) vượt 25 (kỳ chính) hoặc 12 (hè): cảnh báo nhỏ, vẫn xếp theo ô.
- [~] Nghỉ làm vượt 12 kỳ chính: không giải được, lý do nêu "nghỉ kỳ X làm vượt 12 kỳ chính". **23/11: một phần**: không giải được thì có cách gỡ "Không nghỉ kỳ X"; chưa có câu riêng "vượt 12 kỳ chính".
- [x] Ghi vào `warning_items` (`report.py`, `cli.py`); `warnings` dạng cũ giữ nguyên.
- [x] Test cho cả 3 ca.

**T53. Lời nhắn nêu lý do thật khi không đạt số TC** (E3)
- [x] Hiểu: `student_requests.py:95-101` đang đoán ("không còn môn đủ điều kiện để thêm" / "không có tổ hợp vừa khít").
- [x] Thiết kế đã bàn 23/11: (1) còn ít TC hơn số muốn → nói thẳng; (2) không thì giải lại với số TC thành cứng; giải được → báo xung đột với lựa chọn nào (ghim, nghỉ, không mở…); (3) không được → nới từng luật (tiên quyết, hè, đồ án…) để chỉ ra luật chặn. Dùng lại cách `_explain_unsat` (`cli.py:60-95`).
- [x] Giới hạn thời gian: chỉ chạy cho kỳ không đạt, tối đa N lần giải; quá thì giữ lời nhắn cũ.
- [x] Test: ca ghim làm kỳ thiếu TC; ca tiên quyết chặn.

**T54. Giả định rớt môn trong lộ trình tương lai** (E6, W1)
- [x] Trường kịch bản mới: `assumed_fail: [{course_code, semester_code}]`: môn học ở kỳ đó nhưng không đạt; phải học lại ở kỳ sau; môn cần nó làm tiên quyết lùi theo.
- [x] `facts.py`: kiểm đầu vào (môn phải chưa đạt, kỳ phải trong kế hoạch). `solve_cpsat.py`: lần học đầu tính TC của kỳ đó, không tính đạt; thêm biến lần học lại. `validate.py`: kiểm lại.
- [~] Clingo: chưa hỗ trợ thì báo rõ trong `warning_items`. **Chưa làm.**
- [x] Test: rớt môn đầu chuỗi tiên quyết → kỳ ra trường lùi đúng; rớt môn không ai cần → chỉ thêm một lần học.

**T55. "Kỳ này có mở"** (E7, W2)
- [x] Trường kịch bản mới: `offered: [{course_code, semester_code}]`: bỏ cảnh báo và bỏ phạt "OH" (lịch sử mở lớp) cho đúng cặp đó; không đổi luật cứng khác (đồ án vẫn không học hè).
- [x] Test: môn chưa từng mở hè, có `offered` → xếp được vào hè, không còn cảnh báo.

**T56. Vi phạm và cảnh báo kèm điều quy định** (12.4)
- [x] Bảng ánh xạ mã luật (H4, H5, H7, H11, H14…) → điều QĐ 285 lấy từ `04-luat-qd285.md`; luật nhóm tự đặt ghi "nhóm tự quyết".
- [~] Thêm trường `rule` vào `warning_items` và vào lý do không giải được. **23/11: có ở `warning_items`; lý do không giải được chưa kèm điều.**
- [~] Test: mỗi loại lý do có `rule`. **23/11: test cho nghỉ 2 kỳ và lịch sử mở lớp.**

#### B. Backend (`Backend/src/planner/`)

**T57. Nhận các trường kịch bản mới**
- [x] DTO `POST /api/plans/solve`: `assumed_fail`, `offered`, thứ tự ưu tiên có `S2`, `S8`; `planner-input.ts` chuyển nguyên cho bộ giải.
- [x] Jest: payload có trường mới → JSON đầu vào bộ giải có đúng trường; sai định dạng → 400.

**T58. Lịch sử 10 bản + giữ trạng thái trang** (12.6, W7, W10)
- [x] Không cần API mới: dùng `GET/PUT /api/plans/settings` (`data.web.planner`, giới hạn 200 KB, `planner.service.ts:291-309`). Thêm `plans: [{id, name, saved_at, starred, scenario, plan, kpi, checked}]`.
- [~] Đo kích thước một bản thật (tài khoản thử A); 10 bản phải dưới 200 KB, không thì chỉ lưu lộ trình rút gọn (`planOf`). **Chưa làm** (đo khi bấm thử).
- [x] Bỏ mốc localStorage (`whatIf.ts`): chuyển mốc cũ thành một bản gắn sao, một lần.
- [~] Jest: lưu 10 bản; quá 200 KB báo lỗi rõ. **Chưa làm**: giới hạn 200 KB có sẵn ở backend; giữ 10 bản làm ở trang.

#### C. Trang Gợi ý (`Frontend/src/pages/recommendations/`, giữ Ant Design và style hiện tại)

**T59. Chỉ bấm Giải mới gọi bộ giải** (W6, W10)
- [x] Bỏ tự giải trong `index.tsx:186-196` (vẫn tự lưu cài đặt); bỏ các chỗ gọi `solve.mutate` sau thao tác (dòng 238…), trừ nút Giải.
- [x] Có sửa mà chưa giải: một dòng "Đã sửa N chỗ, chưa kiểm. Bấm Giải"; dải chỉ số mờ đi.
- [x] Mở trang: **không giải** (W10); hiện lại bản đang xem lần trước từ `data.web.planner`. Chưa có thì hiện "Bấm Giải để có lộ trình".
- [x] Bỏ nút "Khóa kỳ" khỏi trang (W13); bộ giải giữ `frozen_semesters` nhưng trang không gửi nữa.
- [x] Nút **Hoàn tác** (lùi lần sửa gần nhất của kịch bản).

**T60. Ưu tiên chỉ 3 mục** (12.3)
- [x] `priorities.ts`, `PriorityList.tsx`: hiện S1 "Ra trường sớm", S8 "Mỗi kỳ chính 15–18 TC", S2 "Không học dư môn tự chọn"; bật/tắt, lên/xuống. Hai dòng mờ "Học phí thấp (bàn sau)", "Theo sở thích (bàn sau)".
- [x] Mục ẩn gửi theo thứ tự cố định (T51). Cài đặt cũ có mục ẩn thì bỏ qua, không lỗi.

**T61. Bấm môn → kỳ sáng/mờ kèm lý do, chuyển môn = ghim** (12.5)
- [x] Hiểu: kết quả giải đã có đủ để kiểm tại trang chưa (tiên quyết, môn từng mở hè, đồ án, TC). Thiếu thì backend trả thêm (ví dụ `relations` rút gọn cho các môn trong lộ trình).
- [x] `SemesterBoard.tsx`: bấm môn → kỳ được (tô hồng nhạt) / không được (mờ + lý do ngắn: cần xong X trước, phải học trước Y, đồ án không học hè, bạn nghỉ kỳ này, báo không mở, sẽ vượt 25 TC). Tính tại trang, **không gọi bộ giải**.
- [x] Bấm kỳ được → môn ghim vào kỳ đó; đánh dấu "đã chuyển, chưa giải".

**T62. Đổi môn cùng khối, gõ mã ở ô tự do** (E10; hẹn từ T45b)
- [x] Môn tự chọn bộ giải đã điền tên: ô xổ xuống "Đổi môn khác cùng khối" (môn trong khối, trừ môn đã chọn ở ô khác).
- [x] Ô tự chọn tự do: gõ mã môn bất kỳ; mã không có trong database thì báo, không lỗi.
- [~] Đổi môn làm thiếu tiên quyết: lần Giải sau báo rõ và gợi ý môn thay. **23/11: một phần**: ô đổi môn làm mờ môn thiếu tiên quyết; ghim trái tiên quyết thì thẻ Yêu cầu báo, chưa gợi ý môn thay.

**T63. Giả định rớt và "Kỳ này có mở" trên trang** (T54, T55)
- [x] Trên thẻ môn trong lộ trình: "Giả định rớt kỳ này" / "Bỏ giả định rớt".
- [x] Trong cảnh báo "3 năm chưa mở hè…": nút "Kỳ này có mở".
- [x] Cảnh báo, vi phạm hiện một dòng, kèm điều quy định (T56).

**T64. Lưu bản và lịch sử** (12.6, T58)
- [x] Ô tên + nút "Lưu bản này" dưới lộ trình; lưu cả lộ trình và mọi giả định; bản chưa giải có nhãn "chưa kiểm".
- [x] Danh sách (n/10): gắn sao = mốc, Mở, So với đang xem, Xóa. Đủ 10 thì bỏ bản cũ nhất không gắn sao.
- [x] Mở bản: khôi phục kịch bản và lộ trình, không giải lại.

#### D. So sánh và kiểm thử

**T65. Tab So sánh** (12.7)
- [x] Chọn 2 trong: đang xem, kế hoạch giảng dạy, các bản đã lưu.
- [x] Bảng chỉ số 12.7 (chữ xanh ở bản tốt hơn); giả định khác nhau (tô hồng); môn đổi kỳ kèm tên.
- [x] Không gọi bộ giải; thiếu kỳ khuyến nghị (KHMT 2023: 37/96) thì ghi rõ "chỉ tính môn có kỳ khuyến nghị".

**T66. Kiểm toàn bộ**
- [x] pytest, jest, `npx tsc --noEmit -p tsconfig.app.json`, lint qua.
- [x] `check_baseline.py`: thêm phép kiểm cho T51–T58 (mục CHUA_LAM chuyển DUNG).
- [ ] Đi hết bảng M1–M18, mỗi dòng ghi đạt / chưa.
- [ ] Bấm thử bằng tài khoản thử A: Giải → chuyển 1 môn → đổi môn khối → giả định rớt → Giải; nghỉ 2 kỳ; lưu 2 bản → So sánh. Ghi kết quả vào mục Duyệt.

**Không làm trong giai đoạn 12:** học phí, budget, sở thích, GPA dự kiến (W3, W4, W9); giao diện mới theo mẫu (áp sau); SSO.
