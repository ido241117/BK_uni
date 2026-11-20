# Context cho Codex — JSON → ASP → Clingo trong bài toán lập kế hoạch học tập

Cập nhật: 2026-11-05, múi giờ Asia/Saigon.

## 1. Quyết định mới nhất của người dùng

Ưu tiên hiện tại: làm một phiên bản chạy end-to-end từ JSON đến kết quả Clingo trước. Trong quá trình đó, ghi nhận các vấn đề về định nghĩa dữ liệu, bảo toàn ngữ nghĩa và kiểm tra mô hình. Sau khi có hệ thống và ví dụ chạy được mới quyết định có đào sâu thành câu hỏi nghiên cứu hay chuyển sang bước tiếp theo của pipeline.

Người dùng muốn khảo sát khả năng:

- Đo xem cách định nghĩa/biểu diễn có gây sai ngữ nghĩa hay không, sai ở đâu và mức độ nào.
- Xây dựng cách kiểm tra dữ liệu hoặc mô hình trước khi đưa vào solver.
- Chỉ theo đuổi hướng nghiên cứu này nếu có vấn đề thực tế và bằng chứng đáng kể.

Đây là quyết định triển khai trước, khảo sát nghiên cứu có điều kiện. Chưa chốt một claim, thuật toán nghiên cứu, schema hoàn chỉnh hay đóng góp đủ cho paper Q2.

Yêu cầu của lượt tạo tài liệu này chỉ là lưu context; không phải bắt đầu triển khai hệ thống ngay.

## 2. Bài toán và mục tiêu dài hạn

Nhóm đang tìm hiểu hệ thống suy luận về quy chế và lập kế hoạch học tập bằng Answer Set Programming (ASP), dùng Clingo. Nhóm đã thống nhất sử dụng JSON làm đầu vào.

Ý tưởng rộng ban đầu gồm quy chế nhà trường, tiến độ học tập, ràng buộc/ưu tiên cá nhân do sinh viên cung cấp, cập nhật kết quả học tập và kịch bản what-if. Người dùng từng nhắc biểu diễn `(x,t,s,m)`, nhưng ngữ nghĩa cụ thể của bộ này chưa được chốt trong phần trao đổi hiện có; không tự gán nghĩa cho các ký hiệu.

Người dùng có mục tiêu dài hạn tìm hướng nghiên cứu có khả năng phát triển thành paper Q2, nhưng đã yêu cầu không cố bảo vệ claim ban đầu. Cần xác định vấn đề, phương pháp hiện có, hạn chế, dữ liệu, baseline và cách đánh giá trước khi tuyên bố novelty.

## 3. Mức độ hiểu hiện tại và cách trao đổi phù hợp

Người dùng đang xây dựng hiểu biết nền tảng về predicate, facts, exporter, ASP và Python API của Clingo. Đã cần giải thích nhiều lần bằng một ví dụ nhỏ xuyên suốt.

- Trao đổi bằng tiếng Việt, trực tiếp và cụ thể.
- Khi đưa khái niệm mới, giải thích vai trò bằng input → xử lý → output.
- Tách rõ việc thư viện làm sẵn và phần nhóm phải tự thiết kế.
- Tránh dồn nhiều thuật ngữ hoặc mở quá nhiều hướng nghiên cứu trước khi có bản chạy được.
- Không mặc định việc người dùng chưa biết triển khai một bước là bằng chứng có research gap ở bước đó.

## 4. Những khái niệm đã làm rõ

### JSON

JSON là định dạng dữ liệu. JSON đúng cú pháp chưa đảm bảo dữ liệu đúng quy chế, đủ thông tin hoặc đủ rõ nghĩa để lập kế hoạch.

### Predicate và fact

Predicate là ký hiệu biểu diễn thuộc tính/quan hệ trong ASP. Ví dụ `credit/2` nhận mã môn và số tín chỉ. `credit("CO2003",4).` là một fact cụ thể dùng predicate đó.

Nhóm phải thống nhất tên, số lượng/thứ tự đối số, kiểu dữ liệu và ý nghĩa. Predicate cũng có thể biểu diễn thông tin suy ra hoặc lựa chọn cần tìm, không chỉ dữ liệu nhập.

### Exporter / mapper

Là đoạn Python do nhóm viết để chuyển JSON đã được kiểm tra sang facts hoặc cấu trúc ASP theo ánh xạ đã định nghĩa. Nó có thể trả về chuỗi ASP trong bộ nhớ hoặc ghi ra file `.lp`.

Exporter không tự hiểu quy chế và không tự phát minh logic học vụ. Python API không thay thế việc thiết kế phép ánh xạ này.

### ASP và Clingo

ASP là ngôn ngữ/phương pháp biểu diễn dữ liệu, lựa chọn, luật suy diễn, ràng buộc và mục tiêu tối ưu. Clingo là công cụ grounding và giải chương trình ASP.

Python có thể đọc JSON, tạo facts, nạp encoding chung, gọi `ground()` rồi `solve()`. Không bắt buộc tạo file `.lp` trung gian. Cần dùng tài liệu API đúng phiên bản cài trong dự án.

## 5. Pipeline cơ sở dự kiến

```text
Nguồn quy chế + dữ liệu chương trình + hồ sơ/kịch bản sinh viên
    ↓ chuẩn hóa và xác minh theo phạm vi đã chọn
JSON
    ↓ kiểm tra cấu trúc và tính nhất quán dữ liệu
JSON được chấp nhận để lập kế hoạch
    ↓ exporter/mapper
Facts ASP + encoding học vụ dùng chung
    ↓ grounding
Chương trình đã ground
    ↓ solving
Nghiệm và trạng thái giải
    ↓ giải mã và kiểm tra kế hoạch
Kết quả học vụ có phạm vi, giả định và trạng thái rõ ràng
```

Nếu đầu vào ban đầu được tạo thủ công và đã xác minh, chưa cần làm bài toán tự động đọc PDF/web hoặc dùng LLM trích xuất. Không tự thêm LLM vào pipeline.

Với bài toán tự tìm kế hoạch, mô hình cần phân biệt:

1. Dữ liệu đã biết.
2. Lựa chọn môn/kỳ cần solver tìm.
3. Luật suy diễn các điều kiện.
4. Ràng buộc bắt buộc.
5. Điều kiện hoàn thành mục tiêu lập kế hoạch.
6. Mục tiêu tối ưu nếu thực sự cần trong phạm vi đầu tiên.

Chỉ có các điều cấm có thể khiến kế hoạch rỗng trở thành nghiệm. Phải xác định rõ đang kiểm tra kế hoạch có sẵn hay tự tìm kế hoạch hoàn thành chương trình.

## 6. Hợp đồng ngữ nghĩa cần thống nhất

Mỗi loại dữ liệu/quy định nên có: nguồn, phạm vi áp dụng, ý nghĩa, cấu trúc JSON, predicate tương ứng, ví dụ hợp lệ/không hợp lệ và cách xử lý thiếu thông tin.

Các vấn đề đã nhận diện:

| Vấn đề | Điều cần chốt |
|---|---|
| Phiên bản | Chương trình, khóa tuyển sinh, quy chế áp dụng |
| Định danh | Mã môn chuẩn, thay thế/tương đương, tham chiếu tồn tại |
| Thời gian | Kỳ cụ thể khác với mùa mở môn; trước kỳ khác với cùng kỳ |
| Kết quả học tập | Đã đăng ký, đã thi, đạt môn, công nhận tín chỉ là các trạng thái khác nhau |
| Học lại | Cách chọn kết quả và cách tính tín chỉ phải theo quy định áp dụng |
| Tín chỉ | Tải đăng ký khác với tín chỉ tích lũy và tín chỉ được tính vào từng nhóm yêu cầu |
| AND/OR | Cấu trúc nhóm và cách lồng điều kiện phải được giữ nguyên |
| Thiếu dữ liệu | `[]`, `null`, thiếu trường, không có yêu cầu và chưa biết yêu cầu phải có ý nghĩa rõ |
| Nguồn thông tin | Kết quả chính thức, sinh viên tự khai và giả định what-if phải phân biệt |
| Mâu thuẫn | Không âm thầm chọn một nguồn nếu chưa có quy tắc phân xử |
| Yêu cầu chưa hỗ trợ | Báo rõ thay vì bỏ qua và vẫn tuyên bố kế hoạch hợp lệ đầy đủ |
| Mục tiêu | Hard constraint khác với ưu tiên; ưu tiên không được âm thầm thay thế điều bắt buộc |

JSON Schema có thể kiểm tra cấu trúc và một số điều kiện dữ liệu; không tự xác nhận dữ liệu đúng với quy chế ngoài thực tế.

## 7. Ví dụ ngữ nghĩa dùng xuyên suốt

Theo quy ước đã thảo luận, outer list là AND, inner list là OR:

```json
{
  "id": "CO2003",
  "prerequisites": [["CO1007", "CO1027"], ["CO1005"]]
}
```

Nghĩa dự kiến: `(CO1007 OR CO1027) AND CO1005`, với điều kiện các môn tiên quyết phải đạt trước kỳ học CO2003 nếu quy chế yêu cầu như vậy.

Không được làm phẳng thành ba tiên quyết bắt buộc. Có thể giữ cấu trúc qua facts nhóm:

```prolog
prerequisite_group("CO2003",g1).
prerequisite_option("CO2003",g1,"CO1007").
prerequisite_option("CO2003",g1,"CO1027").
prerequisite_group("CO2003",g2).
prerequisite_option("CO2003",g2,"CO1005").
```

Đây là ví dụ thảo luận, chưa phải schema hoặc encoding chính thức của dự án. Cần đối chiếu dữ liệu/code đang có trước khi áp dụng.

## 8. Các lỗi kỹ thuật/mô hình hóa đã cảnh báo

- Luật suy ra đủ điều kiện từ một tiên quyết đã đạt chỉ kiểm tra tồn tại, không đảm bảo tất cả nhóm bắt buộc đều thỏa.
- Biến chỉ xuất hiện trong literal phủ định có thể gây unsafe variable. Cần ràng buộc miền đúng khi viết luật.
- Số đối số, thứ tự đối số, kiểu string/constant và định danh phải nhất quán.
- Không ghép dữ liệu người dùng thành mã ASP tùy ý; dùng biểu diễn symbol/escape phù hợp và kiểm tra đầu vào.
- Với aggregate, xác định rõ đơn vị được đếm/cộng; tránh mất phần tử do tuple trùng hoặc tính trùng tín chỉ ngoài ý muốn.
- Phải định nghĩa `passed_before` dựa trên kết quả đã xảy ra hay hoàn thành dự kiến. Không âm thầm xem môn dự kiến học là kết quả chính thức.
- Đo riêng grounding và solving; tổ hợp môn × kỳ × sinh viên × yêu cầu có thể làm chương trình ground lớn.
- `SAT` chỉ nói có nghiệm theo mô hình đã đưa vào. Không chứng minh mô hình phản ánh đủ quy chế.
- `UNSAT` trong một horizon hữu hạn không đồng nghĩa sinh viên không bao giờ tốt nghiệp.
- Phân biệt dữ liệu lỗi, quy định chưa hỗ trợ, UNSAT, chưa kết luận/hết thời gian, có nghiệm và đã chứng minh tối ưu.
- Thêm dữ liệu vào một solver đang giữ trạng thái không tự thay thế facts cũ. Với bản đầu, có thể dựng `Control` mới cho mỗi kịch bản để dễ kiểm tra. Chỉ chuyển sang multi-shot khi có nhu cầu và quản lý trạng thái đúng.

## 9. Kế hoạch thực hiện khi người dùng yêu cầu bắt đầu code

Trước hết đọc hướng dẫn dự án và kiểm tra code/dữ liệu hiện có. Chưa kiểm tra nội dung dự án trong phiên tạo context này; không giả định dự án rỗng hoặc được phép thay cấu trúc hiện có.

| Bước | Input | Công việc | Output |
|---|---|---|---|
| 1. Kiểm kê | Repo, JSON mẫu, quy chế và encoding nếu có | Xác định cái đã có và phần thiếu; làm rõ mục tiêu kiểm tra hay tự lập kế hoạch | Bản đồ pipeline hiện tại |
| 2. Chốt phạm vi nhỏ | Một chương trình và các yêu cầu tiêu biểu | Chọn vài loại ràng buộc có nguồn, xác định giả định và giới hạn | Danh mục hỗ trợ và bảng ngữ nghĩa |
| 3. Chuẩn hóa mẫu | Điều khoản và dữ liệu ví dụ | Tạo/điều chỉnh JSON mẫu cùng các kiểm tra cần thiết | Instance chuẩn có thể tái lập |
| 4. Nối solver | JSON chuẩn và logic đã định nghĩa | Hiện thực validator, mapper, encoding, gọi solver và đọc nghiệm | Một luồng end-to-end chạy được |
| 5. Kiểm tra | Tình huống đúng, sai và biên | Đối chiếu với kết quả mong đợi độc lập | Bộ kiểm thử và nhật ký sai lệch |
| 6. Quyết định tiếp | Sai lệch và số đo thực tế | Xác định nút thắt thuộc dữ liệu, ngữ nghĩa, encoding hay hiệu năng | Chốt phần nền hoặc mở nghiên cứu có căn cứ |

Khoảng 20–30 tình huống nhỏ từng được đề xuất cho vòng thăm dò. Đây không phải ngưỡng đủ cho một paper. Ưu tiên chất lượng và độ phủ loại quy định, không chạy theo con số.

## 10. Cách đo độ sai ngữ nghĩa — ứng viên để khảo sát sau

Cần phân biệt hai loại đúng:

1. JSON có phản ánh đúng nguồn quy chế không?
2. ASP có giữ đúng ý nghĩa JSON/đặc tả đã chấp nhận không?

Hai bộ xử lý cùng đọc một JSON thiếu điều khoản có thể cùng sai với thực tế. Bộ kiểm tra độc lập chỉ giúp phát hiện những lớp lỗi mà nó có thông tin để kiểm tra.

Một phép đo ban đầu khả thi: trên một tập kế hoạch ứng viên có nhãn chuẩn, so sánh quyết định hợp lệ/không hợp lệ của mô hình với đánh giá chuẩn.

- Chấp nhận sai: mô hình chấp nhận một kế hoạch mà chuẩn đánh giá là không hợp lệ.
- Loại sai: mô hình loại một kế hoạch mà chuẩn đánh giá là hợp lệ.
- Tỷ lệ chấp nhận sai: số chấp nhận sai / số kế hoạch không hợp lệ theo chuẩn trong tập đánh giá.
- Tỷ lệ loại sai: số loại sai / số kế hoạch hợp lệ theo chuẩn trong tập đánh giá.
- Báo riêng số trường hợp chưa xác minh được, lỗi thực thi hoặc timeout; không biến chúng thành nhãn đúng/sai tùy ý.
- Ghi theo từng loại yêu cầu, đồng thời kiểm tra kết hợp nhiều yêu cầu.

Các tỷ lệ phụ thuộc cách lấy mẫu kế hoạch; không được tuyên bố tỷ lệ lỗi ngoài thực tế nếu tập đánh giá chỉ là ví dụ tự tạo.

Với instance nhỏ có thể liệt kê hết, so sánh tập kế hoạch hợp lệ sau khi chiếu bỏ atom phụ. Hai chương trình cùng SAT chưa chứng minh chúng biểu diễn cùng bài toán.

Kiểm thử hữu hạn không phải chứng minh soundness/completeness tổng quát. Chứng minh cần đặc tả độc lập và lập luận cho phạm vi ngôn ngữ/encoding được hỗ trợ.

### Kiểm tra trước solver thực sự làm được gì?

- Kiểm tra schema, định danh, tham chiếu, phạm vi phiên bản, trạng thái chưa biết và loại yêu cầu được hỗ trợ.
- Kiểm tra tính đầy đủ của phép ánh xạ: mỗi yêu cầu có được xử lý hoặc báo chưa hỗ trợ không?
- Giữ dấu vết từ điều khoản/JSON tới thành phần ASP để chẩn đoán lỗi.
- Phát hiện một số mẫu lỗi tĩnh đã xác định.

Một số câu hỏi sâu như tương đương mô hình, tồn tại kế hoạch hoặc tác động của mâu thuẫn có thể cần chính một thủ tục suy luận/solver phụ. Không tuyên bố mọi bảo đảm ngữ nghĩa đều kiểm tra được chỉ bằng validator trước solver.

## 11. Ba hướng nghiên cứu từng được thảo luận, chưa chốt

### A. Sinh/chọn kiểm thử để phát hiện lỗi ngữ nghĩa

Câu hỏi ứng viên: dưới cùng ngân sách kiểm thử, cách sinh tình huống dựa trên cấu trúc quy định có phát hiện lỗi ảnh hưởng kế hoạch tốt hơn test thủ công, ngẫu nhiên hoặc ca biên không?

Ví dụ: sinh hồ sơ chỉ qua A để phân biệt yêu cầu `A AND B` và `A OR B`.

Cần đáp án chuẩn độc lập, lỗi có cơ sở thực tế, baseline công bằng và dữ liệu giữ lại. Nếu dùng mutation, phải loại các biến thể tương đương về ngữ nghĩa và báo riêng lỗi tạo có chủ đích với lỗi thực.

### B. Chọn thông tin cần xác minh khi đầu vào chưa rõ

Câu hỏi ứng viên: với nhiều điểm mơ hồ, cần hỏi/tra cứu điểm nào để xác nhận một yêu cầu lập kế hoạch với ít chi phí hơn?

Cần tập giả thuyết rõ ràng và nguồn trả lời có thẩm quyền. Sinh viên xác nhận mong muốn/hoàn cảnh; ý nghĩa quy chế cần nguồn hoặc người hiểu quy chế. Phân biệt hoàn thiện toàn bộ dữ liệu với chỉ đủ trả lời một yêu cầu cụ thể.

### C. Chọn encoding/biên dịch hiệu quả

Câu hỏi ứng viên: với cùng ngữ nghĩa, cấu trúc quy chế nào khiến kiểu encoding này tốt hơn kiểu khác? Có thể chọn kiểu phù hợp tự động không?

Chỉ ưu tiên khi đã có mô hình đúng và nút thắt hiệu năng. So sánh riêng grounding, solving, bộ nhớ và tỷ lệ hoàn thành; kiểm tra tương đương kết quả trước khi so tốc độ.

Đề xuất trước đó: làm phần nền trước, thu thập bằng chứng cho A. Đây không phải cam kết phải làm A. Quyết định mới nhất của người dùng vẫn là code end-to-end rồi đánh giá tiếp.

## 12. Tài liệu đã đối chiếu và giới hạn kết luận

- [Hahn et al., Reasoning about Study Regulations in ASP, TPLP 2024](https://arxiv.org/abs/2408.04528): mô hình hình thức; instance facts + encoding chung; bài đã đọc nêu chưa đánh giá scalability. Không nên coi JSON là khác biệt nghiên cứu tự thân so với bài này.
- [SCORER — Planning Courses for Student Success](https://arxiv.org/pdf/2207.02659): chương trình học từ file cấu hình, đầu vào sinh viên từ GUI, lập kế hoạch bằng MILP.
- [MiniZinc, CP 2007](https://nnethercote.github.io/pubs/minizinc2007.pdf): tách model/data và biên dịch sang ngôn ngữ đầu vào solver.
- [Conjure, Artificial Intelligence 2022](https://eprints.whiterose.ac.uk/id/eprint/188771/): refinement từ Essence sang mô hình cụ thể; prior art cho tự động hóa lựa chọn biểu diễn. Không khẳng định mọi refinement đã được chứng minh hình thức.
- [Unit Testing in ASP Revisited](https://www.cambridge.org/core/journals/theory-and-practice-of-logic-programming/article/unit-testing-in-asp-revisited-language-and-testdriven-development-environment/A6A07BB086CA2D888C32BCB5C9E37CD6): kiểm thử ASP đã có nghiên cứu riêng.
- [QUACQ, IJCAI 2013](https://ijcai.org/proceedings/2013/78): học ràng buộc qua partial queries.
- [LLMACQ, IJCAI 2024](https://ijcai.org/proceedings/2024/212): dùng câu trả lời ngôn ngữ tự nhiên trong constraint acquisition. Hỏi người dùng để học ràng buộc không phải ý tưởng mới tự thân.
- [KnowPlan, arXiv preprint 2026](https://arxiv.org/html/2608.06530v1): trích xuất nguồn → JSON có provenance → đồ thị yêu cầu → CP-SAT; cần phân biệt mô tả/kết quả tác giả báo cáo với kết quả nhóm đã tái hiện. Phiên này chưa tái hiện thực nghiệm hoặc kiểm chứng artifact của bài.
- [Trang tài liệu Clingo chính thức](https://potassco.org/clingo/): chọn đúng phiên bản API; không dùng lẫn ví dụ của phiên bản preview với phiên bản đang cài.

Đây là danh sách để nối tiếp tra cứu, không phải systematic literature review hoàn tất. Chưa kết luận một phương pháp đề xuất có novelty hoặc đủ điều kiện xuất bản Q2.

## 13. Trạng thái file và công việc tại thời điểm lưu

- Thư mục đích người dùng yêu cầu: `D:\Đồ án\BK_uni`.
- PDF người dùng cung cấp ban đầu: `C:\Users\ASUS ExpertBook\Downloads\Reasoning about Study Regulations.pdf`.
- Chat hiện tại làm việc trong scratch: `C:\Users\ASUS ExpertBook\.copilot\chats\3aad75f4-4e3b-4cb5-9146-125f423b7840`.
- Scratch có các tài liệu tra cứu trước: `literature-review-round1.md`, `literature-matrix.csv`, `search-log.md`, `research-directions-8-papers.md`.
- Chưa chuyển các tài liệu tra cứu đó vào thư mục đích trong lượt này.
- Chưa đọc code trong thư mục đích, chưa chọn schema chính thức, chưa hiện thực hay chạy kiểm thử pipeline của dự án.
- Các snippet ASP/Python trong hội thoại chủ yếu là ví dụ giảng giải, không được coi là code production đã kiểm chứng.

Khi tiếp tục, bắt đầu từ trạng thái dự án thực tế và quyết định ở mục 1, không tự quay lại mở rộng literature review hoặc triển khai cả ba hướng nghiên cứu cùng lúc.
