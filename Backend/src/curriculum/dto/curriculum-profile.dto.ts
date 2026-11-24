import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

const TEXT_MAX = 20000;

/** Một ngôn ngữ của phần giới thiệu chương trình (văn bản thuần, xuống dòng bằng `\n`). */
export class CurriculumProfileTextDto {
  @ApiPropertyOptional({ nullable: true, description: 'Mô tả chương trình / ngành' })
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_MAX)
  overview?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Cơ hội việc làm' })
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_MAX)
  career_opportunities?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Đối tượng tuyển sinh' })
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_MAX)
  admission_target?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Quá trình đào tạo' })
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_MAX)
  training_process?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Cách thức đánh giá' })
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_MAX)
  assessment_method?: string | null;
}

export class CurriculumProfileDto {
  @ApiPropertyOptional({ type: CurriculumProfileTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CurriculumProfileTextDto)
  vi?: CurriculumProfileTextDto;

  @ApiPropertyOptional({ type: CurriculumProfileTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CurriculumProfileTextDto)
  en?: CurriculumProfileTextDto;
}
