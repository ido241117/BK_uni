import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

/**
 * T43 (22/11): cài đặt lộ trình của sinh viên trên trang Gợi ý (ghim, khóa kỳ, nghỉ kỳ, số TC muốn từng kỳ,
 * học hè, thứ tự ưu tiên, mốc what-if…). Lưu nguyên object ở `student_progress_imports.data.web.planner`
 * để đổi máy vẫn còn; nội dung do trang Gợi ý quản lý, bộ giải kiểm tra khi giải.
 */
export class PlannerSettingsDto {
  @ApiProperty({ description: 'Cài đặt trang Gợi ý (object, tối đa 200 KB khi đổi sang JSON)' })
  @IsObject()
  settings!: Record<string, unknown>;
}
