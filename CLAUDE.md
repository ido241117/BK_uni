# Hướng dẫn cho phiên làm việc mới

Trao đổi bằng tiếng Việt, cụ thể, có khuyến nghị rõ.

## Cho người dùng: bắt đầu một cuộc trò chuyện mới

1. Mở cuộc trò chuyện mới trong thư mục `BK_uni`. File này được nạp tự động.
2. Gõ câu mở đầu:

   > Bắt đầu phiên mới theo CLAUDE.md.

3. AI phải trả lời đủ bốn mục ở phần "Khởi động" bên dưới. Thiếu mục nào, hoặc không dẫn kết quả script, thì bảo làm lại.
4. Nếu muốn kiểm tra AI đã đọc kỹ chưa, hỏi vài câu mà bạn biết đáp án (ví dụ: "song hành theo QĐ 285 nghĩa là gì?"). Đáp án nằm trong file bối cảnh.
5. Sau đó mới giao việc, ví dụ: "Làm giai đoạn 1 của kế hoạch."

## Cho AI: khởi động bắt buộc

Trước khi làm bất cứ việc gì:

1. Chạy script kiểm tra mốc và đọc kết quả:

   ```
   cd pipeline
   .venv/Scripts/python check_baseline.py
   ```

   Script chỉ đọc, không sửa gì. Muốn kiểm tra phần database thì backend phải đang chạy (`npm --prefix Backend run dev`); nếu không, các mục database hiện `BO_QUA`.
2. Đọc `docs/README.md` (mục lục, đang ở đâu, người duyệt cần làm gì, git). Rồi đọc `docs/01-boi-canh.md` (sự thật đã kiểm chứng) và `docs/02-ke-hoach.md` (kế hoạch duy nhất). Đụng tới code thì đọc `docs/03-thiet-ke.md`; kiểm thử thì `docs/05-kiem-thu.md`. Không đọc `docs/luu-tru/` trừ khi cần tra lịch sử.
3. Xem `git status` để biết file nào đã đổi.
4. Trả lời người dùng đúng bốn mục:
   - **Kết quả script:** số mục DUNG / KHAC / CHUA_LAM / BO_QUA, và liệt kê mọi mục KHAC.
   - **Đang ở giai đoạn nào** của kế hoạch, theo mục "Duyệt".
   - **Việc tiếp theo** là gì, kèm mã việc (T1–T26).
   - **Điều chưa rõ** hoặc mâu thuẫn giữa tài liệu và thực tế.

Có mục KHAC thì báo người dùng và chưa làm tiếp cho tới khi thống nhất được.

## Quy tắc chống bịa

- Chỉ khẳng định một trạng thái ("đã xong", "test qua", "khớp") khi vừa kiểm tra bằng lệnh hoặc đọc file trong phiên này. Còn lại thì nói "theo tài liệu ngày X" hoặc "chưa kiểm tra".
- Khẳng định về dự án phải dẫn được file, dòng hoặc lệnh.
- Tài liệu và code mâu thuẫn thì tin code, rồi báo lại chỗ mâu thuẫn.
- Không nhớ thì nói không nhớ; không suy diễn nội dung các phiên trước ngoài những gì có trong file.

## Quy tắc làm việc

- Mỗi lần chỉ làm một giai đoạn của kế hoạch; xong thì dừng, báo cáo theo mẫu ở mục 1 của kế hoạch, chờ duyệt. Trong một giai đoạn, từng việc nhỏ đi theo mục "Nhịp làm việc với người dùng" bên dưới.
- Làm xong một việc thì **cập nhật cả ba nơi**: kế hoạch (mục Duyệt, nhật ký quyết định), tài liệu bối cảnh (sự thật mới), và `pipeline/check_baseline.py` (mục CHUA_LAM tương ứng phải chuyển thành DUNG, hoặc thêm phép kiểm tra mới). Đổi code hoặc API thì sửa `docs/03-thiet-ke.md` (và `docs/06-tong-ket.md` nếu đổi chức năng, luồng của trang Môn học / Gợi ý); cuối phiên sửa mục "Đang ở đâu" của `docs/README.md`.
- Giữ `docs/` gọn: không tạo file tài liệu mới ngoài `01`–`06` và `README.md` (`06-tong-ket.md` thêm 23/11 theo người duyệt); thông tin mới đưa vào đúng file theo mục lục. Tài liệu hết dùng thì chuyển vào `docs/luu-tru/`, không xóa.
- Không sửa Supabase dùng chung (schema, migration, dữ liệu).
- Không đưa dữ liệu cá nhân (tên, MSSV, điểm, file tiến độ thật) vào code, test hay commit.
- Không commit `docs/luu-tru/2026-11-15-ban-giao-claude-web-va-pipeline.md` (chứa mật khẩu), các file `Mon_hoc_CTDT_*`, `Bảng điểm.pdf`, `ctdt-ben-tien-do-mon-tra-ve-cua-tao.json` (file tiến độ thật) và `function.js` (mã của trường). Người dùng chưa muốn commit; chỉ commit khi được yêu cầu.
- Bộ giải chạy bằng `pipeline/.venv`: `cd pipeline` rồi `.venv/Scripts/python -m ...`.

## Nhịp làm việc với người dùng

Người dùng cần theo kịp project, không chỉ nhận kết quả. AI không làm nhanh hơn tốc độ người dùng tiếp nhận.

Mỗi việc nhỏ đi đủ 4 bước, mỗi bước dừng chờ người dùng:

1. **Hiểu:** đọc code, chưa sửa. Trả lời ≤ 5 dòng: luồng hiện tại, còn thiếu gì.
2. **Thiết kế:** file nào đổi, vì sao. Chờ duyệt.
3. **Làm:** chỉ bước đầu tiên, thay đổi nhỏ nhất. Nêu ≤ 3 quyết định, mỗi quyết định 1 câu.
4. **Kiểm:** đã đổi gì (link file), rủi ro, người dùng cần kiểm gì.

Rồi hỏi người dùng 3 câu và để **họ tự trả lời** (AI không trả lời thay):

- Code vừa rồi giải quyết vấn đề gì?
- Vì sao chọn cách này?
- Có bug thì tìm ở đâu?

Người dùng chưa trả lời được thì AI giải thích lại đúng chỗ đó, chưa sang việc mới.

Câu trả lời thường ≤ 5 dòng; người dùng hỏi thêm mới viết dài. Giảng giải thì theo khuôn: một câu cốt lõi, vài ý, một ví dụ thật, nguồn (file/dòng).
