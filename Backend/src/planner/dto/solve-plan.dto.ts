import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, Matches, Max, Min } from 'class-validator';

const SEMESTER = /^\d{2}[123]$/;

/**
 * Yêu cầu giải lộ trình (mục 6 của docs/03-thiet-ke.md).
 * Sinh viên, chương trình và trạng thái môn KHÔNG gửi lên: backend đọc từ tài khoản đang đăng nhập.
 * Nội dung chi tiết của các object (mã môn, mã kỳ) do bộ giải kiểm tra và trả `INPUT_ERROR` nếu sai.
 */
export class SolvePlanDto {
  @ApiPropertyOptional({ enum: ['cpsat', 'clingo'], default: 'cpsat' })
  @IsOptional() @IsIn(['cpsat', 'clingo'])
  solver?: 'cpsat' | 'clingo';

  @ApiPropertyOptional({ description: 'Hạ mức tín chỉ tối đa cho mọi kỳ (11–25)' })
  @IsOptional() @IsInt() @Min(1) @Max(25)
  max_credits?: number;

  @ApiPropertyOptional({ description: 'Giới hạn riêng từng kỳ, vd {"262": {"max": 12}}' })
  @IsOptional() @IsObject()
  semester_limits?: Record<string, { min?: number; max?: number }>;

  @ApiPropertyOptional({ description: 'Phải học xong trước hoặc trong kỳ này, vd "272"' })
  @IsOptional() @Matches(SEMESTER)
  graduate_by?: string;

  @ApiPropertyOptional({ description: 'Giả định đậu/rớt môn đang học, vd {"CO3005": "fail"}; mặc định đậu' })
  @IsOptional() @IsObject()
  in_progress_results?: Record<string, 'pass' | 'fail'>;

  @ApiPropertyOptional({ description: 'Khóa môn vào kỳ: [{course_code, semester_code}]' })
  @IsOptional() @IsArray()
  locked?: { course_code: string; semester_code: string }[];

  @ApiPropertyOptional({ description: 'Môn không mở ở kỳ: [{course_code, semester_code}]' })
  @IsOptional() @IsArray()
  not_offered?: { course_code: string; semester_code: string }[];

  @ApiPropertyOptional({ description: 'Kỳ sinh viên chủ động nghỉ (bảo lưu, đi làm…), vd ["262"]; môn không ghim không xếp vào' })
  @IsOptional() @IsArray() @Matches(SEMESTER, { each: true })
  skip_semesters?: string[];

  @ApiPropertyOptional({ description: 'Kỳ khóa: giữ đúng các môn đã ghim, không xếp thêm (22/11)' })
  @IsOptional() @IsArray() @Matches(SEMESTER, { each: true })
  frozen_semesters?: string[];

  @ApiPropertyOptional({ description: 'Số TC sinh viên muốn từng kỳ, vd {"262": 15}; được lệch tới 2 TC và báo lại (22/11)' })
  @IsOptional() @IsObject()
  semester_targets?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Kỳ hè sinh viên muốn học, vd ["263"]' })
  @IsOptional() @IsArray()
  summer_opt_in?: string[];

  @ApiPropertyOptional({ description: 'wanted_courses, balanced_load, recommendations_first, preferred_load, order (thứ tự ưu tiên: S1, S6, S4, S5, S10, OH, S3)' })
  @IsOptional() @IsObject()
  preferences?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'english_grad_reading, mos (cảnh báo cho khóa luận)' })
  @IsOptional() @IsObject()
  student_flags?: Record<string, boolean>;

  @ApiPropertyOptional({ description: 'Dùng quan hệ suy ra từ chương trình khác (giai đoạn 3)', default: true })
  @IsOptional() @IsBoolean()
  use_inferred_relations?: boolean;

  @ApiPropertyOptional({ description: 'Lộ trình mốc để so sánh what-if: {mã môn: mã kỳ}' })
  @IsOptional() @IsObject()
  previous_plan?: Record<string, string>;
}
