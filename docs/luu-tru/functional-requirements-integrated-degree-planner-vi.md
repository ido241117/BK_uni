# Đặc tả yêu cầu chức năng — Degree Path Planning and Replanning Module

**Phiên bản:** 0.3  
**Phạm vi:** Module lập và cập nhật lộ trình học tập được thiết kế để tích hợp vào cổng đăng ký môn hiện tại của trường  
**Trạng thái:** Bản nháp làm cơ sở xây dựng Use Case Specification

## 1. System boundary

Degree Path Planning and Replanning Module nhận dữ liệu học vụ và đăng ký dưới dạng chỉ đọc từ các hệ thống hiện có của trường. Module sử dụng dữ liệu mới nhất để sinh nhiều lộ trình học, phân tích lựa chọn đăng ký của sinh viên và lập lại phần tương lai khi dữ liệu thay đổi.

Module không thực hiện đăng ký môn chính thức, không xếp lớp hoặc thời khóa biểu cho trường và không sửa dữ liệu chính thức của nhà trường.

## 2. Actors

### 2.1. Student — Primary actor

Sinh viên trực tiếp sử dụng module để:

- Xem tiến độ học tập và các yêu cầu còn thiếu.
- Yêu cầu sinh nhiều degree path.
- So sánh các path được đề xuất.
- Chọn một path làm active plan.
- Xem recommendation cho kỳ đăng ký tiếp theo.
- Tạo lựa chọn đăng ký khác với recommendation.
- Chạy what-if analysis và replan các kỳ tương lai.
- Xem cảnh báo, explanation và lịch sử thay đổi của plan.

### 2.2. University Core System — External system actor

`University Core System` là abstraction nghiệp vụ đại diện cho cổng đăng ký môn và các hệ thống dữ liệu hiện có của nhà trường. Actor này:

- Cung cấp student context đã xác thực.
- Cung cấp registration round, registration draft và kết quả đăng ký.
- Cung cấp dữ liệu chỉ đọc gồm:

- Curriculum và academic rules.
- Transcript và tiến độ học tập.
- Các môn đã đạt, không đạt, đang học và đã đăng ký.
- Eligibility chính thức tại thời điểm đăng ký.
- Registration round hiện tại.
- Registration draft và kết quả đăng ký.
- Course offerings và trạng thái mở môn.
- Nhóm lớp, sĩ số và thời khóa biểu khi đã được công bố.
- Có thể nhận kết quả recommendation từ Planning Module để hiển thị trong cổng trường.

Nhà trường hiện có các dữ liệu này để phục vụ quản lý học vụ và đăng ký môn. Tuy nhiên, nhóm chưa có thông tin về cấu trúc hệ thống nội bộ, API hoặc cơ chế truy cập thực tế. Vì vậy, prototype sử dụng `Mock University Core System Adapter` theo một data contract giả định. Mock provider không được trình bày như API thật của nhà trường.

Planning Module không tự gửi lệnh thêm, xóa hoặc xác nhận môn vào hệ thống đăng ký chính thức.

### 2.3. System Admin — Supporting actor

System Admin vận hành phần tích hợp dữ liệu của platform để:

- Khởi tạo đồng bộ curriculum, academic data, registration data và timetable từ University Core System.
- Xem trạng thái, phiên bản và thời điểm đồng bộ gần nhất.
- Xem lỗi kiểm tra schema, dữ liệu thiếu hoặc lỗi kết nối.
- Yêu cầu thử đồng bộ lại sau khi lỗi được xử lý.

System Admin không được chỉnh sửa transcript, eligibility, registration result hoặc dữ liệu chính thức của nhà trường thông qua Planning Module.

## 3. Functional Requirements

## FR-1. University Data Integration and Student Context

| ID | Actor | Functional Requirement |
|---|---|---|
| FR-1.1 | University Core System | Cổng thông tin hiện tại của trường phải cung cấp cho module định danh của sinh viên đã được xác thực và học kỳ đăng ký đang được xử lý. |
| FR-1.2 | University Core System | Hệ thống phải nhận chương trình đào tạo và phiên bản chương trình đang áp dụng cho sinh viên. |
| FR-1.3 | University Core System | Hệ thống phải nhận danh mục môn học, số tín chỉ, nhóm yêu cầu tốt nghiệp và các academic rules thuộc chương trình đào tạo. |
| FR-1.4 | University Core System | Hệ thống phải nhận tiến độ học tập của sinh viên, gồm các môn đã đạt, không đạt, đang học và đã đăng ký. |
| FR-1.5 | University Core System | Hệ thống phải nhận số tín chỉ tích lũy và những điều kiện học vụ đã được xác nhận của sinh viên. |
| FR-1.6 | University Core System | Hệ thống phải nhận registration round, registration draft và kết quả đăng ký mới nhất khi các dữ liệu này đã được công bố. |
| FR-1.7 | University Core System | Hệ thống phải nhận course offerings, nhóm lớp, sĩ số và thời khóa biểu khi các dữ liệu này có sẵn trong từng đợt đăng ký. |
| FR-1.8 | System | Hệ thống phải phân biệt dữ liệu chưa được công bố với dữ liệu xác nhận một môn không được mở, một lớp đã đầy hoặc đăng ký đã bị từ chối. |
| FR-1.9 | System | Hệ thống chỉ được đọc dữ liệu curriculum, học tập, đăng ký và thời khóa biểu; không được sửa dữ liệu chính thức của nhà trường. |
| FR-1.10 | System | Hệ thống phải lưu source, version, registration round và thời điểm lấy của mỗi snapshot được sử dụng để phân tích hoặc sinh path. |
| FR-1.11 | System | Hệ thống phải kiểm tra tính đầy đủ và nhất quán của dữ liệu trước khi sử dụng để sinh lộ trình. |
| FR-1.12 | System | Khi dữ liệu thiếu nhưng vẫn có thể planning theo giả định, hệ thống phải ghi rõ assumption và warning tương ứng. |
| FR-1.13 | System | Khi dữ liệu có lỗi khiến kết quả không đáng tin cậy, hệ thống phải dừng việc sinh path và thông báo lỗi dữ liệu. |
| FR-1.14 | Mock University Core System Adapter | Prototype phải cung cấp mock data theo cùng data contract được Planning Module sử dụng. |
| FR-1.15 | System | Khi nhận snapshot mới, hệ thống phải xác định active plan nào đang sử dụng dữ liệu cũ và có thể bị ảnh hưởng. |

## FR-2. Student State Snapshot and Planning Baseline

| ID | Actor | Functional Requirement |
|---|---|---|
| FR-2.1 | Student | Sinh viên phải có thể yêu cầu sinh lộ trình dựa trên dữ liệu học tập mới nhất hiện có tại thời điểm yêu cầu. |
| FR-2.2 | System | Trước khi sinh lộ trình, hệ thống phải lấy Student Academic Snapshot mới nhất từ University Core System. |
| FR-2.3 | University Core System | Snapshot phải cung cấp các môn sinh viên đã hoàn thành, không đạt, đang học và đã đăng ký. |
| FR-2.4 | University Core System | Snapshot phải cung cấp số tín chỉ tích lũy và phiên bản chương trình đào tạo đang áp dụng cho sinh viên. |
| FR-2.5 | University Core System | Snapshot phải cung cấp eligibility hoặc kết quả kiểm tra điều kiện đăng ký chính thức cho kỳ đăng ký hiện tại khi dữ liệu này đã có. |
| FR-2.6 | System | Hệ thống phải sử dụng kết quả eligibility do University Core System cung cấp làm kết quả chính thức cho kỳ đăng ký hiện tại. |
| FR-2.7 | System | Hệ thống phải khóa các môn đã hoàn thành vào đúng phần lịch sử và không được thay đổi chúng khi sinh hoặc replan. |
| FR-2.8 | System | Hệ thống phải giữ các môn đang học hoặc đã đăng ký trong học kỳ hiện tại theo dữ liệu snapshot mới nhất. |
| FR-2.9 | System | Hệ thống phải xây dựng các học kỳ tương lai dựa trên trạng thái hiện tại, curriculum rules và các môn đã được xếp trong những học kỳ trước đó của cùng một candidate path. |
| FR-2.10 | System | Một môn chỉ được xếp vào học kỳ tương lai nếu vị trí của môn đó trong candidate path thỏa các quan hệ học vụ và giới hạn tín chỉ được mã hóa. |
| FR-2.11 | System | Hệ thống phải gắn mỗi plan với version và thời điểm của Student Academic Snapshot đã được dùng để sinh plan. |
| FR-2.12 | System | Khi nhận được Student Academic Snapshot mới, hệ thống phải xác định active plan hiện tại có còn phù hợp hay cần replan. |

## FR-3. Full Degree Path Generation

| ID | Actor | Functional Requirement |
|---|---|---|
| FR-3.1 | Student | Sinh viên phải có thể yêu cầu hệ thống sinh các lộ trình học từ trạng thái học tập hiện tại đến khi hoàn thành chương trình đào tạo. |
| FR-3.2 | System | Hệ thống phải sinh lộ trình từ curriculum, Student Academic Snapshot và các academic rules đã được chuẩn hóa. |
| FR-3.3 | System | Hệ thống không được yêu cầu planning guide hoặc học kỳ khuyến nghị làm input bắt buộc để sinh lộ trình. |
| FR-3.4 | System | Hệ thống phải biểu diễn timeline chuẩn gồm tám học kỳ chính tính từ thời điểm sinh viên bắt đầu chương trình. |
| FR-3.5 | System | Timeline phải hiển thị các kỳ đã hoàn thành, kỳ hiện tại và các kỳ tương lai trong cùng một lộ trình. |
| FR-3.6 | System | Các học kỳ đã hoàn thành phải được giữ nguyên theo dữ liệu chính thức; hệ thống chỉ được sinh hoặc thay đổi phần tương lai của lộ trình. |
| FR-3.7 | System | Mỗi candidate path phải bao gồm toàn bộ môn bắt buộc còn thiếu và đáp ứng số tín chỉ yêu cầu của các nhóm tự chọn. |
| FR-3.8 | System | Mỗi candidate path phải đáp ứng tổng số tín chỉ và các điều kiện tốt nghiệp được biểu diễn trong curriculum data. |
| FR-3.9 | System | Việc xếp môn theo học kỳ phải thỏa quan hệ tiên quyết, học trước, song hành và các quan hệ học vụ khác theo semantics đã được mã hóa. |
| FR-3.10 | System | Tổng tín chỉ của mỗi học kỳ phải nằm trong giới hạn tín chỉ áp dụng cho sinh viên, trừ khi academic policy cung cấp ngoại lệ hợp lệ. |
| FR-3.11 | System | Hệ thống không được xếp lại môn sinh viên đã hoàn thành, trừ khi academic policy cho phép học lại hoặc học cải thiện. |
| FR-3.12 | System | Hệ thống không được tính một môn nhiều lần cho các requirement group loại trừ lẫn nhau. |
| FR-3.13 | System | Mỗi môn được xếp trong path phải đáp ứng ít nhất một yêu cầu chưa hoàn thành hoặc được đánh dấu rõ là môn học thêm được policy cho phép. |
| FR-3.14 | System | Việc một môn có thể xuất hiện trong học kỳ tương lai phải được xác định từ trạng thái hiện tại và các môn đã được xếp ở những kỳ trước trong cùng candidate path. |
| FR-3.15 | System | Nếu không tồn tại candidate path hoàn thành trước hết kỳ 8, hệ thống phải thông báo rằng mục tiêu tám kỳ không khả thi theo dữ liệu và ràng buộc hiện tại. |
| FR-3.16 | System | Khi mục tiêu tám kỳ không khả thi, hệ thống phải có thể tìm học kỳ hoàn thành sớm nhất sau kỳ 8 và trình bày phần này như phần mở rộng của timeline chuẩn. |
| FR-3.17 | System | Hệ thống phải phân biệt trạng thái `feasible`, `infeasible`, `feasible_with_assumptions` và `solver_timeout` của quá trình sinh path. |
| FR-3.18 | System | Hệ thống phải lưu curriculum version, Student Academic Snapshot version và constraint model version được dùng để sinh candidate path. |

## FR-4. Representative Path Selection and Recommendation

| ID | Actor | Functional Requirement |
|---|---|---|
| FR-4.1 | System | Sau khi sinh các candidate path hợp lệ, hệ thống phải áp dụng một selection policy để chọn các path đại diện được hiển thị cho sinh viên. |
| FR-4.2 | System | Hệ thống phải giới hạn số path được hiển thị theo cấu hình, mặc định từ ba đến năm path. |
| FR-4.3 | System | Hệ thống không bắt buộc phải liệt kê hoặc đếm toàn bộ tập nghiệm khả thi trước khi chọn các path đại diện. |
| FR-4.4 | System | Nếu tổng số nghiệm khả thi chính xác không được tính, hệ thống không được trình bày số path hiển thị như toàn bộ các khả năng tồn tại. |
| FR-4.5 | System | Selection policy phải có phiên bản và phải xác định rõ các tiêu chí cùng thứ tự ưu tiên được sử dụng để đánh giá candidate path. |
| FR-4.6 | System | Selection policy chỉ được sử dụng dữ liệu đến từ curriculum, academic policy, Student Academic Snapshot, dữ liệu đăng ký, dữ liệu mở môn hoặc preference do sinh viên khai báo. |
| FR-4.7 | System | Selection policy có thể xem xét thời điểm hoàn thành, số tín chỉ ngoài yêu cầu, độ cân bằng tín chỉ giữa các kỳ, giá trị mở khóa môn sau và mức phù hợp với preference của sinh viên. |
| FR-4.8 | System | Hệ thống không được sử dụng độ khó môn, khả năng qua môn hoặc điểm dự đoán nếu chưa có dataset và mô hình đã được xác minh cho các tiêu chí đó. |
| FR-4.9 | System | Hệ thống phải áp dụng diversity criteria để tránh hiển thị nhiều path gần như giống nhau. |
| FR-4.10 | System | Diversity phải được đánh giá dựa trên các khác biệt có thể đo được như tập môn tự chọn, vị trí môn theo kỳ, phân bố tín chỉ và học kỳ hoàn thành. |
| FR-4.11 | System | Các candidate chỉ khác nhau bởi thay đổi không đáng kể dưới diversity threshold phải được gom vào cùng một nhóm tương đương. |
| FR-4.12 | System | Mỗi path được chọn phải đại diện cho một nhóm candidate hoặc một objective profile khác biệt có ý nghĩa. |
| FR-4.13 | System | Nếu không tồn tại đủ số lượng path khác biệt có ý nghĩa, hệ thống phải trả về ít hơn số lượng cấu hình thay vì bổ sung các path gần trùng nhau. |
| FR-4.14 | System | Nếu nhiều candidate đồng hạng theo toàn bộ selection criteria, hệ thống phải sử dụng một deterministic tie-break để kết quả có thể tái lập. |
| FR-4.15 | System | Deterministic tie-break không được trình bày như bằng chứng rằng path được chọn có chất lượng học tập cao hơn các candidate đồng hạng khác. |
| FR-4.16 | System | Mỗi path được hiển thị phải kèm các metric, assumption và trade-off làm cơ sở cho việc chọn path đó. |
| FR-4.17 | Student | Sinh viên phải có thể so sánh các path theo học kỳ hoàn thành, tải tín chỉ từng kỳ, tập môn tự chọn, assumption và các cảnh báo hiện có. |

## FR-5. Registration Round 1 Planning

| ID | Actor | Functional Requirement |
|---|---|---|
| FR-5.1 | University Core System | Hệ thống phải nhận thông tin cho biết sinh viên đang ở Registration Round 1 và học kỳ nào đang được đăng ký. |
| FR-5.2 | Student | Sinh viên phải có thể xem các representative path được sinh từ Student Academic Snapshot mới nhất. |
| FR-5.3 | System | Với mỗi path, hệ thống phải chỉ ra các môn được xếp cho kỳ đăng ký tiếp theo. |
| FR-5.4 | System | Hệ thống phải hiển thị tổng tín chỉ dự kiến và yêu cầu curriculum mà mỗi môn trong kỳ tiếp theo sẽ đóng góp. |
| FR-5.5 | System | Hệ thống phải cho biết môn nào mở khóa các môn hoặc điều kiện học vụ trong những kỳ sau của path. |
| FR-5.6 | System | Trong Round 1, hệ thống phải ghi rõ rằng thông tin mở môn, nhóm lớp, sĩ số và thời khóa biểu chưa được xác nhận. |
| FR-5.7 | System | Việc chưa có course offering hoặc timetable trong Round 1 không được xem là môn không mở hoặc không thể đăng ký. |
| FR-5.8 | System | Hệ thống không được trình bày recommendation trong Round 1 như một bảo đảm rằng môn sẽ được mở hoặc đăng ký thành công. |
| FR-5.9 | Student | Sinh viên phải có thể chọn một representative path làm active plan để theo dõi. |
| FR-5.10 | Student | Việc chọn active plan không được bắt buộc sinh viên phải đăng ký đúng toàn bộ các môn được recommendation. |
| FR-5.11 | Existing Registration Portal | Planning Module phải có thể nhận registration draft hiện tại của sinh viên từ cổng đăng ký khi dữ liệu này được cung cấp. |
| FR-5.12 | Student | Sinh viên phải có thể yêu cầu phân tích registration draft hiện tại, kể cả khi draft không trùng với bất kỳ representative path nào. |
| FR-5.13 | System | Khi chưa nhận được registration draft từ cổng trường, prototype phải cho phép mô phỏng draft bằng danh sách mã môn do sinh viên chọn. |
| FR-5.14 | System | Hệ thống phải phân biệt registration draft với kết quả đăng ký chính thức. |
| FR-5.15 | System | Hệ thống phải phân tích ảnh hưởng của registration draft đến các học kỳ sau dựa trên giả định sinh viên sẽ đăng ký và hoàn thành các môn trong draft. |
| FR-5.16 | System | Sau khi nhận registration draft, hệ thống phải sinh lại phần tương lai của path từ học kỳ sau kỳ đang đăng ký. |
| FR-5.17 | System | Hệ thống phải giữ nguyên lịch sử đã hoàn thành và không được thay đổi kỳ đang học khi phân tích registration draft cho kỳ tiếp theo. |
| FR-5.18 | System | Hệ thống phải hiển thị registration draft làm Student-selected assumption, không phải recommendation của hệ thống hoặc dữ kiện chính thức của trường. |
| FR-5.19 | System | Hệ thống phải cho biết registration draft có làm thay đổi học kỳ hoàn thành dự kiến, phân bố tín chỉ hoặc khả năng học các môn sau hay không. |
| FR-5.20 | System | Hệ thống phải lưu registration round, target semester và snapshot versions được dùng để phân tích draft. |
| FR-5.21 | System | Planning Module không được tự gửi, thêm, xóa hoặc xác nhận môn trong phiếu đăng ký chính thức của sinh viên. |

## FR-6. Registration Round 2 Adjustment

| ID | Actor | Functional Requirement |
|---|---|---|
| FR-6.1 | University Core System | Hệ thống phải nhận thông tin cho biết sinh viên đã chuyển sang Registration Round 2. |
| FR-6.2 | University Core System | Hệ thống phải nhận kết quả xử lý registration draft của Round 1, gồm các môn được giữ lại, bị từ chối hoặc bị loại khi dữ liệu này có sẵn. |
| FR-6.3 | University Core System | Hệ thống phải nhận danh sách môn mở, nhóm lớp, thời khóa biểu và trạng thái chỗ trống đã được công bố cho Round 2. |
| FR-6.4 | University Core System | Khi có, hệ thống phải nhận lý do chính thức cho từng môn bị từ chối hoặc bị loại. |
| FR-6.5 | System | Hệ thống phải sử dụng kết quả xử lý đăng ký do University Core System cung cấp làm trạng thái chính thức của Round 2. |
| FR-6.6 | System | Hệ thống phải so sánh kết quả Round 2 với registration draft, recommendation và active plan trước đó của sinh viên. |
| FR-6.7 | System | Hệ thống phải xác định các môn trong kế hoạch kỳ tới hiện không mở, đã đầy, bị hủy hoặc không còn đủ điều kiện đăng ký. |
| FR-6.8 | System | Khi dữ liệu nhóm lớp và thời khóa biểu đã có, hệ thống phải phát hiện các môn hoặc nhóm lớp không thể được học đồng thời do trùng lịch. |
| FR-6.9 | System | Nếu dữ liệu thời khóa biểu chưa đầy đủ, hệ thống phải ghi rõ rằng kết quả kiểm tra xung đột lịch chưa hoàn chỉnh. |
| FR-6.10 | System | Hệ thống phải loại các môn đã bị từ chối hoặc không còn khả dụng khỏi assumption của kỳ đăng ký khi lập phương án mới. |
| FR-6.11 | System | Hệ thống phải xác định các tổ hợp môn khả thi cho kỳ đăng ký dựa trên eligibility chính thức, course offerings, chỗ trống và thời khóa biểu hiện có. |
| FR-6.12 | System | Khi tồn tại nhiều tổ hợp khả thi, hệ thống có thể trả về nhiều phương án điều chỉnh đại diện thay vì chỉ một phương án. |
| FR-6.13 | System | Với mỗi phương án điều chỉnh kỳ đăng ký, hệ thống phải replan các kỳ tương lai tương ứng. |
| FR-6.14 | System | Khi điều chỉnh, hệ thống phải giữ lại các môn trong registration draft vẫn hợp lệ và giảm những thay đổi không cần thiết. |
| FR-6.15 | System | Hệ thống phải cho biết môn nào được giữ, bị loại, được thay thế hoặc chuyển sang kỳ sau và lý do của từng thay đổi. |
| FR-6.16 | System | Hệ thống phải cho biết mỗi phương án Round 2 ảnh hưởng thế nào đến tải tín chỉ, các môn được mở khóa và học kỳ hoàn thành dự kiến. |
| FR-6.17 | Student | Sinh viên phải có thể chọn một phương án làm cơ sở tham khảo khi điều chỉnh phiếu đăng ký trong Existing Registration Portal. |
| FR-6.18 | Existing Registration Portal | Planning Module phải có thể nhận registration draft đã được sinh viên điều chỉnh trong Round 2 khi cổng trường cung cấp dữ liệu này. |
| FR-6.19 | System | Hệ thống phải lưu kết quả phân tích Round 2 thành một plan version mới cùng các snapshot và lý do thay đổi. |
| FR-6.20 | System | Planning Module không được tự thay đổi phiếu đăng ký chính thức trong Round 2. |

## FR-7. Registration Round 3 Confirmation

| ID | Actor | Functional Requirement |
|---|---|---|
| FR-7.1 | University Core System | Hệ thống phải nhận thông tin cho biết sinh viên đã chuyển sang Registration Round 3. |
| FR-7.2 | University Core System | Hệ thống phải nhận registration draft mới nhất, trạng thái chỗ trống và các thay đổi về môn mở, nhóm lớp hoặc thời khóa biểu trong Round 3. |
| FR-7.3 | University Core System | Khi được công bố, hệ thống phải nhận kết quả đăng ký cuối cùng của sinh viên cho học kỳ tiếp theo. |
| FR-7.4 | System | Trước khi có kết quả cuối cùng, hệ thống chỉ được đề xuất bổ sung các môn đang còn khả dụng, thỏa eligibility chính thức và không tạo xung đột lịch đã biết. |
| FR-7.5 | System | Hệ thống phải ghi rõ rằng trạng thái chỗ trống trong Round 3 có thể thay đổi cho đến khi hệ thống trường xác nhận kết quả đăng ký. |
| FR-7.6 | System | Hệ thống phải sử dụng kết quả đăng ký cuối cùng do University Core System cung cấp làm nguồn chính thức cho học kỳ tiếp theo. |
| FR-7.7 | System | Sau khi có kết quả cuối cùng, hệ thống phải chuyển các môn đăng ký thành công sang trạng thái `officially_enrolled` và khóa chúng vào học kỳ tương ứng. |
| FR-7.8 | System | Hệ thống phải phân biệt các môn sinh viên từng dự định đăng ký với các môn thực sự đăng ký thành công. |
| FR-7.9 | System | Hệ thống phải so sánh kết quả đăng ký cuối cùng với active plan và phương án Round 2 gần nhất. |
| FR-7.10 | System | Hệ thống phải replan các học kỳ sau dựa trên tập môn đã đăng ký thành công. |
| FR-7.11 | System | Hệ thống phải cho biết kết quả cuối cùng làm thay đổi tải tín chỉ, thứ tự môn hoặc học kỳ hoàn thành dự kiến như thế nào. |
| FR-7.12 | System | Hệ thống phải lưu kết quả Round 3 và lộ trình sau replanning thành một plan version mới. |
| FR-7.13 | Student | Sinh viên phải có thể xem timeline đã cập nhật, trong đó kỳ sắp tới phản ánh kết quả đăng ký chính thức. |
| FR-7.14 | System | Planning Module không được tự đăng ký bổ sung hoặc thay đổi kết quả đăng ký chính thức trong Round 3. |

## FR-8. General Replanning

| ID | Actor | Functional Requirement |
|---|---|---|
| FR-8.1 | System | Hệ thống phải hỗ trợ replanning khi Student Academic Snapshot, registration result, course offering, timetable hoặc lựa chọn what-if của sinh viên thay đổi. |
| FR-8.2 | System | Trước khi replan, hệ thống phải lấy các snapshot mới nhất hiện có và kiểm tra tính nhất quán của chúng. |
| FR-8.3 | System | Khi snapshot mới làm thay đổi dữ kiện được active plan sử dụng, hệ thống phải đánh dấu active plan là `stale` và ghi nhận nguyên nhân. |
| FR-8.4 | Student | Sinh viên phải có thể yêu cầu replan một active plan đã bị đánh dấu stale hoặc một registration draft do mình lựa chọn. |
| FR-8.5 | System | Replanning phải giữ nguyên các học kỳ đã hoàn thành và các dữ kiện chính thức đã xảy ra. |
| FR-8.6 | System | Replanning phải khóa các môn `officially_enrolled` vào học kỳ đã được hệ thống trường xác nhận. |
| FR-8.7 | System | Các lựa chọn tương lai trong active plan còn hợp lệ phải được giữ lại theo stability policy khi có thể. |
| FR-8.8 | System | Hệ thống phải giảm số môn bị đổi kỳ hoặc bị thay thế không cần thiết so với plan version trước. |
| FR-8.9 | System | Nếu một lựa chọn cũ không còn hợp lệ, hệ thống phải được phép bỏ khóa lựa chọn đó và ghi rõ dữ liệu hoặc ràng buộc gây ra thay đổi. |
| FR-8.10 | System | Replanning chỉ được sinh lại phần tương lai bắt đầu từ kỳ chưa được khóa gần nhất. |
| FR-8.11 | System | Kết quả replanning phải đi qua cùng hard constraints, selection policy và diversity criteria như initial planning. |
| FR-8.12 | System | Hệ thống phải trả về các representative path mới và không được âm thầm ghi đè plan version cũ. |
| FR-8.13 | Student | Sinh viên phải có thể chọn một path mới làm active plan sau khi xem kết quả replanning. |
| FR-8.14 | System | Nếu không còn lộ trình khả thi với các dữ kiện đã khóa, hệ thống phải thông báo infeasible và xác định các ràng buộc hoặc lựa chọn gây xung đột. |
| FR-8.15 | System | Khi không thể hoàn thành trong kỳ 8, hệ thống phải hiển thị học kỳ hoàn thành sớm nhất tìm được hoặc cho biết không tìm thấy phương án trong giới hạn giải hiện tại. |
| FR-8.16 | System | Với cùng input snapshots, constraint model, selection policy và solver configuration, hệ thống phải tạo kết quả có thể tái lập theo deterministic tie-break đã cấu hình. |

## FR-9. Explanations and Plan Version History

| ID | Actor | Functional Requirement |
|---|---|---|
| FR-9.1 | System | Với mỗi môn được recommendation, hệ thống phải chỉ ra requirement mà môn đó đóng góp và các quan hệ học vụ liên quan đến vị trí của môn trong path. |
| FR-9.2 | System | Hệ thống phải giải thích vì sao một môn được xếp vào kỳ hiện tại thay vì kỳ khác khi quyết định đó xuất phát từ hard constraint hoặc selection policy. |
| FR-9.3 | System | Với mỗi representative path, hệ thống phải hiển thị objective profile, metric, assumption và trade-off làm cơ sở cho việc chọn path. |
| FR-9.4 | System | Nếu một representative được chọn bằng deterministic tie-break giữa các candidate đồng hạng, hệ thống phải nói rõ các candidate đó tương đương theo policy hiện tại. |
| FR-9.5 | System | Khi một môn bị từ chối hoặc bị loại trong quá trình đăng ký, hệ thống phải hiển thị lý do chính thức do University Core System cung cấp nếu lý do đó có sẵn. |
| FR-9.6 | System | Khi một môn bị thay đổi do course offering, sĩ số hoặc timetable, hệ thống phải chỉ ra snapshot change gây ra thay đổi. |
| FR-9.7 | System | Khi replan, hệ thống phải giải thích các môn được giữ nguyên, chuyển kỳ, thay thế hoặc loại bỏ. |
| FR-9.8 | System | Khi không có path khả thi, hệ thống phải chỉ ra các ràng buộc hoặc dữ kiện đã khóa liên quan đến tình trạng infeasible. |
| FR-9.9 | System | Hệ thống phải hiển thị rõ assumption và uncertainty, đặc biệt khi course offering hoặc timetable tương lai chưa được công bố. |
| FR-9.10 | System | Mỗi explanation phải dựa trên rule, constraint, selection policy, solver evidence hoặc dữ liệu chính thức đã được lưu; hệ thống không được tạo lý do không có trong evidence. |
| FR-9.11 | System | Hệ thống phải lưu mỗi kết quả initial planning hoặc replanning thành một plan version bất biến. |
| FR-9.12 | System | Mỗi plan version phải lưu thời điểm tạo, registration round, input snapshot versions, constraint model version, selection policy version, assumptions và warnings. |
| FR-9.13 | Student | Sinh viên phải có thể xem danh sách các plan version của mình và xác định version đang active. |
| FR-9.14 | Student | Sinh viên phải có thể so sánh hai plan version theo môn ở từng kỳ, tải tín chỉ, học kỳ hoàn thành và nguyên nhân thay đổi. |
| FR-9.15 | System | Giao diện phải phân biệt dữ kiện chính thức của trường, system recommendation, Student-selected assumption và dữ liệu chưa được xác nhận. |

## FR-10. Data Synchronization Operations

| ID | Actor | Functional Requirement |
|---|---|---|
| FR-10.1 | System Admin | Admin phải có thể khởi tạo một lần đồng bộ dữ liệu chỉ đọc từ University Core System. |
| FR-10.2 | System Admin | Admin phải có thể chọn phạm vi dữ liệu được hỗ trợ để đồng bộ, gồm curriculum, academic snapshot, registration data, course offering và timetable. |
| FR-10.3 | System | Hệ thống phải kiểm tra schema, trường bắt buộc, reference và tính nhất quán của dữ liệu nhận được trước khi công bố snapshot. |
| FR-10.4 | System | Mỗi lần đồng bộ thành công phải tạo snapshot có source, version, thời điểm lấy và trạng thái kiểm tra. |
| FR-10.5 | System | Một lần đồng bộ thất bại không được ghi đè snapshot hợp lệ gần nhất. |
| FR-10.6 | System Admin | Admin phải có thể xem trạng thái đang chạy, thành công hoặc thất bại của từng lần đồng bộ. |
| FR-10.7 | System Admin | Admin phải có thể xem loại lỗi và phần dữ liệu bị ảnh hưởng mà không làm lộ thông tin sinh viên ngoài phạm vi được phép. |
| FR-10.8 | System Admin | Admin phải có thể yêu cầu thử đồng bộ lại sau một lần thất bại. |
| FR-10.9 | System | Chức năng đồng bộ chỉ được đọc dữ liệu và không được gửi lệnh sửa hoặc xóa dữ liệu chính thức của trường. |
| FR-10.10 | System | Prototype phải cho phép thay University Core System bằng mock adapter tuân theo cùng data contract giả định. |

## 4. Functional exclusions

Degree Path Planning and Replanning Module không thực hiện các chức năng sau:

- Xác thực hoặc quản lý tài khoản sinh viên thay cho cổng trường.
- Gửi lệnh thêm, xóa hoặc xác nhận môn vào hệ thống đăng ký chính thức.
- Thay đổi curriculum, transcript, eligibility, registration result, course offering hoặc timetable chính thức.
- Xếp môn mở, nhóm lớp, phòng, giảng viên hoặc thời khóa biểu cho toàn trường.
- Dự đoán điểm, độ khó môn hoặc khả năng qua môn khi chưa có dataset và mô hình được xác minh.
- Dùng planning guide hoặc học kỳ khuyến nghị làm input bắt buộc để sinh path.
- Tuyên bố dữ liệu mock là dữ liệu thật hoặc API thật của trường.




