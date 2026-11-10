import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsUUID, ValidateNested } from 'class-validator';
import { StudentCourseStatus } from '../enum/student-course-status';

export class StudentCourseStatusItemDto {
  @ApiProperty({ description: 'ID môn học' })
  @IsUUID()
  course_id!: string;

  @ApiProperty({ enum: StudentCourseStatus, example: StudentCourseStatus.COMPLETED })
  @IsEnum(StudentCourseStatus)
  status!: StudentCourseStatus;
}

/** Khai trạng thái nhiều môn trong một request (ví dụ nhập từ file Excel/CSV). */
export class BulkUpsertStudentCoursesDto {
  @ApiProperty({ type: [StudentCourseStatusItemDto], maxItems: 1000 })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => StudentCourseStatusItemDto)
  items!: StudentCourseStatusItemDto[];
}
