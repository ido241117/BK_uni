import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsUUID } from 'class-validator';

/** Mỗi trường ứng với một loại quan hệ; trường không gửi thì giữ nguyên, mảng rỗng thì xóa hết loại đó. */
export class ReplaceCourseRelationsDto {
  @ApiPropertyOptional({ type: [String], description: 'TQ - môn tiên quyết (phải đạt)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  prerequisite_course_ids?: string[];

  @ApiPropertyOptional({ type: [String], description: 'HT - môn học trước (đã học, rớt vẫn được)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  prior_course_ids?: string[];

  @ApiPropertyOptional({ type: [String], description: 'SHT - môn song hành/trước (học trước hoặc cùng học kỳ)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  corequisite_course_ids?: string[];

  @ApiPropertyOptional({ type: [String], description: 'KN - môn khuyến nghị (chỉ cảnh báo)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  recommended_course_ids?: string[];
}
