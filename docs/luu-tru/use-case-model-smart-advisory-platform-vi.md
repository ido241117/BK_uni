# Mô hình Use Case — Smart Advisory & Optimization Platform

**Phiên bản:** 0.1  
**System boundary:** Smart Advisory & Optimization Platform  
**Phạm vi:** Lập lộ trình, phân tích lựa chọn đăng ký, replanning và đồng bộ dữ liệu chỉ đọc.

## 1. Actors

| Actor | Loại | Vai trò |
|---|---|---|
| Sinh viên | Primary actor | Xem tiến độ, sinh và chọn lộ trình, phân tích lựa chọn đăng ký, xem replan và giải thích. |
| Hệ thống trường | External system actor | Cung cấp curriculum, academic snapshot, eligibility, registration data, course offering và timetable thông qua data contract chỉ đọc. |
| Quản trị viên hệ thống | Supporting actor | Khởi tạo đồng bộ, theo dõi trạng thái, xem lỗi và yêu cầu đồng bộ lại. |

`Hệ thống trường` là actor nghiệp vụ tổng quát. Khi thiết kế integration/component diagram, actor này có thể được ánh xạ thành cổng đăng ký, hệ thống quản lý đào tạo hoặc nhiều service khác nhau. Prototype thay actor này bằng mock adapter; mock adapter không phải actor thứ tư.

## 2. User-goal use cases

| ID | Use case | Primary actor | Kết quả có giá trị |
|---|---|---|---|
| UC-01 | Xem tiến độ học tập | Sinh viên | Biết các môn đã đạt, đang học, số tín chỉ và yêu cầu còn thiếu theo snapshot mới nhất. |
| UC-02 | Sinh và xem các lộ trình học tập | Sinh viên | Nhận 3–5 lộ trình đại diện từ trạng thái hiện tại đến khi hoàn thành chương trình. |
| UC-03 | So sánh và chọn lộ trình đang theo | Sinh viên | So sánh trade-off và chọn một active plan. |
| UC-04 | Phân tích lựa chọn đăng ký môn | Sinh viên | Biết lựa chọn thủ công có hợp lệ không và ảnh hưởng tới các kỳ tương lai. |
| UC-05 | Xem phương án lập lại lộ trình | Sinh viên | Nhận các phương án tương lai sau khi academic hoặc registration data thay đổi. |
| UC-06 | Xem giải thích và lịch sử lộ trình | Sinh viên | Hiểu lý do recommendation/thay đổi và so sánh các plan version. |
| UC-07 | Đồng bộ dữ liệu trường | Quản trị viên hệ thống | Tạo snapshot đã kiểm tra từ dữ liệu chỉ đọc của trường. |
| UC-08 | Theo dõi và xử lý lỗi đồng bộ | Quản trị viên hệ thống | Xem trạng thái/lỗi và yêu cầu thử đồng bộ lại. |

## 3. Supporting and extending use cases

| Use case con | Quan hệ | Use case chính | Ý nghĩa |
|---|---|---|---|
| Nạp ngữ cảnh học tập mới nhất | `include` | UC-01, UC-02 | Tiến độ và path luôn phải dựa trên snapshot hiện hành. |
| Sinh các lộ trình khả thi | `include` | UC-02 | Hệ thống phải tạo candidate thỏa hard constraints trước khi hiển thị. |
| Chọn 3–5 lộ trình đại diện | `include` | UC-02 | Candidate được lọc theo policy, diversity và deterministic tie-break. |
| UC-03 — Chọn lộ trình đang theo | `extend` | UC-02 | Sinh viên có thể chỉ xem path mà chưa chọn active plan. |
| Nạp ngữ cảnh đăng ký mới nhất | `include` | UC-04, UC-05 | Phân tích/replan luôn dùng registration snapshot mới nhất đã có. |
| Kiểm tra ràng buộc học vụ | `include` | UC-04 | Mọi lựa chọn đăng ký đều phải được kiểm tra theo rules và official eligibility có sẵn. |
| Lập lại phần lộ trình tương lai | `include` | UC-04, UC-05 | Hệ thống phải thể hiện ảnh hưởng của lựa chọn hoặc thay đổi tới các kỳ sau. |
| Cảnh báo xung đột hoặc lựa chọn không hợp lệ | `extend` | UC-04 | Chỉ xuất hiện khi phát hiện vi phạm, trùng lịch hoặc dữ liệu chính thức loại môn. |
| UC-06 — Xem giải thích và lịch sử | `extend` | UC-02, UC-03, UC-04, UC-05 | Người dùng mở explanation/history khi cần. |
| Lấy dữ liệu chỉ đọc từ hệ thống trường | `include` | UC-07 | Một lần sync luôn phải đọc data từ external system hoặc mock adapter. |
| Kiểm tra schema, độ đầy đủ và tính nhất quán | `include` | UC-07 | Snapshot chỉ được công bố sau khi vượt qua validation. |
| Lưu snapshot có version và thời điểm đồng bộ | `include` | UC-07 | Kết quả sync phải truy vết được. |
| Ghi nhận lỗi đồng bộ | `extend` | UC-07 | Chỉ xảy ra khi lấy hoặc kiểm tra dữ liệu thất bại. |
| Thử đồng bộ lại | `extend` | UC-08 | Admin có thể chọn retry sau khi xem lỗi. Retry gọi lại UC-07. |

## 4. Ranh giới bắt buộc

- Platform không nộp, thêm, xóa hoặc xác nhận môn trong phiếu đăng ký chính thức.
- Platform không thay đổi curriculum, transcript, eligibility, timetable hoặc registration result của trường.
- `Đăng ký môn học` không được đặt thành use case của platform trong scope hiện tại. Use case đúng là `Phân tích lựa chọn đăng ký môn`.
- `Cung cấp dữ liệu sinh viên & TKB` là trách nhiệm của actor Hệ thống trường. Use case nằm trong platform được đặt tên là `Đồng bộ dữ liệu trường` hoặc `Lấy dữ liệu chỉ đọc từ hệ thống trường`.
- CP-SAT, rule engine, database và policy ranking là thành phần nội bộ, không phải actor hay user-goal use case.

## 5. Diagram artifacts

- `docs/diagrams/smart-advisory-use-case-overview-vi.svg`: sơ đồ tổng quan ba actor.
- `docs/diagrams/student-degree-path-use-cases-vi.svg`: chi tiết lập và chọn lộ trình.
- `docs/diagrams/student-registration-replan-use-cases-vi.svg`: chi tiết phân tích đăng ký và replan.
- `docs/diagrams/admin-data-sync-use-cases-vi.svg`: chi tiết đồng bộ dữ liệu cho Admin.

Source PlantUML tương ứng nằm cùng thư mục với đuôi `.puml`.
