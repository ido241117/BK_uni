# myBK Local Advisor API

Backend Express độc lập cho prototype extension. Chỉ bind `127.0.0.1:8787`; không ghi database, không lưu request và không log payload/điểm.

## Chạy

```powershell
Copy-Item BK_uni/extension/mybk-backend/.env.example BK_uni/extension/mybk-backend/.env
npm install --prefix BK_uni/extension/mybk-backend
```

Điền `LLM_API_KEY` trong `BK_uni/extension/mybk-backend/.env`. Mặc định dùng DeepSeek Chat API: `LLM_BASE_URL=https://api.deepseek.com`, `LLM_MODEL=deepseek-chat`. Backend gọi endpoint OpenAI-compatible `/chat/completions`; có thể đổi base URL/model trong `.env` nếu dùng model/provider khác.

```powershell
npm start --prefix BK_uni/extension/mybk-backend
```

Health check: `http://127.0.0.1:8787/health`.

## API

`POST /api/v1/advice/elective-tracks` nhận câu hỏi, trạng thái môn đọc từ trang CTĐT và các lần học đọc từ trang bảng điểm. Backend tự nạp CTĐT draft KHMT 2023 để dựng context nhóm tự chọn, chỉ gửi context đó tới LLM provider; không lưu dữ liệu.

## Privacy boundary

- API chỉ lắng nghe loopback, giới hạn origin trình duyệt ở Chrome extension và giới hạn body/record count.
- Extension chỉ gọi API sau khi người dùng tick consent; request gửi mã môn/trạng thái và các trường điểm cần cho câu hỏi, không gửi HTML, tên sinh viên, mã sinh viên, cookie hay URL có thông tin đăng nhập.
- LLM provider nhận context có điểm của các môn thuộc nhóm lựa chọn; cân nhắc provider và chính sách dữ liệu trước khi bật.
- Không cấu hình secret trong extension. Không dùng backend này thay BK Uni.

Tests:

```powershell
npm test --prefix BK_uni/extension/mybk-backend
```