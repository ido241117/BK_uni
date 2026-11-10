import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateCurriculumCourseDto {
  @ApiProperty({ description: 'ID môn học' })
  @IsUUID()
  course_id!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 2,
    description: 'Năm khuyến nghị; bỏ trống (hoặc null) với môn trong pool tự chọn vì không xếp kỳ cố định',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recommended_year?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 1,
    description: 'Học kỳ khuyến nghị 1..3; phải đi cùng recommended_year',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  recommended_term?: number | null;
}
