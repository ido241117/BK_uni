# Mô hình Use Case — Degree Path Planning and Replanning Module

## 1. Cách tổ chức sơ đồ

Bộ sơ đồ chính thức theo business view dùng đúng ba actor: `Sinh viên`, `Hệ thống trường` và `Quản trị viên hệ thống`.

1. `smart-advisory-use-case-overview-vi`: tổng quan tám user-goal use case.
2. `student-degree-path-use-cases-vi`: nhóm xem tiến độ, sinh, so sánh và chọn lộ trình.
3. `student-registration-replan-use-cases-vi`: nhóm phân tích đăng ký và replan.
4. `admin-data-sync-use-cases-vi`: nhóm đồng bộ và xử lý lỗi dữ liệu.

Các sơ đồ tiếng Anh cũ được giữ làm bản nháp kỹ thuật. Khi đưa vào báo cáo, sử dụng các file có hậu tố `-vi` ở trên.

Không gom toàn bộ chức năng và luồng dữ liệu vào một hình. Bộ sơ đồ được chia thành:

1. `degree-planner-use-case-overview`: tám user-goal use case của toàn module.
2. `degree-planning-use-cases`: nhóm sinh, so sánh và chọn lộ trình.
3. `registration-support-use-cases`: nhóm hỗ trợ ba đợt đăng ký và replan.

Các file `.puml` là source; `.svg` là bản vector dùng trong báo cáo; `.png` chỉ dùng để xem nhanh.

## 2. System boundary và actors

**System boundary:** `Degree Path Planning and Replanning Module`.

| Actor | Quan hệ với module |
|---|---|
| Student | Actor chính, yêu cầu sinh path, đánh giá lựa chọn đăng ký, replan và xem giải thích. |
| Existing University Portal / Course Registration System | Hệ thống ngoài, chuyển context/kết quả đăng ký và hiển thị chức năng tích hợp. Việc đăng ký chính thức vẫn nằm ngoài module. |
| University Data Provider | Hệ thống ngoài cung cấp dữ liệu chỉ đọc như curriculum, academic snapshot, eligibility, offerings và timetable. |

`Mock University Data Provider` là adapter dùng khi demo, không phải business actor mới.

## 3. Các use case cấp user goal

| ID | Use case | Các luồng con cần đặc tả |
|---|---|---|
| UC-01 | Generate Full Degree Paths | Nhận snapshot mới nhất; kiểm tra dữ liệu; khóa quá khứ và trạng thái đã xác nhận; sinh candidate hợp lệ; chọn 3–5 path đại diện; tạo metric, cảnh báo và evidence; lưu plan version. |
| UC-02 | Compare and Select Active Path | Mở tập path; so sánh timeline/metric/assumption; xem khác biệt; chọn active path; lưu lựa chọn. |
| UC-03 | Analyze Round 1 Registration Draft | Nhận draft chính thức hoặc lựa chọn thủ công; kiểm tra theo dữ liệu hiện có; so với active path; chạy what-if; hiển thị ảnh hưởng đến các kỳ sau. |
| UC-04 | Adjust Plan in Registration Round 2 | Đồng bộ offering, timetable và kết quả Đợt 2; phát hiện môn bị loại/không mở/hết chỗ/trùng lịch; đề xuất thay thế; replan phần tương lai; lưu version mới. |
| UC-05 | Confirm and Replan after Registration Round 3 | Đồng bộ kết quả cuối; đối chiếu draft với kết quả; cố định trạng thái kỳ sắp học; replan các kỳ còn lại; cập nhật active plan và history. |
| UC-06 | Replan after Academic or Registration Change | Nhận trigger thay đổi; tạo baseline mới; giữ nguyên quá khứ và các quyết định đã xác nhận; sinh các phương án tương lai; so sánh với active plan; lưu version. |
| UC-07 | View Recommendation Explanations | Chọn môn/path/cảnh báo; xem hard constraints, policy, assumptions và nguồn dữ liệu; giải thích vì sao được chọn, bị loại, thay thế hoặc chuyển kỳ; giải thích infeasible khi có evidence. |
| UC-08 | Review and Compare Plan Versions | Xem danh sách version; chọn các version; xem khác biệt về môn, kỳ, completion term, assumptions và nguyên nhân thay đổi. |

Các mục trong cột “luồng con” chủ yếu là bước của main/alternative flow. Không biến mỗi bước nội bộ như “chạy CP-SAT”, “xếp hạng candidate” hay “ghi database” thành một business use case riêng.

**SUC-01 — Load Latest Planning Context** là supporting use case dùng lại: module lấy các snapshot có version từ University Data Provider và Existing University Portal trước khi planning/replanning. Nó xuất hiện trong sơ đồ chi tiết vì có trao đổi qua system boundary, nhưng không phải mục tiêu độc lập của Student.

## 4. Quy tắc dùng quan hệ UML

- Association: actor trực tiếp trao đổi với use case.
- `<<include>>`: hành vi dùng lại và luôn xảy ra trong use case gốc. UC-03, UC-04 và UC-05 include UC-06 vì kết quả của mỗi đợt phải tạo được phần kế hoạch tương lai mới.
- `<<extend>>`: hành vi chỉ xảy ra khi người dùng yêu cầu hoặc khi có điều kiện. UC-07 extend UC-01/UC-02 vì người dùng có thể mở phần giải thích từ kết quả.
- Thứ tự thời gian giữa Đợt 1, 2 và 3 không phải quan hệ `include` hay `extend`.
- CP-SAT, database, rule engine và selection policy là thành phần bên trong; chúng xuất hiện trong sequence/activity/component diagram, không phải actor.

## 5. Cách kiểm tra mô hình đúng

1. Mỗi use case phải tạo ra một kết quả có giá trị mà actor nhận biết được.
2. Mỗi use case có primary actor, trigger, preconditions, main flow, alternative flows và postconditions.
3. Mỗi FR phải trace được đến ít nhất một use case hoặc một quy tắc dùng chung.
4. Không đưa thao tác UI nhỏ như bấm tab, lọc bảng hoặc gọi API thành user-goal use case.
5. Không mô tả thuật toán trong use case diagram; thuật toán nằm trong flow và sequence/activity diagram.
6. External system chỉ là actor khi thực sự trao đổi dữ liệu qua system boundary.
7. Registration chính thức vẫn thuộc University Portal; module chỉ phân tích, cảnh báo và replan.
8. Với mỗi alternative flow, phải chỉ rõ hệ thống giữ lại trạng thái nào và trả kết quả/cảnh báo gì.

## 6. Render SVG và PNG

Từ thư mục gốc dự án:

```powershell
java '-Dfile.encoding=UTF-8' -jar '.tools/plantuml.jar' -charset UTF-8 -tsvg 'docs/diagrams/degree-planner-use-case-overview.puml'
java '-Dfile.encoding=UTF-8' -jar '.tools/plantuml.jar' -charset UTF-8 -tsvg 'docs/diagrams/degree-planning-use-cases.puml'
java '-Dfile.encoding=UTF-8' -jar '.tools/plantuml.jar' -charset UTF-8 -tsvg 'docs/diagrams/registration-support-use-cases.puml'
```

Thay `-tsvg` bằng `-tpng` để tạo bản preview PNG.
