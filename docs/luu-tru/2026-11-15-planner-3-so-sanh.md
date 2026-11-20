# Planner 3/3 — So sánh Clingo với OR-Tools CP-SAT và định hướng

Ngày viết: 15/11/2026. Bộ ba tài liệu, đọc theo thứ tự:

1. [Clingo](2026-11-15-planner-1-clingo.md): mô tả bài toán bằng luật logic.
2. [OR-Tools CP-SAT](2026-11-15-planner-2-ortools.md): mô tả cùng bài toán bằng bất đẳng thức.
3. **So sánh và định hướng** (file này).

Mọi con số ở đây được đo ngày 15/11/2026 trên máy của nhóm, với Clingo 5.8.3 và OR-Tools 9.15, và chạy lại được bằng các lệnh ở mục 8.

---

## 1. Kết luận trước

1. **Hai bộ giải cho cùng kết quả.** Trên mọi bài cả hai cùng giải xong (5 kịch bản mẫu và 3 bài sinh ngẫu nhiên 20 môn), trạng thái và giá trị mục tiêu khớp nhau hoàn toàn.
2. **Ở cỡ chương trình thật, CP-SAT chứng minh tối ưu dưới 1 giây; Clingo không chứng minh xong trong 20 giây.** Clingo vẫn tìm ra lộ trình có giá trị bằng nghiệm tối ưu, nó chỉ không chứng minh được.
3. **Đã xác định được nguyên nhân, không phải phỏng đoán.** Clingo kẹt ở đúng một việc: chứng minh "không thể học xong sớm hơn một kỳ". Lý do của điều đó là một phép đếm tín chỉ, và CP-SAT xử lý được nhờ nới lỏng tuyến tính. Tắt kỹ thuật này đi thì CP-SAT cũng kẹt y như Clingo.
4. **Đề xuất: dùng cả hai, mỗi bộ một vai.** CP-SAT là bộ giải chạy chính. Clingo là bản đặc tả dễ đọc và là đối chứng trên bài nhỏ.

Phần còn lại của tài liệu trình bày bằng chứng cho bốn điểm này, giới hạn của chúng, và việc nên làm tiếp.

---

## 2. Hai cách nhìn cùng một bài toán

| | Clingo (ASP) | OR-Tools CP-SAT |
|---|---|---|
| Ngôn ngữ mô tả | Luật logic | Biến số và bất đẳng thức |
| Lựa chọn | `{ take(C, I) : sem(I) } 1` | Biến 0/1 `x[c, i]` |
| Ràng buộc | "Không được phép xảy ra ..." | `biểu thức <= số` |
| Khái niệm phụ | Một luật; tự hiểu "không có lý do thì sai" | Biến phụ, phải ràng buộc hai chiều |
| Thứ không khai báo | Mặc định sai | Không tồn tại |
| Dữ liệu đã biết | Là facts, bộ giải tự suy | Tính bằng Python trước khi giải |
| Nhiều mức ưu tiên | Có sẵn (`@3`, `@2`, `@1`) | Tự gộp bằng trọng số |
| Cách chứng minh tối ưu | Tìm kiếm cho tới khi hết khả năng tốt hơn | Cận trên và cận dưới gặp nhau |

Dòng cuối cùng là mấu chốt của cả tài liệu này.

---

## 3. Thí nghiệm 1 — Hai bộ giải có cho cùng kết quả không?

**Cách đo.** Hai bộ giải có thể trả hai lộ trình khác nhau mà cả hai đều đúng, vì thường có nhiều lộ trình ngang điểm. Do đó không so từng môn mà so bộ ba mục tiêu, tính lại bằng Python từ JSON kết quả:

```
(chỉ số kỳ cuối, tổng tín chỉ, số môn lệch khỏi lộ trình cơ sở)
```

Mỗi lộ trình còn được validator độc lập kiểm tra.

**Kết quả trên sinh viên mẫu.**

| Kịch bản | Clingo | CP-SAT | Khớp |
|---|---|---|---|
| Cơ sở | OPTIMAL (2, 20, 0) | OPTIMAL (2, 20, 0) | Có |
| Khóa 2 môn tự chọn vào kỳ tới | OPTIMAL (3, 20, 4) | OPTIMAL (3, 20, 4) | Có |
| Rớt CS201 | OPTIMAL (3, 24, 4) | OPTIMAL (3, 24, 4) | Có |
| CS302 không mở kỳ 262 | OPTIMAL (3, 20, 3) | OPTIMAL (3, 20, 3) | Có |
| Đòi học EL301 ngay kỳ tới | UNSAT | UNSAT | Có |

Ba bài sinh ngẫu nhiên 20 môn cũng khớp. Mọi lộ trình đều qua validator.

**Ý nghĩa.** Hai bộ giải được viết độc lập: Clingo đi qua `facts.py` và `encoding.lp`; CP-SAT đọc thẳng JSON. Một lỗi dịch sai ở một bên gần như chắc chắn làm hai bên lệch nhau. Việc khớp là bằng chứng mạnh rằng **cả hai cài đặt đúng cùng một đặc tả**.

Điều nó **không** chứng minh: đặc tả đó đúng với quy chế trường. Nếu ta hiểu sai nghĩa của "song hành", cả hai sẽ sai giống nhau và vẫn khớp.

---

## 4. Thí nghiệm 2 — Bộ nào nhanh hơn?

**Cách đo.** Chương trình sinh ngẫu nhiên: sinh viên mới, 8 kỳ, môn chia tầng với tiên quyết trỏ về tầng trước, 3/4 môn bắt buộc, 1/5 số môn có một kỳ không mở. Ba seed mỗi cỡ. Giới hạn 20 giây mỗi lần giải. CP-SAT chạy một luồng. Thời gian tính cả dựng mô hình (với Clingo là cả grounding).

| Cỡ bài | Clingo | CP-SAT | Giá trị mục tiêu |
|---|---|---|---|
| 14 môn (sinh viên mẫu) | Xong, 4–25 ms | Xong, 2–14 ms | Khớp |
| 20 môn | Xong, 18–37 ms | Xong, 48–63 ms | Khớp |
| 40 môn | **Hết 20 giây**, có lộ trình | Xong, 80–110 ms | Bằng nhau |
| 60 môn | **Hết 20 giây**, có lộ trình | Xong, 130–155 ms | Bằng nhau |
| 80 môn | **Hết 20 giây**, có lộ trình | Xong, 155–250 ms | Bằng nhau |

Thời gian CP-SAT dao động giữa các lần chạy; ở lần đo khác bài 80 môn mất khoảng 570 ms. Con số an toàn để trích là "dưới 1 giây".

**Đọc bảng này cho đúng.**

- Ở cỡ nhỏ hai bên ngang nhau, Clingo còn nhỉnh hơn ở 20 môn vì CP-SAT tốn thời gian khởi động.
- Từ 40 môn, chuyển biến không phải là "chậm dần" mà là **gãy**: từ vài chục mili giây lên quá 20 giây.
- Ở cả 9 bài lớn, lộ trình Clingo đang cầm khi hết giờ có **đúng giá trị** của nghiệm tối ưu. Clingo không tìm sai; nó không chứng minh được là đã đúng.

Đã thử thêm chế độ tối ưu khác của Clingo (`--opt-strategy=usc`, có và không kèm `--configuration=trendy`): kết quả còn kém hơn, không ra lộ trình nào trong 20 giây ở cỡ 40 môn trở lên.

---

## 5. Thí nghiệm 3 — Vì sao Clingo gãy?

Một bảng thời gian không nói lên nguyên nhân. Để biết, ta tách bài 40 môn thành từng phần và giao riêng cho Clingo.

Bài này có nghiệm tối ưu: học xong ở kỳ thứ 6, tổng 105 TC, mỗi kỳ tối đa 20 TC.

| Việc giao cho Clingo | Kết quả | Thời gian | Số lần mâu thuẫn |
|---|---|---|---|
| Tìm một lộ trình hợp lệ bất kỳ | Xong | 27 ms | 65 |
| Tối thiểu tín chỉ (chỉ mức ưu tiên 2) | Xong | 34 ms | 334 |
| Tối thiểu tín chỉ, cho biết trước là xong ở kỳ 6 | Xong | 17 ms | 257 |
| Tối thiểu kỳ cuối (chỉ mức ưu tiên 3) | **Hết giờ** | 20 giây | 188 076 |
| Chứng minh **không thể** xong trong 5 kỳ | **Hết giờ** | 20 giây | 184 532 |

Kết luận rút ra từ bảng:

- Tìm lộ trình: dễ.
- Tối ưu tín chỉ: dễ.
- **Toàn bộ khó khăn nằm ở dòng cuối:** chứng minh rằng 5 kỳ là không đủ.

Vậy vì sao 5 kỳ không đủ? Câu trả lời là một phép nhân:

```
5 kỳ × 20 TC = 100 TC  <  105 TC cần học
```

Con người thấy ngay. Clingo thì không, vì nó không "cộng rồi so"; nó chứng minh bằng cách thử các cách xếp, mỗi lần thất bại học được một ràng buộc mới. Với lập luận kiểu đếm, số cách xếp cần loại trừ tăng rất nhanh theo cỡ bài. Đây là hạn chế đã biết của nhóm thuật toán dựa trên học mâu thuẫn, không phải lỗi riêng của Clingo.

**Kiểm chứng ngược lại bằng CP-SAT.** Nếu lời giải thích trên đúng thì CP-SAT nhanh là nhờ nới lỏng tuyến tính, thứ làm được đúng phép "cộng rồi so" ấy (tài liệu 2, mục 2.4). Tắt nó đi thì CP-SAT chỉ còn lõi tìm kiếm giống Clingo.

| CP-SAT trên cùng bài 40 môn | Kết quả | Thời gian |
|---|---|---|
| Nới lỏng tuyến tính bật (mặc định) | OPTIMAL | 265 ms |
| Nới lỏng tuyến tính tắt | **Hết giờ**, có lộ trình | 20 giây |

Tắt đi thì CP-SAT kẹt y như Clingo. Lời giải thích được xác nhận từ cả hai phía.

**Một câu để nhớ:** bài toán lập lộ trình có một lõi số học (sức chứa tín chỉ của các kỳ), và bộ giải nào không suy luận được bằng số học sẽ kẹt khi phải chứng minh tối ưu.

**Hệ quả cho Clingo.** Dòng thứ ba của bảng cho thấy: nếu được cho biết trước số kỳ tối thiểu, Clingo giải xong trong 17 ms. Như vậy có thể cứu Clingo bằng cách tính cận dưới bằng Python (tổng tín chỉ còn thiếu chia cho trần mỗi kỳ, làm tròn lên) rồi đưa vào như một ràng buộc. Cách này chỉ giúp khi cận đơn giản đó trùng với đáp án; nếu lý do thật sự phức tạp hơn (ví dụ do môn không mở kết hợp với sức chứa), Clingo sẽ lại kẹt. Chưa cài đặt.

---

## 6. So sánh ngoài tốc độ

Tốc độ không phải tiêu chí duy nhất. Với một đồ án cần giải thích được cho thầy và có thể viết thành paper, các tiêu chí sau quan trọng không kém.

| Tiêu chí | Clingo | CP-SAT | Nhận xét |
|---|---|---|---|
| Đọc lại và giải thích luật | Tốt | Trung bình | Luật ASP gần câu chữ quy chế; bất đẳng thức cần chú thích |
| Quy định logic lồng nhau, ví dụ "(A hoặc B) và C" | Tự nhiên | Phải tự dựng biến phụ | Chưa cài ở cả hai bên; sẽ cần cho tiên quyết thật |
| Ràng buộc và mục tiêu số học | Yếu ở cỡ lớn | Tốt | Mục 5 |
| Chứng minh tối ưu ở cỡ thật | Không đạt trong thử nghiệm | Dưới 1 giây | Mục 4 |
| Liệt kê mọi lộ trình hợp lệ | Có sẵn, tiện | Làm được, kém tiện | Hữu ích để kiểm thử trên bài nhỏ |
| Lỗi điển hình | Thiếu dữ liệu lặng lẽ thành sai | Dịch sai quy định sang bất đẳng thức | Hai loại lỗi khác nhau nên bù cho nhau |
| Giải thích vì sao vô nghiệm | Có cơ chế hỗ trợ, chưa cài | Có cơ chế hỗ trợ, chưa cài | Chưa so sánh được |
| Cài đặt | `pip install clingo` | `pip install ortools` | Cả hai dùng được từ Python, mã nguồn mở |

Dòng "lỗi điển hình" đáng chú ý: hai bộ giải dễ sai ở hai chỗ khác nhau, nên dùng cả hai để đối chiếu thì hiệu quả hơn là viết hai lần bằng cùng một công cụ.

---

## 7. Giới hạn của những kết luận trên

Đọc mục này trước khi trích bất kỳ con số nào.

- **Dữ liệu là sinh ngẫu nhiên.** Chưa có bài nào từ chương trình đào tạo thật. Cấu trúc thật (chuỗi tiên quyết dài, nhiều khối, chuyên ngành) có thể cho kết quả khác.
- **Chỉ một encoding ASP, cấu hình mặc định.** Một người viết ASP giỏi có thể viết encoding tốt hơn nhiều. Kết luận đúng là "encoding này kẹt", không phải "ASP không làm được".
- **Bài sinh ra cố tình chật.** Trần tín chỉ được đặt sát tổng cần học, nên phép đếm ở mục 5 luôn là yếu tố quyết định. Với sinh viên thật gần ra trường, bài toán lỏng hơn và Clingo có thể chạy tốt.
- **Mẫu nhỏ.** 3 seed mỗi cỡ, một máy, giới hạn 20 giây, đo một lần. Thời gian dao động giữa các lần chạy.
- **Chưa đo bộ nhớ**, chưa đo CP-SAT nhiều luồng.
- **Cả hai dùng chung một cách hiểu quy chế.** Khớp nhau không có nghĩa là đúng quy chế.

---

## 8. Chạy lại

Từ thư mục `pipeline`:

```bash
.venv/Scripts/python -m planner.compare                              # thí nghiệm 1
.venv/Scripts/python -m planner.compare --benchmark --time-limit 20  # thí nghiệm 2, khoảng 3 phút
.venv/Scripts/python -m planner.compare --diagnose --time-limit 20   # thí nghiệm 3, khoảng 1 phút
.venv/Scripts/python -m pytest planner -q                            # 23 test, có cả đối chiếu chéo
```

Code: [compare.py](../pipeline/planner/compare.py), [solve.py](../pipeline/planner/solve.py), [solve_cpsat.py](../pipeline/planner/solve_cpsat.py).

---

## 9. Đúc kết và định hướng

### 9.1 Điều đã biết chắc

1. Bài toán lập lộ trình và what-if giải được, và what-if chỉ là thay đổi dữ liệu đầu vào ở cả hai bộ giải.
2. Hai cài đặt độc lập cho cùng kết quả trên mọi bài cả hai giải xong.
3. Khó khăn tính toán của bài toán nằm ở lõi số học, và CP-SAT xử lý được lõi đó.

### 9.2 Đề xuất vai trò

| Vai trò | Bộ giải | Lý do |
|---|---|---|
| Giải chính, trả lời what-if cho người dùng | CP-SAT | Có chứng minh tối ưu dưới 1 giây ở cỡ thật |
| Bản đặc tả để đọc, trình bày, đối chiếu quy chế | Clingo | Luật gần câu chữ quy chế |
| Kiểm thử | Cả hai | Đối chiếu chéo tự động trên bài nhỏ, nơi Clingo còn chứng minh được |

Đây là đề xuất dựa trên thử nghiệm hiện có, chưa phải quyết định của nhóm. Nó cũng giải quyết chỗ hai tài liệu cũ đang lệch nhau (bản 28/10 nghiêng về CP-SAT, bản 05/11 nghiêng về Clingo): không phải chọn một bỏ một.

### 9.3 Việc nên làm tiếp, theo thứ tự

1. **Đưa một chương trình thật vào.** Xuất một CTĐT từ web ra đúng định dạng fixture, chạy cả hai bộ giải. Đây là việc quan trọng nhất vì mọi giới hạn ở mục 7 đều xoay quanh "chưa có dữ liệu thật".
2. **Đối chiếu ngữ nghĩa với quy chế.** Xác nhận nghĩa của tiên quyết, học trước, song hành và mức tín chỉ tối thiểu ở kỳ cuối với nguồn có thẩm quyền. Sai ở đây thì mọi thứ phía sau đều sai.
3. **Mở rộng mô hình theo nhu cầu của dữ liệu thật:** tiên quyết dạng AND/OR, môn thuộc nhiều khối, chuyên ngành. Thêm vào cả hai bộ giải và giữ test đối chiếu chéo.
4. **Giải thích khi vô nghiệm.** Hiện chỉ trả `UNSAT`. Sinh viên cần biết vướng ở đâu.
5. **Đo lại trên dữ liệu thật** rồi mới cập nhật các kết luận ở mục 1.

### 9.4 Điều gì sẽ làm thay đổi đề xuất

- Nếu trên dữ liệu thật Clingo chứng minh tối ưu đủ nhanh (kèm hoặc không kèm cận dưới tính trước), có thể chỉ cần Clingo và bỏ được một nửa khối lượng bảo trì.
- Nếu quy chế thật có nhiều điều kiện logic lồng nhau khó dịch sang bất đẳng thức, cán cân nghiêng về Clingo, và việc cần làm là cứu phần số học cho nó.
- Nếu hai bộ giải bắt đầu lệch nhau khi mô hình phức tạp lên, đó là tín hiệu có lỗi dịch, và chính là lúc việc giữ cả hai trả công.

### 9.5 Liên hệ với mục tiêu paper

Chưa có gì ở đây là đóng góp nghiên cứu. Nhưng thử nghiệm gợi ra hai hướng đáng tìm hiểu thêm, cả hai đều cần khảo sát tài liệu trước khi nói là mới:

- **Đối chiếu chéo hai mô hình độc lập** như một phương pháp kiểm chứng bộ lập lộ trình, thay cho việc chỉ tin một bộ giải.
- **Phân tích lõi khó của bài toán:** chỉ ra rằng khó khăn nằm ở sức chứa tín chỉ chứ không ở quan hệ tiên quyết, kèm thực nghiệm tách từng phần như mục 5.

Cả hai mới ở mức quan sát trên dữ liệu sinh ngẫu nhiên. Bước 1 của mục 9.3 là điều kiện để biết chúng có đứng vững hay không.
