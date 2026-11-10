import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCurriculumDto {
  @ApiProperty({ example: 'CS-2023', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Khoa học máy tính', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'Công nghệ thông tin', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  major!: string;

  @ApiProperty({ example: 'Công nghệ thông tin', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  faculty!: string;

  @ApiProperty({ example: 2023, description: 'Khóa tuyển sinh' })
  @Type(() => Number)
  @IsInt()
  cohort!: number;

  @ApiProperty({ example: 4, description: 'Số năm đào tạo' })
  @Type(() => Number)
  @IsInt()
  duration_years!: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  min_semester_credits!: number;

  @ApiProperty({ example: 18 })
  @Type(() => Number)
  @IsInt()
  max_semester_credits!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
