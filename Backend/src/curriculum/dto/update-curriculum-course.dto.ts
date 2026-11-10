import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateCurriculumCourseDto {
  @ApiPropertyOptional({ nullable: true, example: 2, description: 'Gửi null để bỏ xếp kỳ (môn vào pool tự chọn)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recommended_year?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  recommended_term?: number | null;
}
