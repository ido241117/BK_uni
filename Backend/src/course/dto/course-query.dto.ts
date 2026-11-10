import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageOptionsDto } from '../../common/dto/page-options.dto';

/** Số mã tối đa trong một lần tra `codes`, bằng `take` tối đa để một trang chứa đủ kết quả. */
export const MAX_COURSE_CODES = 100;

export class CourseQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã hoặc tên môn học', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    description: `Chỉ lấy các môn có mã trong danh sách (không phân biệt hoa/thường), ngăn cách bằng dấu phẩy; tối đa ${MAX_COURSE_CODES} mã`,
    example: 'CO2003,MT1003',
    type: String,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const parts = Array.isArray(value) ? value : String(value).split(',');
    return [...new Set(parts.map(part => String(part).trim()).filter(Boolean))];
  })
  @IsArray()
  @ArrayMaxSize(MAX_COURSE_CODES)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  codes?: string[];
}
