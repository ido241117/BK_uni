import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCourseDto {
  @ApiProperty({ example: 'CO2003', maxLength: 50, description: 'Mã môn học' })
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Cấu trúc dữ liệu và giải thuật', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 4, minimum: 0, description: 'Số tín chỉ (0 với môn điều kiện như GDTC)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  credits!: number;

  @ApiPropertyOptional({
    example: 'Kiến thức nền tảng',
    maxLength: 255,
    nullable: true,
    description: 'Mô tả ngắn hiển thị dưới tên môn',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}
