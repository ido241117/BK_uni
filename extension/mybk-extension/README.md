# myBK Study Planner Prototype

Chrome extension local-only để đọc trạng thái môn từ trang Chương trình đào tạo myBK và đối chiếu với CTĐT KHMT khóa 2023.

## Chạy trong Chrome profile

1. Mở `chrome://extensions` trong đúng Chrome profile đang dùng myBK.
2. Bật **Developer mode**.
3. Chọn **Load unpacked** và trỏ đến thư mục `BK_uni/extension/mybk-extension`.
	Nếu extension đã được nạp, bấm nút reload trên thẻ extension sau khi cập nhật code.
4. Mở trang Chương trình đào tạo myBK (`/ket-qua-hoc-tap/chuong-trinh-dao-tao`); popup hiện nút **Nạp tiến độ từ CTĐT**.
5. Mở trang bảng điểm (`/ket-qua-hoc-tap/bang-diem-mon-hoc`); popup hiện nút **Nạp bảng điểm môn học**.
6. Kiểm tra preview riêng cho từng nguồn và xác nhận lưu. Khi cả hai nguồn đã nạp, extension tự chuyển sang giao diện chat; nút quay lại mở màn hình dữ liệu, nút làm mới chỉ xóa lịch sử chat và giữ nguyên dữ liệu đã nạp.
7. Cài/chạy backend theo `BK_uni/extension/mybk-backend/README.md`; tick consent trước mỗi lượt chat. Lịch sử chat được lưu local và gửi tối đa 20 tin nhắn gần nhất để hỗ trợ hỏi đáp tiếp nối.

Extension yêu cầu `activeTab`, `scripting`, `storage` và host permission duy nhất tới backend `127.0.0.1:8787`; không có quyền cookies. Payload hai nguồn, danh sách chọn và lịch sử chat được lưu trong `chrome.storage.local`; dùng nút `×` ở màn hình dữ liệu để xóa toàn bộ dữ liệu local. Dữ liệu chỉ gửi ra backend/LLM khi người dùng tick consent và bấm gửi.

## Quy tắc prototype

- `completed` và `in_progress` được xem là đã đáp ứng, giống quy ước tiến độ trong BK Uni.
- Các môn bắt buộc được xếp trước, sau đó theo học kỳ, ordinal trong CTĐT và mã môn. Nhóm tự chọn chỉ đưa các phương án còn lại vào danh sách nếu số tín chỉ đã đạt chưa đủ.
- Trạng thái đạt được nhận diện từ icon `fa-check` trong cột **Đạt**; ô **Đạt** trống được coi là chưa đạt/chưa học. Preview vẫn cần được rà soát trước khi lưu.
- Yêu cầu tự chọn tự do không có mã môn trong JSON draft chưa thể đưa vào danh sách index.
- Extension chưa gọi AI, chưa đồng bộ Worker/D1 và chưa tự xác định môn tương đương/học lại.

## Kiểm thử lõi

Từ thư mục gốc workspace, chạy:

```powershell
node --test BK_uni/extension/mybk-extension/analyzer.test.mjs BK_uni/extension/mybk-extension/mybk-parser.test.mjs
```