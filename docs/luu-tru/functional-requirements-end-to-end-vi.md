# Yêu cầu chức năng đầu cuối

## 1. Mục đích và ranh giới hệ thống

Hệ thống là dịch vụ hỗ trợ ra quyết định trong việc lập và cập nhật lộ trình học tập cho một chương trình đào tạo được hỗ trợ. Hệ thống đọc dữ liệu từ nhà trường, đánh giá các quy định của chương trình đào tạo, sinh một số lộ trình đại diện, hỗ trợ sinh viên thử các lựa chọn giả định và lập lại phần lộ trình tương lai khi kết quả học tập hoặc thông tin mở môn thay đổi.

Hệ thống sinh lộ trình từ chương trình đào tạo chính thức, không phụ thuộc vào kế hoạch giảng dạy được lập thủ công. Kế hoạch giảng dạy hoặc học kỳ khuyến nghị chỉ có thể được dùng làm baseline đánh giá bên ngoài và không được ảnh hưởng đến quá trình sinh hoặc xếp hạng lộ trình. Hệ thống không thực hiện giao dịch đăng ký môn chính thức, không xếp thời khóa biểu cho toàn trường và không sửa dữ liệu học vụ chính thức.

### Luồng dữ liệu đầu vào

```text
Nhà cung cấp dữ liệu trường hoặc nhà cung cấp dữ liệu giả lập
  -> snapshot chương trình đào tạo
  -> snapshot tiến độ học tập của sinh viên
  -> snapshot đăng ký hiện tại
  -> snapshot mở môn và lịch học của các nhóm lớp
  -> chuẩn hóa và kiểm tra dữ liệu
  -> mô hình luật và ràng buộc
  -> sinh candidate và chọn các lộ trình đại diện
  -> giải thích và giao diện lập kế hoạch cho sinh viên
```

### Đầu ra đầu cuối

- Tiến độ hiện tại, các yêu cầu còn thiếu và điều kiện học môn.
- Tối đa một số lượng lộ trình đầy đủ, có tính đại diện, theo cấu hình.
- Các môn của kỳ đăng ký tiếp theo được suy ra từ từng lộ trình.
- Giả định, mức khả thi, metric, cảnh báo và lời giải thích.
- Lộ trình tương lai được lập lại sau quyết định của sinh viên hoặc thay đổi dữ liệu nguồn.
- Các phiên bản lộ trình bất biến và nội dung so sánh giữa các phiên bản.

## 2. FR-1. Tài khoản và quyền truy cập

| ID | Vai trò | Yêu cầu |
|---|---|---|
| FR-1.1 | Người dùng / Hệ thống | Trong prototype, hệ thống phải cho phép người dùng giả lập tạo tài khoản bằng địa chỉ email và mật khẩu; tài khoản mới được gán vai trò Sinh viên. Khi tích hợp thực tế với nhà trường, tài khoản Sinh viên phải được liên kết với danh tính sinh viên chính thức trước khi dữ liệu học tập được cung cấp. |
| FR-1.2 | Người dùng | Người dùng phải có thể đăng nhập và đăng xuất khỏi tài khoản. |
| FR-1.3 | Hệ thống | Hệ thống chỉ cho phép người dùng đã xác thực truy cập các chức năng được bảo vệ và phải giới hạn quyền truy cập theo vai trò và quyền sở hữu dữ liệu. |
| FR-1.4 | Hệ thống | Hệ thống chỉ cấp quyền Admin hoặc Cố vấn học tập cho tài khoản được ủy quyền; người dùng không được tự nâng quyền của mình. |

## 3. FR-2. Tiếp nhận và kiểm tra chất lượng dữ liệu trường

| ID | Vai trò | Yêu cầu |
|---|---|---|
| FR-2.1 | Hệ thống | Hệ thống phải nhận snapshot có phiên bản của chương trình đào tạo, tiến độ học tập, đăng ký hiện tại và tình trạng mở môn thông qua giao diện Nhà cung cấp dữ liệu trường. Hợp đồng dữ liệu phải xác định học kỳ bắt đầu chương trình, học kỳ hiện tại, học kỳ đang cần đăng ký và học kỳ của từng lần học hoặc đăng ký môn. |
| FR-2.2 | Hệ thống | Khi dữ liệu tồn tại, hệ thống phải nhận thời gian học của các nhóm lớp và tình trạng đăng ký liên quan thông qua cùng ranh giới nhà cung cấp để kiểm tra xung đột lịch học. |
| FR-2.3 | Hệ thống | Prototype phải hỗ trợ Nhà cung cấp dữ liệu trường giả lập, tuân theo cùng hợp đồng dữ liệu chuẩn khi chưa có API hoặc data warehouse thật của nhà trường. |
| FR-2.4 | Hệ thống | Hệ thống phải xem dữ liệu từ nhà cung cấp là dữ liệu nguồn chỉ đọc, chuẩn hóa các trường dữ liệu riêng của từng nguồn và lưu nguồn, phiên bản, thời điểm truy xuất cùng độ mới của mỗi snapshot. |
| FR-2.5 | Hệ thống | Trước khi lập kế hoạch, hệ thống phải kiểm tra schema, tham chiếu giữa các thực thể, đối soát tổng tín chỉ, tính nhất quán của luật, chu trình tiên quyết, tính nhất quán của trạng thái sinh viên và khả năng tương thích giữa các snapshot. |
| FR-2.6 | Hệ thống | Hệ thống phải phân loại vấn đề dữ liệu thành cảnh báo hoặc lỗi chặn; lỗi chặn phải ngăn kết quả được trình bày như một lộ trình hợp lệ về học vụ. |
| FR-2.7 | Hệ thống | Hệ thống phải hỗ trợ cơ chế cập nhật theo cấu hình để phát hiện snapshot mở môn hoặc nhóm lớp mới, xác định active plan bị ảnh hưởng, đánh dấu plan đã cũ và thông báo cho sinh viên rằng có thể lập lại lộ trình. |

## 4. FR-3. Trạng thái học tập và mô hình chương trình đào tạo

| ID | Vai trò | Yêu cầu |
|---|---|---|
| FR-3.1 | Sinh viên | Sinh viên phải có thể xem hồ sơ, phiên bản chương trình đào tạo áp dụng, số tín chỉ đã hoàn thành, đăng ký hiện tại và các yêu cầu còn thiếu. |
| FR-3.2 | Sinh viên | Sinh viên phải có thể xem, tìm kiếm và lọc môn học, yêu cầu bắt buộc, nhóm tự chọn và điều kiện tốt nghiệp trong chương trình đào tạo áp dụng. |
| FR-3.3 | Hệ thống | Hệ thống phải phân biệt tối thiểu các trạng thái `not_started`, `passed`, `failed`, `in_progress` và `enrolled`; đồng thời phân biệt dữ kiện chính thức với dữ liệu lập kế hoạch `selected`, `self_reported` và `plan_assigned`. |
| FR-3.4 | Hệ thống | Mô hình chương trình đào tạo phải biểu diễn môn bắt buộc, ngưỡng tín chỉ tự chọn và tự chọn tự do, tổng tín chỉ, quan hệ tiên quyết, học trước, song hành, quan hệ khuyến nghị học trước như `KN`, luật AND/OR phức hợp và việc phân bổ tín chỉ loại trừ lẫn nhau. Chương trình được hỗ trợ phải xác định rõ mỗi quan hệ là ràng buộc cứng hay ưu tiên mềm. |
| FR-3.5 | Hệ thống | Khi có trong dữ liệu chính thức, mô hình luật phải hỗ trợ các điều kiện đã được xác minh như ngưỡng tín chỉ tích lũy, tình trạng học vụ, năm hoặc trình độ học, giới hạn tín chỉ theo GPA, điều kiện ngoại ngữ, thực tập và đồ án tốt nghiệp. |
| FR-3.6 | Hệ thống | Hệ thống phải xử lý lần học không đạt và học lại theo luật đã cấu hình, không được tính tín chỉ đạt nhiều lần và không được đề xuất học lại môn đã đạt trừ khi có luật học lại cho phép. |
| FR-3.7 | Hệ thống | Môn đang học không được xem là đã đạt trong trạng thái thực tế hiện tại. Khi lập kế hoạch tương lai, nhánh giả định sinh viên sẽ đạt phải được gắn nhãn là giả định và được đánh giá lại khi có kết quả chính thức. |

## 5. FR-4. Phân tích điều kiện học và yêu cầu chương trình

| ID | Vai trò | Yêu cầu |
|---|---|---|
| FR-4.1 | Sinh viên | Sinh viên phải có thể yêu cầu phân tích dựa trên trạng thái học tập hiện tại và phiên bản chương trình đào tạo áp dụng. |
| FR-4.2 | Hệ thống | Hệ thống phải xác định điều kiện hiện tại của từng môn chưa hoàn thành đã được đáp ứng hay chưa và chỉ ra các điều kiện làm cơ sở cho kết luận. |
| FR-4.3 | Hệ thống | Hệ thống phải xác định các môn bắt buộc, ngưỡng nhóm tự chọn, tổng tín chỉ và các điều kiện tốt nghiệp khác chưa hoàn thành. |
| FR-4.4 | Sinh viên / Hệ thống | Sinh viên phải có thể gửi một tập môn dự kiến; hệ thống phải kiểm tra điều kiện học, tải tín chỉ, tính trùng tín chỉ, khả năng mở môn và xung đột thời khóa biểu khi có đủ dữ liệu cần thiết. |
| FR-4.5 | Hệ thống | Hệ thống phải lưu mỗi kết quả phân tích cùng phiên bản chương trình đào tạo, trạng thái sinh viên, đăng ký, mở môn, lịch học và bộ luật được dùng để tạo kết quả. |

## 6. FR-5. Sinh và lựa chọn lộ trình học đầy đủ

| ID | Vai trò | Yêu cầu |
|---|---|---|
| FR-5.1 | Sinh viên | Sinh viên phải có thể yêu cầu các lộ trình đầy đủ từ trạng thái học tập hiện tại đến khi hoàn thành chương trình đào tạo. |
| FR-5.2 | Hệ thống | Hệ thống phải hiển thị timeline đầy đủ tám học kỳ tính từ khi bắt đầu chương trình: các kỳ đã hoàn thành là lịch sử cố định, kỳ hiện tại chứa môn đang học hoặc đã đăng ký và chỉ các kỳ còn lại mới do hệ thống sinh. Hệ thống không được giả định có kỳ hè trừ khi kỳ hè được cấu hình rõ ràng. |
| FR-5.3 | Hệ thống | Hệ thống phải sinh lộ trình từ yêu cầu chương trình, trạng thái sinh viên, chính sách tín chỉ, quan hệ học vụ và dữ liệu mở môn hiện có; không được dùng kế hoạch giảng dạy, học kỳ khuyến nghị hoặc thứ tự mã môn làm ưu tiên học vụ. |
| FR-5.4 | Hệ thống | Mọi lộ trình khả thi về học vụ phải thỏa toàn bộ ràng buộc cứng trong tất cả học kỳ. Mỗi môn được xếp phải đáp ứng một yêu cầu chưa hoàn thành hoặc được đánh dấu rõ là môn học thêm được chính sách cho phép. |
| FR-5.5 | Hệ thống | Hệ thống phải phân biệt khả thi về học vụ với khả thi về vận hành. Lộ trình sử dụng thông tin mở môn tương lai chưa biết phải được ghi là khả thi theo các giả định đã nêu; chỉ học kỳ có dữ liệu mở môn và nhóm lớp tương thích đã xác nhận mới được ghi là đã xác nhận về vận hành. |
| FR-5.6 | Hệ thống | Hệ thống chỉ được trả về tối đa top-k lộ trình đại diện theo cấu hình, thông thường từ ba đến năm; đồng thời phải cho biết có tìm thấy candidate khác hay không và tổng số lộ trình khả thi chính xác có được tính hay không. |
| FR-5.7 | Hệ thống | Các candidate gần như trùng nhau phải được gom bằng độ đo và ngưỡng diversity có phiên bản, dựa trên các chiều như tập môn tự chọn, học kỳ được xếp, phân bố tải tín chỉ và học kỳ hoàn thành. |
| FR-5.8 | Hệ thống | Các lộ trình đại diện phải được chọn bằng selection policy rõ ràng, có phiên bản và lưu lại tiêu chí, thứ tự ưu tiên cùng nguồn của input. Tiêu chí có thể gồm hoàn thành đúng hạn, độ ổn định, cân bằng tín chỉ, giá trị mở khóa môn sau và sở thích tự chọn do sinh viên khai báo. Hệ thống không được dùng dự đoán độ khó hoặc khả năng thành công nếu chưa có dataset được phê duyệt và mô hình được đánh giá riêng. |
| FR-5.9 | Hệ thống | Nếu các candidate vẫn đồng hạng theo mọi tiêu chí được hỗ trợ, hệ thống có thể dùng mã môn hoặc một định danh ổn định khác làm tie-break cuối cùng có tính xác định; tie-break này không được giải thích như bằng chứng rằng lộ trình có chất lượng cao hơn. |
| FR-5.10 | Hệ thống | Nếu khi sinh lần đầu không có lộ trình hoàn thành trước hết kỳ 8, hệ thống phải thông báo kết quả đó, chạy một lần giải riêng để tìm học kỳ hoàn thành sớm nhất và hiển thị kỳ 9 trở đi như phần mở rộng rõ ràng của horizon chuẩn. |

## 7. FR-6. Lập kế hoạch cá nhân và lựa chọn giả định

| ID | Vai trò | Yêu cầu |
|---|---|---|
| FR-6.1 | Sinh viên | Sinh viên phải có thể xem các môn của kỳ đăng ký tiếp theo, tổng tín chỉ dự kiến, các giả định và lý do liên quan trong từng lộ trình đầy đủ được hiển thị. |
| FR-6.2 | Sinh viên | Sinh viên phải có thể chọn một lộ trình được hiển thị làm active plan cá nhân. |
| FR-6.3 | Sinh viên | Sinh viên phải có thể tạo bản nháp cho kỳ tiếp theo bằng cách thêm hoặc bỏ môn, kể cả khi bản nháp không trùng với bất kỳ lộ trình đã sinh nào. |
| FR-6.4 | Sinh viên / Hệ thống | Trước khi bản nháp được xác nhận làm input lập kế hoạch, hệ thống phải trình bày các môn, giả định, cảnh báo, vi phạm điều kiện học, giới hạn mở môn và xung đột lịch đã biết để sinh viên kiểm tra. |
| FR-6.5 | Hệ thống | Với yêu cầu what-if hợp lệ, hệ thống phải khóa kỳ đăng ký được đề xuất như một giả định của sinh viên và sinh lại các lộ trình đại diện cho những kỳ sau. Recommendation, active plan hoặc bản nháp không được trình bày như giao dịch đăng ký chính thức. |
| FR-6.6 | Sinh viên | Sinh viên phải có thể xem và thay đổi các planning preference được hỗ trợ, chẳng hạn sở thích môn tự chọn hoặc khoảng tín chỉ mong muốn; hệ thống phải lưu preference đã khai báo nào ảnh hưởng đến việc chọn lộ trình. |

## 8. FR-7. Mở môn, thời khóa biểu và lập lại lộ trình

| ID | Vai trò | Yêu cầu |
|---|---|---|
| FR-7.1 | Hệ thống | Hệ thống phải phân biệt các trạng thái mở môn hiện có như `unknown`, `planned`, `confirmed`, `at_risk`, `cancelled`, `full` và `not_offered`; đồng thời hiển thị snapshot hoặc giai đoạn công bố làm cơ sở cho trạng thái. |
| FR-7.2 | Hệ thống | Trong giai đoạn đăng ký sớm, hệ thống chỉ được dùng thông tin mở môn tương lai chưa biết như giả định được hiển thị rõ. Khi lịch nhóm lớp có sẵn, hệ thống phải phát hiện xung đột môn và nhóm lớp nhưng không tự tạo thời khóa biểu cho nhà trường. |
| FR-7.3 | Sinh viên / Hệ thống | Sinh viên phải có thể yêu cầu snapshot mới nhất. Hệ thống phải so sánh với phiên bản được active plan sử dụng, đánh dấu plan đã cũ khi input quan trọng thay đổi, chỉ ra thay đổi gây ảnh hưởng và cung cấp hành động lập lại lộ trình. |
| FR-7.4 | Hệ thống | Việc lập lại lộ trình phải hỗ trợ thay đổi về kết quả đạt hoặc rớt chính thức, đăng ký hiện tại, quyết định của sinh viên, tình trạng mở môn và lịch nhóm lớp. |
| FR-7.5 | Hệ thống | Khi lập lại, hệ thống phải giữ lịch sử đã hoàn thành và dữ kiện hiện tại đã xác nhận, giữ các quyết định tương lai đã chấp nhận nếu chúng vẫn hợp lệ và giảm các thay đổi không cần thiết theo stability policy có phiên bản. |
| FR-7.6 | Hệ thống | Khi môn bị hủy, đầy, không mở hoặc không thể xếp lịch, hệ thống phải tìm môn thay thế hợp lệ hoặc chuyển môn sang kỳ sau và cho biết thời điểm hoàn thành hoặc kết quả quan trọng khác có thay đổi hay không. |
| FR-7.7 | Hệ thống | Nếu không còn phần tiếp nối hợp lệ, hệ thống không được bỏ qua luật học vụ cứng. Hệ thống phải trả về lời giải thích không khả thi và có thể cung cấp kịch bản hoàn thành sớm nhất hoặc sửa đổi tối thiểu; kịch bản này phải được ghi rõ là phương án sửa chữa, không phải lộ trình hiện tại hợp lệ. |

## 9. FR-8. Giải thích và lịch sử lộ trình

| ID | Vai trò | Yêu cầu |
|---|---|---|
| FR-8.1 | Hệ thống | Hệ thống phải giải thích vì sao một môn đủ hoặc chưa đủ điều kiện, môn đó đáp ứng yêu cầu nào, mở khóa yêu cầu nào về sau và vì sao được xếp vào một học kỳ cụ thể khi có bằng chứng từ luật hoặc policy. |
| FR-8.2 | Hệ thống | Hệ thống phải giải thích vì sao mỗi lộ trình hiển thị được chọn làm đại diện, trình bày các đánh đổi đo được và nói rõ khi tie-break có tính xác định đã chọn giữa các candidate đồng hạng theo policy. |
| FR-8.3 | Hệ thống | Khi không có lộ trình khả thi, hệ thống phải xác định các điều kiện xung đột liên quan và giải thích kết quả hoàn thành sớm nhất hoặc sửa đổi tối thiểu nếu có. |
| FR-8.4 | Hệ thống | Lời giải thích phải được tạo từ bằng chứng có cấu trúc của luật, ràng buộc, policy và solver. Mô hình ngôn ngữ tùy chọn chỉ được diễn đạt lại bằng chứng và không được tự tạo dữ kiện học vụ hoặc kết luận của solver. |
| FR-8.5 | Hệ thống | Hệ thống phải lưu lộ trình đã sinh và đã xác nhận thành các phiên bản bất biến, xác định một phiên bản active và lưu snapshot đầu vào, phiên bản policy, giả định, metric cùng cảnh báo được dùng để tạo mỗi phiên bản. |
| FR-8.6 | Sinh viên | Sinh viên phải có thể xem lịch sử và so sánh hai phiên bản theo môn ở từng kỳ, tải tín chỉ, môn tự chọn, kết quả hoàn thành và thay đổi input gây ra việc lập lại. |
| FR-8.7 | Hệ thống | Trong lưu trữ và giao diện, hệ thống phải phân biệt rõ dữ kiện chính thức của trường, recommendation của hệ thống, quyết định đã xác nhận của sinh viên, dữ liệu sinh viên tự khai và giả định chưa được giải quyết. |

## 10. FR-9. Quản trị và hỗ trợ cố vấn học tập

| ID | Vai trò | Yêu cầu |
|---|---|---|
| FR-9.1 | Admin | Admin phải có thể kiểm tra trạng thái đồng bộ, độ mới snapshot, kết quả kiểm tra dữ liệu, mapping chưa giải quyết và lỗi đối soát chương trình đào tạo mà không sửa dữ liệu chính thức của nhà trường. |
| FR-9.2 | Admin | Trong prototype, Admin phải có thể thay đổi trạng thái mở môn hoặc nhóm lớp trong dữ liệu giả lập để minh họa việc phát hiện plan đã cũ và lập lại lộ trình; hệ thống phải ghi rõ các thay đổi này là dữ liệu mô phỏng. |
| FR-9.3 | Admin | Admin phải có thể định nghĩa, kích hoạt và quản lý phiên bản selection policy được hỗ trợ, bao gồm các tiêu chí được phép và thứ tự ưu tiên; hệ thống phải lưu phiên bản policy được dùng cho mỗi lộ trình đã sinh. |
| FR-9.4 | Cố vấn học tập / Hệ thống | Khi vai trò Cố vấn học tập được bật, cố vấn được ủy quyền phải có thể xem tiến độ, active plan, cảnh báo và lời giải thích của sinh viên được phân công, đồng thời chạy kịch bản what-if không ràng buộc mà không sửa dữ liệu chính thức hoặc active plan của sinh viên. |

## 11. Các chức năng nằm ngoài phạm vi

Hệ thống hiện tại không được:

- Gửi lệnh thêm, hủy hoặc đăng ký môn đến hệ thống đăng ký chính thức.
- Thay thế hệ thống đăng ký môn chính thức của nhà trường.
- Xếp lớp, phòng, giảng viên hoặc thời khóa biểu cho toàn trường.
- Dự đoán điểm, độ khó môn học hoặc khả năng qua môn khi chưa có dataset được phê duyệt và mô hình được đánh giá riêng.
- Tối ưu việc phân bổ môn đồng thời cho toàn bộ sinh viên.
- Dùng kế hoạch giảng dạy thủ công hoặc học kỳ khuyến nghị làm input lập kế hoạch.
- Âm thầm sửa dữ liệu nguồn không nhất quán hoặc trình bày dữ liệu giả lập như dữ liệu chính thức.

