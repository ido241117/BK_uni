import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { StudentCourseStatus } from '../enum/student-course-status';

export class StudentCourseStatusItemDto {
  @ApiProperty({ description: 'ID môn học' })
  @IsUUID()
  course_id!: string;

  @ApiProperty({ enum: StudentCourseStatus, example: StudentCourseStatus.COMPLETED })
  @IsEnum(StudentCourseStatus)
  status!: StudentCourseStatus;
}

/**
 * Khai trạng thái nhiều môn trong một request (nhập từ file Excel/CSV, hoặc bấm "Lưu" ở trang môn học
 * sau khi sửa nháp trên trình duyệt).
 */
export class BulkUpsertStudentCoursesDto {
  @ApiProperty({ type: [StudentCourseStatusItemDto], maxItems: 1000 })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => StudentCourseStatusItemDto)
  items!: StudentCourseStatusItemDto[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 1000,
    description: 'Môn bỏ khai báo trạng thái; môn chưa khai thì bỏ qua. Không được trùng với `items`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  remove_course_ids?: string[];
}
