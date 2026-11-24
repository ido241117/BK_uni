# Danh sách câu hỏi hỗ trợ của Advisor

Tài liệu liệt kê các loại câu hỏi mà agent tư vấn học tập trả lời được, tool mà agent được kỳ vọng gọi, và tầng truy xuất
dữ liệu phía sau mỗi tool. Dùng làm checklist khi kiểm thử thủ công và làm phạm vi cho báo cáo.

**Trạng thái**

| Ký hiệu | Ý nghĩa |
|---|---|
| **Đã có** | Đã triển khai, đang chạy trong hệ thống |
| **Dự kiến** | Đã thiết kế, chưa triển khai (tên tool và hành vi có thể thay đổi) |

---

## 1. Các tầng truy xuất và tool

| Tầng | Công nghệ | Tool | Trạng thái |
|---|---|---|---|
| **Phân tích học tập** | Code tính sẵn trên dữ liệu PostgreSQL (tiên quyết, khối tự chọn, chuyên ngành, lộ trình) | `get_analysis_section` | Đã có |
| **Tra cứu có cấu trúc** | Truy vấn SQL trên PostgreSQL | `get_course_detail`, `check_offering`, `get_course_outline`, `get_specialization_detail`, `search_curriculum_courses` | Đã có |
| **Tìm kiếm toàn văn (lexical)** | Elasticsearch, xếp hạng BM25, mỗi đề cương là một document | `search_outlines`, `find_similar_courses` | Đã có |
| **Tìm kiếm ngữ nghĩa (semantic / RAG)** | Chunking theo section đề cương, embedding, pgvector HNSW, hybrid với BM25 (RRF), rerank | `search_outline_passages` (tên tạm) | Dự kiến |

Ghi chú:

- `search_curriculum_courses` khớp mã môn, tên môn và chủ đề trong mục tiêu/tóm tắt đề cương bằng SQL (không phân biệt
  dấu). Tool này chỉ tìm trong chương trình của sinh viên.
- `search_outlines` tìm trong **toàn bộ** nội dung đề cương (kể cả nội dung từng buổi, chuẩn đầu ra, đánh giá, tài liệu).
  Nó hiểu không dấu, viết tắt/đồng nghĩa (CSDL, AI, OOP, HĐH…), tự sửa lỗi gõ, trả về đoạn trích được highlight, cách
  khớp (`matched_by`), facets theo khoa/hình thức thi, và lọc được theo `has_lab`, `has_project`, `final_exam_format`,
  `scope` (`curriculum` / `all`).
- `find_similar_courses` dùng `more_like_this` của Elasticsearch để tìm môn có đề cương gần giống, kèm từ khóa đặc trưng.
- Tầng ngữ nghĩa dự kiến sẽ trả về **đoạn văn (passage)** kèm trích dẫn `mã môn / mục / buổi`, chứ không trả về môn học.
  Đây là điểm phân biệt với `search_outlines`.

---

## 2. Tư vấn học vụ (Phân tích học tập + SQL) — Đã có

Cột "Tài khoản": **demo** = `khmt.demo@bkuni.local` (đúng tiến độ), **chậm** = `k ` (chậm khoảng
1 năm), **cả hai** = dùng được trên cả hai tài khoản. Trạng thái của từng tài khoản xem mục 2.1.

| # | Nhóm | Tài khoản | Câu hỏi mẫu | Tool kỳ vọng | Câu trả lời phải có |
|---|---|---|---|---|---|
| A1 | Đăng ký kỳ tới | chậm | Kỳ tới mình nên đăng ký những môn nào? | `get_analysis_section` (eligible_next, overdue, failed), `check_offering` | Ưu tiên CO3005 (học lại) và 3 môn quá hạn trước môn tự chọn; tổng tín chỉ không vượt mức tối đa/kỳ. |
| A2 | Điều kiện khuyến nghị vòng | chậm | Kỳ tới mình học SP1037 được không? | `get_course_detail` (SP1037), có thể thêm `get_course_outline` (SP1037, SP1039) | **Được đăng ký**: chương trình chỉ ghi SP1037 *khuyến nghị* học trước SP1039, không chặn. Đề cương thì SP1037 và SP1039 khuyến nghị lẫn nhau (vòng), nên không thể học "đúng thứ tự". Nên học SP1039 cùng kỳ hoặc trước (SP1039 còn đang quá hạn). Không được kết luận "chưa đủ điều kiện". |
| A2b | Kiểm tra điều kiện | cả hai | Kỳ tới mình học CO3135 được không? | `get_course_detail` (CO3135), `check_offering` | Đủ tiên quyết (CO1027, CO2003 đã xong). Mở kỳ 262 chỉ `uncertain` (1/4 kỳ 2 gần nhất). |
| A3 | Kỳ sau không mở lớp | cả hai | CO3151 kỳ sau có mở lớp không? | `check_offering` | Dự đoán `never`: CO3151 Quản trị mạng chưa từng mở ở kỳ 2, chỉ mở một lần ở HK 261. Phải nói rõ đây là dự đoán từ lịch sử, không phải lịch chính thức. |
| A4 | Học lại / quá hạn | chậm | Mình có môn nào cần học lại gấp không? | `get_analysis_section` (failed, overdue, bottlenecks) | 4 môn quá hạn (khuyến nghị HK 252): **CO3005** (chưa đạt, cần học lại), **CO3335** (nút thắt: CO4029 song hành, CO4337 tiên quyết), **CO2001**, **SP1039**. |
| A5 | Môn nút thắt | chậm | Môn nào đang chặn nhiều môn nhất? | `get_analysis_section` (bottlenecks) | CO3335 Thực tập ngoài trường chặn CO4029 và CO4337. Môn này mở không đều (có cả kỳ hè), nên dự đoán kỳ 262 chỉ `uncertain` (2/4 kỳ 2 gần nhất). |
| A6 | Chọn tự chọn | cả hai | Nhóm C mình nên chọn môn nào? | `get_analysis_section` (electives), `check_offering` | Nhóm C đã 3/5 và chỉ còn combo TTNT, XLA, nên chỉ đề xuất môn thuộc ít nhất một trong hai danh sách và có mở kỳ tới. |
| A7 | Chuyên ngành | cả hai | Mình nên theo chuyên ngành nào? | `get_analysis_section` (specializations), `get_specialization_detail` | Đưa `choices` giữa TTNT và XLA (và phương án không lấy chuyên ngành); không đề xuất CNPM, CNDL, MMANM vì đã mất. |
| A8 | Trả lời lựa chọn | cả hai | (bấm chọn "Trí tuệ nhân tạo ứng dụng" ở câu A7) | `get_specialization_detail` (TTNT), `check_offering` | Đề xuất 2 môn TTNT còn thiếu có mở kỳ tới. |
| A9 | Tiến độ tốt nghiệp | chậm | Mình có kịp tốt nghiệp đúng hạn không? Có nên học hè? | `get_analysis_section` (overview, roadmap, warnings, regulations) | Không kịp hạn chuẩn (HK 262): còn khoảng 59 tín chỉ, chưa đạt chuẩn tiếng Anh và hoạt động sinh viên. Học hè (ví dụ CO3335) giúp rút ngắn. |
| A10 | Cân tải kỳ | cả hai | Kỳ tới mình học CO2003 với 2 môn có thí nghiệm có nặng không? | `get_analysis_section` (roadmap), `get_course_detail`, `get_course_outline` | CO2003 đã hoàn thành ở cả hai tài khoản, nên phải nhắc là không cần học lại. |
| A11 | Môn làm mất chuyên ngành | cả hai | Bạn mình rủ mình học CO3069 kỳ tới, mình có nên học không? | `get_course_detail` (CO3069), `get_analysis_section` (specializations), `check_offering` | Xem mục 2.1. |
| A12 | Môn ít mở lớp | cả hai | Mình có nên học CO3051 không? | `get_course_detail` (CO3051), `check_offering`, `get_analysis_section` (specializations) | Xem mục 2.1. |

### 2.1. Tài khoản test và kịch bản chi tiết

Cả hai tài khoản (xem [TEST-ACCOUNTS.md](TEST-ACCOUNTS.md)) đều thuộc chương trình **CS-2023-KHMT** (128 tín chỉ),
khóa 2023, đang học HK 261, kỳ tới là **262** (kỳ 2). Dữ liệu mở lớp mới nhất có đến HK 261. Cả hai chưa đặt chuyên
ngành mục tiêu.

| | `khmt.demo@bkuni.local` (demo) | `khmt.cham@bkuni.local` (chậm) |
|---|---|---|
| Lệnh seed | `node scripts/seed-demo-student.mjs` | `node scripts/seed-demo-student.mjs --scenario=behind` |
| Tiến độ | Đúng tiến độ, xong toàn bộ năm 1–3 | Chậm khoảng 1 năm, đã xong 69/128 tín chỉ (~54%) |
| Đang học HK 261 | CO4029, SP1037, IM3001, CO3117 | Năm 3 kỳ 1 (CH1003, CO2013, CO3001, CO3093, SP1035) và CO3117, tổng 18 tín chỉ |
| Chưa đạt | Không | CO3005 |
| Quá kỳ khuyến nghị | Không | CO2001, CO3005, CO3335, SP1039 (khuyến nghị HK 252) |
| SP1037 / SP1039 | SP1039 đã xong, SP1037 đang học | Cả hai chưa học |
| Nhóm A, B, D, tự do | Đã xong A, B, tự do; D đang học | Chưa học |
| Quy định tốt nghiệp | Đạt cả 4 | Mới đạt GDTC, GDQP; chưa đạt chuẩn tiếng Anh, hoạt động sinh viên |

**Trạng thái nhóm C** (Tự chọn nhóm C, học kỳ 7 và 8: 5 môn / 15 tín chỉ):

| Môn | demo | chậm | Thuộc danh sách chuyên ngành |
|---|---|---|---|
| CO3049 Lập trình Web | Đã xong | Đã xong | MMANM, TTNT, XLA |
| CO3043 Phát triển Ứng dụng trên Thiết bị Di động | Đã xong | — | TTNT, XLA |
| CO3045 Lập trình Game | — | Đã xong | TTNT, XLA |
| CO3117 Học máy | Đang học | Đang học | TTNT, XLA |

Ở cả hai tài khoản, nhóm C đã có 3/5 môn, và **chỉ còn 2 chuyên ngành đạt được: TTNT** (Trí tuệ nhân tạo ứng dụng)
**và XLA** (Xử lý ảnh và Thị giác máy tính). Vì vậy các kịch bản A6–A8, A11, A12 chạy được trên cả hai tài khoản.

> **Tiền điều kiện:** chạy lệnh seed tương ứng trước khi test để đưa tài khoản về đúng trạng thái trên. Lệnh seed không
> xóa lịch sử chat. Nếu thêm môn nhóm C ngoài danh sách TTNT/XLA qua giao diện (ví dụ CO4031, chỉ thuộc CNDL), cả hai
> chuyên ngành sẽ mất và các kịch bản về chuyên ngành không còn đúng.

#### A11. Bạn rủ học môn làm mất chuyên ngành

**Câu hỏi:** "Bạn mình rủ mình học CO3069 kỳ tới, mình có nên học không?"

**Dữ liệu thật của CO3069 (Mật mã và An ninh mạng, 3 TC):**
- Thuộc nhóm C và không có điều kiện tiên quyết trong chương trình, nên **đủ điều kiện đăng ký**.
- Mở lớp đều (gần nhất 261, 252, 251…). Dự đoán cho 262: `likely` (mở 4/4 kỳ 2 gần nhất).
- **Chỉ thuộc danh sách chuyên ngành MMANM**, không thuộc TTNT hay XLA.

**Tool kỳ vọng:** `get_course_detail` (CO3069) để lấy nhóm và chuyên ngành của môn, `get_analysis_section`
(specializations) để lấy các chuyên ngành còn `achievable`, `check_offering` (CO3069).

**Câu trả lời phải có:**
- Kết luận **không nên** học nếu sinh viên muốn có chuyên ngành. Lý do không phải điều kiện hay mở lớp, vì môn vẫn đủ
  điều kiện và nhiều khả năng mở.
- Giải thích: CO3069 nằm ngoài danh sách của cả TTNT và XLA. Học môn này sẽ mất cả hai chuyên ngành còn lại, sinh viên chỉ
  tốt nghiệp với bằng ngành **Khoa học Máy tính**, không ghi chuyên ngành.
- Không được nói CO3069 "giúp hoàn tất chuyên ngành MMANM" (MMANM đã mất vì CO3043 và CO3117 không thuộc danh sách MMANM).
- Đề xuất môn thay thế vẫn giữ chuyên ngành và mở kỳ tới, ví dụ CO3045 Lập trình Game (TTNT + XLA), hoặc môn chỉ thuộc
  một chuyên ngành như CO3061, CO3085 (TTNT), CO3057, CO3059 (XLA).
- Nên đưa `choices` để sinh viên chọn: giữ chuyên ngành TTNT, giữ XLA, hay chấp nhận không có chuyên ngành để học cùng bạn.

#### A12. Môn hợp chương trình nhưng không mở 3 kỳ gần nhất

**Câu hỏi:** "Mình có nên học CO3051 không?"

**Dữ liệu thật của CO3051 (Hệ thống thiết bị di động, 3 TC):**
- Thuộc nhóm C, có trong danh sách **TTNT, XLA** (và MMANM), không có điều kiện tiên quyết. Môn **thỏa chương trình
  đào tạo** và **giữ được cả hai chuyên ngành** còn lại.
- Chỉ từng mở ở HK 241, 242, 243. **Không mở ở 3 kỳ gần nhất (252, 253, 261)**, và cả 251.
- Dự đoán cho 262: `uncertain` (chỉ mở 1/4 kỳ 2 gần nhất, là HK 242).

**Tool kỳ vọng:** `get_course_detail` (CO3051) để lấy lịch sử mở lớp và chuyên ngành của môn, `check_offering`
(CO3051), có thể thêm `get_analysis_section` (specializations).

**Câu trả lời phải có:**
- Về chương trình: môn hợp lệ, tính vào nhóm C và giữ được cả TTNT lẫn XLA.
- **Cảnh báo mở lớp**: CO3051 không mở trong 3 kỳ gần nhất (252, 253, 261), lần gần nhất là HK 243. Khả năng mở kỳ 262
  chỉ là dự đoán `uncertain` từ lịch sử, không phải lịch chính thức.
- Khuyên không nên dựa vào môn này để hoàn tất nhóm C. Nên có phương án dự phòng mở đều và cũng giữ cả hai chuyên
  ngành, ví dụ CO3045 Lập trình Game.

### 2.2. Hỏi bằng tên môn (chữ thường, không có mã)

Sinh viên thường gọi môn bằng tên, viết thường, có khi không dấu. Agent phải **tra ra mã môn trước**, sau đó mới làm
như case có mã tương ứng.

**Luồng kỳ vọng:**
1. Gọi `search_curriculum_courses` với tên môn để lấy mã.
2. Chọn mã:
   - ưu tiên môn có tên khớp trọn cụm từ sinh viên viết;
   - bỏ môn đã hoàn thành nếu câu hỏi là về đăng ký;
   - nếu vẫn còn nhiều ứng viên thì hỏi lại bằng `choices`, **không tự đoán**.
3. Gọi các tool như case có mã.

**Lưu ý về cách khớp của `search_curriculum_courses`:**
- Tool bỏ dấu, tách query thành từng từ, rồi giữ môn mà **mọi từ là chuỗi con** của "mã + tên" (tên gồm cả phần tiếng
  Anh). Tool không khớp theo cụm từ.
- Kết quả xếp **theo mã môn**, không theo độ liên quan: môn khớp tên đứng trước, môn khớp nội dung đề cương đứng sau.
- Cột "Môn khớp tên" bên dưới được mô phỏng bằng SQL theo đúng logic này trên chương trình CS-2023-KHMT, nên chưa tính
  các môn khớp qua nội dung đề cương. Trạng thái môn lấy theo dữ liệu seed của tài khoản demo.

| # | Biến thể của | Câu hỏi mẫu | Môn khớp tên | Hành vi kỳ vọng |
|---|---|---|---|---|
| N1 | A2 | kỳ tới mình học môn trí tuệ nhân tạo được không | CO3061, CO3101 (đã xong), CO3107 (đã xong), CO3135 | Bỏ CO3101 và CO3107 vì đã hoàn thành. Còn hai môn: CO3061 Nhập môn Trí tuệ Nhân tạo và CO3135 Lập trình cho Trí tuệ nhân tạo và Khoa học dữ liệu. Hỏi lại bằng `choices`, hoặc gọi `get_course_detail` cho cả hai và trả lời từng môn. Không được tự chọn một môn. |
| N2 | A2 | ky toi minh hoc mon tri tue nhan tao duoc khong | Giống N1 | Không dấu vẫn phải cho kết quả như N1. |
| N3 | A3 | môn phân tích và thiết kế giải thuật kỳ sau có mở không | CO3031 | Gọi `check_offering` (CO3031). Môn này chỉ mở ở HK 241–243, nên phải cảnh báo giống A12. |
| N4 | A11 | bạn mình rủ mình học mật mã và an ninh mạng kỳ tới, có nên học không | CO3069 | Như A11: không nên, vì học môn này mất cả TTNT lẫn XLA. |
| N5 | A11 | bạn rủ mình học môn mật mã kỳ tới, có nên không | 9 môn: CO2011, CO3033, CO3069, CO3083, CO3129, CO3139, CO4025, CO4037, CO4039 | Hầu hết khớp nhầm vì "ma" là chuỗi con của "Information", "Management"… Chỉ CO3069 và CO3083 (Mật mã học và Mã hóa Thông tin) thật sự là môn mật mã. Cả hai **chỉ thuộc MMANM**, nên kết luận giống A11 dù sinh viên muốn nói môn nào. Agent có thể nói rõ cả hai môn, hoặc hỏi lại. |
| N6 | A12 | mình có nên học môn hệ thống thiết bị di động không | CO3051 | Như A12: môn hợp chương trình, giữ được TTNT và XLA, nhưng không mở 3 kỳ gần nhất. |
| N7 | A12 | mình có nên học môn di động không | CO3043 (đã xong), CO3051 | CO3043 đã hoàn thành, nên hiểu là CO3051 (có nói rõ giả định này) rồi làm như A12, hoặc hỏi lại. Không được khuyên học lại CO3043. |
| N8 | A2 | ky toi minh hoc hoc may duoc khong | CO1007, CO3089, CO3117, CO4337 | CO1007, CO3089 và CO4337 khớp nhầm vì tên có "Khoa học Máy tính". Agent phải chọn CO3117 Học máy, dù môn này không đứng đầu danh sách. CO3117 **đang học** ở HK 261, nên trả lời là đang học, không cần đăng ký lại (trừ khi trượt). |
| N9 | A2 | kỳ tới học machine learning được không | CO3117 | Khớp qua phần tên tiếng Anh. Trả lời giống N8. |
| N10 | B1 | cấu trúc dữ liệu và giải thuật học những gì, thi thế nào | CO2003 | Gọi `get_course_outline` (CO2003). |
| N11 | B2 | công nghệ phần mềm với nguyên lý ngôn ngữ lập trình môn nào nặng hơn | "công nghệ phần mềm": CO3001, CO3065, CO3103, CO3109, CO3131. "nguyên lý ngôn ngữ lập trình": CO3005 | Chọn CO3001 vì tên khớp trọn cụm từ; không lấy CO3065 Nâng cao hay các đồ án. Gọi `get_course_outline` cho CO3001 và CO3005. |
| N12 | C10 | môn nào giống môn hệ cơ sở dữ liệu | CO2013, CO3021 | Chọn CO2013 Hệ cơ sở Dữ liệu vì tên khớp trọn cụm từ (CO3021 là Hệ **Quản trị** Cơ sở Dữ liệu). Gọi `find_similar_courses` (CO2013). |
| N13 | A2 (chậm) | kỳ tới mình học tư tưởng hồ chí minh được không | SP1037 | Như A2: được đăng ký, SP1037 và SP1039 khuyến nghị lẫn nhau, nên học SP1039 (lịch sử đảng) cùng kỳ hoặc trước. |
| N14 | A2 (chậm) | mình học lịch sử đảng trước hay tư tưởng hồ chí minh trước | "lịch sử đảng": SP1039. "tư tưởng hồ chí minh": SP1037 | Nhận ra vòng khuyến nghị và không chọn bừa một thứ tự. Nên ưu tiên SP1039 vì môn này đã quá kỳ khuyến nghị (HK 252). |
| N15 | A3 | quản trị mạng kỳ sau có mở không | CO3151 | Như A3: dự đoán `never`. |
| N16 | A4 (chậm) | thực tập ngoài trường mình chưa học thì có sao không | CO3335 | Môn bắt buộc đã quá hạn và là nút thắt: thiếu CO3335 thì không học được CO4029 (song hành) và CO4337 (tiên quyết). |

## 3. Đề cương của một môn đã biết (SQL) — Đã có

| # | Nhóm | Câu hỏi mẫu | Tool kỳ vọng |
|---|---|---|---|
| B1 | Nội dung môn | CO2003 học những gì, thi thế nào? | `get_course_outline` |
| B2 | So sánh môn | CO3001 và CO3005 môn nào nặng hơn? | `get_course_outline` (cả hai môn) |
| B3 | Điều kiện theo đề cương | Đề cương CO3005 yêu cầu học trước môn nào? | `get_course_outline` (điều kiện theo đề cương đặt cạnh điều kiện theo chương trình) |

## 4. Tìm kiếm theo chủ đề — Elasticsearch — Đã có

| # | Nhóm | Câu hỏi mẫu | Tool kỳ vọng | Điểm mạnh của ES được thể hiện |
|---|---|---|---|---|
| C1 | Chủ đề theo tên | Có môn nào về trí tuệ nhân tạo không? | `search_curriculum_courses` hoặc `search_outlines` | Khớp tên và tóm tắt |
| C2 | Chủ đề trong nội dung buổi | Môn nào có học về đệ quy? | `search_outlines` (dự phòng: `search_curriculum_courses`) | Tìm sâu tới nội dung từng buổi, có highlight |
| C3 | Công cụ / kỹ năng | Môn nào học Docker? | `search_outlines` | Khớp đúng thuật ngữ kỹ thuật |
| C4 | Không dấu | Mon nao hoc xu ly anh? | `search_outlines` | Analyzer folding không dấu |
| C5 | Viết tắt / đồng nghĩa | Có môn nào về CSDL phân tán không? | `search_outlines` | Synonym (CSDL = cơ sở dữ liệu) |
| C6 | Lỗi gõ | Môn nào dạy kubernets? | `search_outlines` | Fuzziness, `matched_by` báo khớp gần đúng |
| C7 | Lọc theo hình thức | Môn nào thi tự luận mà có thí nghiệm? | `search_outlines` (`has_lab`, `final_exam_format` lấy từ facets) | Filter + facets |
| C8 | Đồ án | Môn có đồ án nhóm về web? | `search_outlines` (`has_project: true`) | Kết hợp full-text và filter |
| C9 | Ngoài chương trình | Toàn trường có môn nào về blockchain không? | `search_outlines` (`scope: all`) | Tìm trên toàn bộ 2.742 đề cương; `in_curriculum = false` chỉ để tham khảo |
| C10 | Môn tương tự | Môn nào giống CO3001? Có môn thay thế nào trong nhóm C? | `find_similar_courses`, rồi `get_course_detail` / `get_analysis_section` | `more_like_this` + từ khóa đặc trưng |
| C11 | Học gì tiếp | Học xong CO2013 thì nên học gì tiếp? | `find_similar_courses`, `get_course_detail` (môn được mở khóa) | Kết hợp nội dung và quan hệ tiên quyết |

## 5. Tìm kiếm ngữ nghĩa / RAG — Dự kiến

Đây là các câu hỏi mà tầng lexical hiện tại trả lời **chưa tốt**: câu hỏi diễn đạt khác từ ngữ trong đề cương, câu hỏi
khác ngôn ngữ, hoặc câu hỏi cần **đoạn văn cụ thể** thay vì danh sách môn. Cột "Hiện tại" mô tả hành vi trước khi có
tầng ngữ nghĩa.

| # | Nhóm | Câu hỏi mẫu | Hiện tại | Dự kiến |
|---|---|---|---|---|
| D1 | Diễn đạt lại theo nghĩa | Môn nào dạy cách làm việc với khách hàng để lấy yêu cầu? | `search_outlines` chỉ khớp nếu đề cương có đúng từ; dễ trả kết quả yếu | `search_outline_passages` khớp theo nghĩa (Requirements Engineering, phân tích yêu cầu) |
| D2 | Khác ngôn ngữ | Which courses cover machine learning? | Phụ thuộc synonym thủ công; bỏ sót khi đề cương viết "học máy" | Embedding đa ngôn ngữ khớp Anh ↔ Việt |
| D3 | Vị trí trong đề cương | Môn CSDL học transaction isolation ở buổi mấy? | `get_course_outline` trả nguyên đề cương, agent phải tự đọc | Trả đúng passage "Buổi n" kèm trích dẫn |
| D4 | Chuẩn đầu ra xuyên môn | Những môn nào có chuẩn đầu ra về làm việc nhóm? | `search_outlines` khớp từ khóa, trả về cấp môn | Trả các passage chuẩn đầu ra liên quan từ nhiều môn |
| D5 | Câu hỏi mô tả nhu cầu | Mình muốn làm backend, nên học những môn nào? | Agent tự đoán từ khóa rồi gọi `search_outlines` nhiều lần | Hybrid (BM25 + vector) + rerank trả passage phù hợp nhất |
| D6 | Trích dẫn khi trả lời | (bất kỳ câu nào ở C/D) "Nguồn ở đâu trong đề cương?" | Highlight cấp document | Trích dẫn `mã môn / mục / buổi` cho từng ý |

Thiết kế dự kiến (tóm tắt):

1. **Chunking**: cắt `course_outlines.content` theo cấu trúc JSON bằng SQL (mỗi buổi, mỗi chuẩn đầu ra, tóm tắt, mục tiêu
   là một chunk), gắn tiêu đề `[mã – tên › mục]`.
2. **Embedding**: model đa ngôn ngữ (dự kiến `multilingual-e5-small`) chạy local, chỉ embed lại chunk có `content_hash` thay đổi.
3. **Index**: pgvector HNSW trên Supabase, lọc theo chương trình của sinh viên bằng `hnsw.iterative_scan`.
4. **Rerank**: gộp kết quả Elasticsearch (BM25 cấp chunk) và vector bằng RRF, sau đó rerank bằng cross-encoder.

## 6. Hành vi hội thoại — Đã có

| # | Nhóm | Câu hỏi mẫu | Tool kỳ vọng |
|---|---|---|---|
| E1 | Thiếu dữ liệu | (SV chưa khai trạng thái môn nào) Kỳ tới học gì? | Không bắt buộc; phải hỏi lại |
| E2 | Ngoài phạm vi | Viết giúp mình bài luận tiếng Anh | Không gọi tool |

---

## 7. Phân vai giữa các tầng tìm kiếm

Dùng bảng này để chọn tool khi viết prompt, và làm giả thuyết cho phần đánh giá: mỗi loại câu hỏi có một tầng được kỳ
vọng thắng.

| Loại câu hỏi | SQL (`search_curriculum_courses`) | Elasticsearch (`search_outlines`) | Ngữ nghĩa (dự kiến) |
|---|---|---|---|
| Mã môn, tên môn chính xác | Tốt | Tốt | Kém |
| Thuật ngữ / công cụ cụ thể (Docker, Verilog) | Trung bình | **Tốt nhất** | Trung bình |
| Không dấu, viết tắt, lỗi gõ | Không dấu: có; còn lại: không | **Tốt nhất** | Trung bình |
| Lọc theo thí nghiệm / đồ án / hình thức thi | Không | **Tốt nhất** (filter + facets) | Dựa vào filter SQL |
| Diễn đạt lại theo nghĩa | Không | Yếu | **Tốt nhất** |
| Hỏi tiếng Anh, đề cương tiếng Việt | Không | Yếu (synonym thủ công) | **Tốt nhất** |
| Cần đoạn văn và trích dẫn cụ thể | Không | Highlight cấp môn | **Tốt nhất** (passage) |
| Câu hỏi tổng hợp | — | — | **Hybrid + rerank** |
