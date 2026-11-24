import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { StudentCourseStatusItemDto } from '../../student/dto/bulk-upsert-student-courses.dto';

/** Ghi chú riêng của sinh viên cho một mã môn (22/11). `note` rỗng = xóa ghi chú. */
export class MybkNoteDto {
  @ApiProperty({ description: 'Mã môn như trong file myBK, vd "CO3335", "ENG_GC_600", "CCGDTC"' })
  @IsString() @MaxLength(40) @Matches(/^[A-Za-z0-9_]+$/)
  code!: string;

  @ApiProperty({ maxLength: 500 })
  @IsString() @MaxLength(500)
  note!: string;
}

/** T46 (22/11): khối sinh viên chọn để tính một môn vào. `group_id` null = về khối mặc định của chương trình. */
export class MybkBlockChoiceDto {
  @ApiProperty({ description: 'Mã môn, vd "CO3335"' })
  @IsString() @MaxLength(40) @Matches(/^[A-Za-z0-9_]+$/)
  code!: string;

  @ApiProperty({ nullable: true, description: 'Id khối (course_groups) của chương trình, hoặc "required" (khối Bắt buộc, '
    + 'backend tự suy ra nên không có id); null thì bỏ lựa chọn' })
  @IsOptional() @Matches(/^(required|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  group_id!: string | null;
}

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

  @ApiPropertyOptional({ type: [MybkNoteDto], description: 'Ghi chú riêng của sinh viên theo mã môn (22/11); note rỗng thì xóa' })
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => MybkNoteDto)
  notes?: MybkNoteDto[];

  @ApiPropertyOptional({ type: [MybkBlockChoiceDto], description: 'Khối sinh viên tự chọn cho môn (T46, 22/11)' })
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => MybkBlockChoiceDto)
  block_choices?: MybkBlockChoiceDto[];
}
