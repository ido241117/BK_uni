import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { CourseGroupKind } from '../enum/course-group-kind';
import { CourseGroupScope } from '../enum/course-group-scope';

export class CreateCourseGroupDto {
  @ApiProperty({ example: 'Cơ sở ngành', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: CourseGroupKind, example: CourseGroupKind.REQUIRED })
  @IsEnum(CourseGroupKind)
  kind!: CourseGroupKind;

  @ApiPropertyOptional({
    nullable: true,
    example: 5,
    description: 'Số môn phải chọn; bỏ trống khi khối chỉ ràng buộc theo tín chỉ',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  required_count?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 15,
    description: 'Số tín chỉ tối thiểu phải đạt trong khối',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  required_credits?: number | null;

  @ApiPropertyOptional({
    enum: CourseGroupScope,
    default: CourseGroupScope.LISTED,
    description: "'listed': chọn trong danh sách môn của nhóm; 'any': chọn mọi môn trong danh mục (tự chọn tự do)",
  })
  @IsOptional()
  @IsEnum(CourseGroupScope)
  pool_scope?: CourseGroupScope;

  @ApiPropertyOptional({
    nullable: true,
    example: 3,
    description: 'Với khối any: chỉ nhận môn có đúng số tín chỉ này',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pool_course_credits?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Tạo khối chuyên ngành: ID chuyên ngành. Phải gửi cùng parent_group_id; không đổi được sau khi tạo.',
  })
  @IsOptional()
  @IsUUID()
  specialization_id?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Tạo khối chuyên ngành: ID khối gốc được thu hẹp. Môn của khối phải là tập con của khối gốc.',
  })
  @IsOptional()
  @IsUUID()
  parent_group_id?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Danh sách ID môn của nhóm (bỏ trống với khối any)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  course_ids?: string[];
}
