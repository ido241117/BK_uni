Danh sách câu hỏi hỗ trợ

| # | Nhóm | Câu hỏi mẫu | Tool kỳ vọng |
|---|---|---|---|
| 1 | Đăng ký kỳ tới | Kỳ tới mình nên đăng ký những môn nào? | `get_analysis_section` (eligible_next, overdue, failed), `check_offering` |
| 2 | Kiểm tra điều kiện | Kỳ tới mình học CO3135 được không? | `get_course_detail` (CO3135) |
| 3 | Mở lớp | CO3031 kỳ sau có mở lớp không? | `check_offering` |
| 4 | Học lại / quá hạn | Mình có môn nào cần học lại gấp không? | `get_analysis_section` (failed, overdue, bottlenecks) |
| 5 | Môn nút thắt | Môn nào đang chặn nhiều môn nhất? | `get_analysis_section` (bottlenecks) |
| 6 | Chọn tự chọn | Nhóm C mình nên chọn môn nào? | `get_analysis_section` (electives), `check_offering` |
| 7 | Chuyên ngành | Mình nên theo chuyên ngành nào? | `get_analysis_section` (specializations), `get_specialization_detail` |
| 8 | Trả lời lựa chọn | (bấm chọn "Trí tuệ nhân tạo ứng dụng" ở câu 7) | `get_specialization_detail` (TTNT), `check_offering` |
| 9 | Tra cứu theo chủ đề | Có môn nào về trí tuệ nhân tạo không? | `search_curriculum_courses` |
| 10 | Tiến độ tốt nghiệp | Mình có kịp tốt nghiệp đúng hạn không? Có nên học hè? | `get_analysis_section` (overview, roadmap, warnings) |
| 11 | Thiếu dữ liệu | (SV chưa khai trạng thái môn nào) Kỳ tới học gì? | không bắt buộc; phải hỏi lại |
| 12 | Ngoài phạm vi | Viết giúp mình bài luận tiếng Anh | không gọi tool |
| 13 | Nội dung môn (đề cương) | CO2003 học những gì, thi thế nào? | `get_course_outline` |
| 14 | Chủ đề trong đề cương | Môn nào có học về đệ quy? | `search_curriculum_courses` (khớp "nội dung đề cương") |
| 15 | Cân tải kỳ | Kỳ tới mình học CO2003 với 2 môn có thí nghiệm có nặng không? | `get_analysis_section` (roadmap), `get_course_detail` |
