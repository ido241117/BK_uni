/**
 * Loại quan hệ giữa môn `course_id` và môn liên quan `related_course_id`, theo ghi chú kế hoạch giảng dạy.
 * Mỗi loại kéo theo một quy tắc xét điều kiện riêng nên giữ dạng enum, không cho tự đặt tên.
 */
export enum CourseRelationType {
  /** TQ - tiên quyết: môn liên quan phải đạt. */
  PREREQUISITE = 'prerequisite',
  /** HT - học trước: môn liên quan phải đã học, rớt vẫn được. */
  PRIOR = 'prior',
  /** SHT - song hành/trước: môn liên quan đã học trước hoặc học cùng học kỳ. */
  COREQUISITE = 'corequisite',
  /** KN - khuyến nghị: không chặn đăng ký, chỉ cảnh báo. */
  RECOMMENDED = 'recommended',
}
