import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID, Matches, ValidateNested } from 'class-validator';
import { StudentCourseStatusItemDto } from '../../student/dto/bulk-upsert-student-courses.dto';

/**
 * Nút "Hiệu chỉnh" (21/11): sinh viên sửa trạng thái môn bất kỳ (kể cả thêm môn ngoài file) và khai học kỳ hiện tại.
 * Trạng thái ghi vào `student_courses`; học kỳ ghi vào `student_progress_imports.data.web` (nội dung file giữ nguyên).
 */
export class AdjustMybkDto {
  @ApiPropertyOptional({ description: 'Học kỳ hiện tại kiểu myBK, vd "261"; môn Đang học là môn của kỳ này' })
  @IsOptional() @Matches(/^\d{2}[123]$/)
  current_semester?: string;

  @ApiProperty({ type: [StudentCourseStatusItemDto], maxItems: 1000, description: 'Chỉ cần gửi các môn đổi trạng thái' })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => StudentCourseStatusItemDto)
  items!: StudentCourseStatusItemDto[];

  @ApiPropertyOptional({ type: [String], description: 'Xóa trạng thái các môn này (môn ngoài file thêm nhầm), 21/11' })
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsUUID('all', { each: true })
  remove_course_ids?: string[];
}
