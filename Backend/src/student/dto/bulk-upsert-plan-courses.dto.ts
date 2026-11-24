import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

export class PlanCourseItemDto {
  @ApiProperty({ description: 'ID môn học' })
  @IsUUID()
  course_id!: string;

  @ApiProperty({ example: '262', maxLength: 3, description: 'Mã học kỳ dự kiến, ví dụ 262' })
  @IsString()
  @MaxLength(3)
  @Matches(/^[0-9]{2}[123]$/, { message: 'Mã học kỳ phải có dạng YYH, ví dụ 251.' })
  semester_code!: string;
}

/** Lưu nhiều môn của kế hoạch học tập một lần; môn không gửi giữ nguyên. */
export class BulkUpsertPlanCoursesDto {
  @ApiProperty({ type: [PlanCourseItemDto], maxItems: 1000 })
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => PlanCourseItemDto)
  items!: PlanCourseItemDto[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 1000,
    description: 'Môn bỏ khỏi kế hoạch; môn chưa có trong kế hoạch thì bỏ qua. Không được trùng với `items`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  remove_course_ids?: string[];
}
