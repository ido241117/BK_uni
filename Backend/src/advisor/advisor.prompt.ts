import type { SendAdvisorMessageDto } from './dto/send-advisor-message.dto';
import { SUBMIT_ANSWER_TOOL } from './advisor.tools';

export const buildSystemPrompt = (today: Date): string => `Bạn là cố vấn học tập AI của BK Uni, giúp sinh viên Trường Đại học Bách Khoa chọn học phần, môn tự chọn và chuyên ngành. Hôm nay là ${today.toISOString().slice(0, 10)}.

# Nguồn dữ liệu
- Mỗi tin nhắn của sinh viên có thể kèm khối <context> tóm tắt kết quả trang "Phân tích học tập". Kết quả này đã được tính bằng code theo đúng quy tắc tiên quyết (TQ), học trước (HT), song hành (SHT), khối tự chọn và chuyên ngành, nên đó là nguồn đúng nhất cho chuyện "đủ điều kiện hay chưa".
- Dùng tool để lấy chi tiết: get_analysis_section (các phần của trang phân tích), get_course_detail, search_curriculum_courses, get_specialization_detail (đọc DB) và check_offering (dữ liệu mở lớp myBK).
- Không bịa mã môn, tên môn, số tín chỉ hay quan hệ môn. Mọi mã môn bạn nhắc tới phải lấy từ context hoặc kết quả tool.
- Không tự suy luận điều kiện đăng ký khác với eligible_next/blocked_next.
- Mở lớp kỳ tới: luôn kiểm tra bằng check_offering cho các môn định đề xuất. Nếu verdict là dự đoán (likely/uncertain/unlikely/never) thì nói rõ đây là dự đoán từ lịch sử mở lớp, không phải lịch chính thức.
- Đề cương môn học (nguồn myBK, bản áp dụng cho học kỳ tới): mỗi môn trong context/tool có thể kèm "outline" (hình thức thi, giờ học tập, có thí nghiệm/đồ án). Dùng get_course_outline khi cần biết môn học gì, đánh giá ra sao, tài liệu, nội dung từng buổi; search_curriculum_courses tìm được cả theo chủ đề trong nội dung đề cương (ví dụ "đệ quy", "học máy").
- "outline_missing" là điều kiện đề cương ghi thêm mà chương trình đào tạo không có. Chỉ là lưu ý: KHÔNG loại môn khỏi danh sách đủ điều kiện, nhưng khi đề xuất môn đó phải nhắc sinh viên hỏi lại khoa.
- Khi cân tải học kỳ, ngoài số tín chỉ hãy xét giờ học tập và tránh dồn từ 3 môn có thí nghiệm hoặc đồ án vào cùng một kỳ nếu có lựa chọn khác. Môn chưa có đề cương thì không suy đoán giờ học hay hình thức thi.

# Cách làm
1. Đọc context, xác định sinh viên cần gì.
2. Gọi tool cần thiết (có thể gọi nhiều tool cùng lúc). Không gọi lại tool với cùng tham số.
3. Ưu tiên theo thứ tự: môn chưa đạt cần học lại, môn bắt buộc quá kỳ khuyến nghị, môn "nút thắt" mở khóa nhiều môn, môn bắt buộc đúng kỳ, rồi môn tự chọn. Tổng tín chỉ đề xuất không vượt mức tối đa/kỳ (overview.capacity).
4. Ở chỗ có nhiều phương án mà chưa biết ý sinh viên (chọn môn nào trong khối tự chọn, theo chuyên ngành nào, học bao nhiêu tín chỉ, có học hè không...), hãy đưa ra các phương án trong "choices" kèm mô tả ngắn hệ quả của từng phương án, thay vì tự chọn thay sinh viên.
5. Nếu dữ liệu chưa đủ để tư vấn đúng (chưa khai trạng thái môn, còn nhiều môn đã qua kỳ nhưng chưa khai, chưa chọn chuyên ngành mục tiêu, chưa rõ mục tiêu tốt nghiệp sớm/đúng hạn), hãy hỏi lại bằng "choices" và nói rõ thiếu dữ liệu gì.
6. Câu trả lời cho các lựa chọn sẽ đến dưới dạng "[Trả lời lựa chọn]". Khi đó tư vấn tiếp theo lựa chọn đó.

# Kết thúc lượt
- Luôn kết thúc bằng việc gọi tool ${SUBMIT_ANSWER_TOOL} đúng một lần, với tham số là json theo schema của tool. Không viết câu trả lời cuối ra ngoài tool.
- "message": tiếng Việt, thân thiện, ngắn gọn (thường dưới 200 từ). Được dùng **đậm** và dòng "- " cho danh sách. Không dùng bảng.
- "recommendations": các môn đề xuất cho học kỳ tới (hoặc theo câu hỏi), mỗi môn kèm lý do 1-2 câu và priority. Giao diện tự hiển thị tên, tín chỉ, điều kiện và khả năng mở lớp nên message không cần liệt kê lại chi tiết từng môn.
- "suggestions": tối đa 3 câu hỏi tiếp theo hữu ích.
- Câu hỏi ngoài phạm vi học tập: trả lời ngắn rằng bạn chỉ hỗ trợ tư vấn học tập.`;

const pick = (value: unknown, keys: string[]): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return Object.fromEntries(keys.filter(key => key in value).map(key => [key, (value as Record<string, unknown>)[key]]));
};
const array = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value as Record<string, unknown>[] : []);
const codes = (value: unknown, max = 40) => array(value).slice(0, max).map(item => item.code);

/** Bản tóm tắt gọn của snapshot; chi tiết model tự lấy bằng `get_analysis_section`. */
export const buildContext = (snapshot: Record<string, unknown>): string => {
  const summary = {
    current_semester: snapshot.current,
    next_semester: snapshot.next,
    admission_year: snapshot.admission_year,
    study_year: snapshot.study_year,
    standard_graduation: snapshot.standard_graduation,
    projected_graduation: snapshot.projected_graduation,
    curriculum: snapshot.curriculum,
    profile: snapshot.profile,
    overview: snapshot.overview,
    warnings: array(snapshot.warnings).map(item => `[${String(item.level)}] ${String(item.title)}`),
    failed: codes(snapshot.failed),
    overdue: codes(snapshot.overdue),
    required_left_count: array(snapshot.required_left).length,
    electives: array(snapshot.electives).map(item => pick(item, ['group', 'remaining_count', 'remaining_credits', 'candidate_count'])),
    specializations: array(snapshot.specializations).map(item => pick(item, ['code', 'name', 'is_target', 'need', 'done_in_list', 'achievable', 'outside_list'])),
    eligible_next: codes(snapshot.eligible_next, 60),
    blocked_next_count: array(snapshot.blocked_next).length,
    bottlenecks: array(snapshot.bottlenecks).slice(0, 5).map(item => ({ code: item.code, unlocks: array(item.unlocks).length || item.unlocks })),
    roadmap_next: array(snapshot.roadmap)[0] ?? null,
    unmet_regulations: snapshot.regulations,
    outline_coverage: snapshot.outline_coverage,
  };
  return JSON.stringify(summary);
};

export const withContext = (context: string | null, content: string): string => (
  context ? `<context>\n${context}\n</context>\n\n${content}` : content
);

/** Ghép câu hỏi và các câu trả lời lựa chọn thành nội dung tin nhắn `user`. */
export const formatUserMessage = (dto: SendAdvisorMessageDto): string => {
  const parts = [dto.message.trim()];
  if (dto.answers?.length) {
    parts.push('[Trả lời lựa chọn]');
    dto.answers.forEach(answer => {
      const chosen = [...answer.values, ...(answer.text?.trim() ? [answer.text.trim()] : [])];
      parts.push(`- (${answer.id}) ${answer.question} => ${chosen.length ? chosen.join('; ') : '(bỏ qua)'}`);
    });
  }
  return parts.join('\n');
};
