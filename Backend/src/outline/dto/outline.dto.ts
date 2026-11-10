import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { MAX_OUTLINES_PER_DOCUMENT } from '../outline-format';

const SEMESTER = /^\d{2}[123]$/;

/**
 * File `bkuni.course-outlines` (xem Scraper/OUTLINE-FORMAT.md). Chỉ kiểm tra phần đầu ở đây;
 * từng đề cương được kiểm tra trong OutlineImportService, đề cương lỗi bị bỏ qua và báo lại.
 */
export class ImportOutlinesDto {
  @ApiProperty({ example: 'bkuni.course-outlines' })
  @IsString()
  format!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  format_version!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  generated_at?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  source?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  part?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  parts?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  count?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includes_lecturers?: boolean;

  @ApiProperty({ type: 'array', items: { type: 'object' }, maxItems: MAX_OUTLINES_PER_DOCUMENT })
  @IsArray()
  @ArrayMaxSize(MAX_OUTLINES_PER_DOCUMENT)
  outlines!: unknown[];
}

export class OutlineSemesterQueryDto {
  @ApiPropertyOptional({ example: '262', description: 'Mã học kỳ 3 số; mặc định học kỳ hiện tại' })
  @IsOptional()
  @Matches(SEMESTER, { message: 'semester phải là mã học kỳ 3 số, ví dụ 262' })
  semester?: string;
}

export class OutlineDiscrepancyQueryDto extends OutlineSemesterQueryDto {
  @ApiProperty()
  @IsUUID()
  curriculum_id!: string;
}
