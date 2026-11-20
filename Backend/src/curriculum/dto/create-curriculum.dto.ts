import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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

  @ApiPropertyOptional({ nullable: true, example: 128, description: 'Tổng tín chỉ tốt nghiệp khai báo ở nguồn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  total_credits?: number | null;

  @ApiPropertyOptional({ default: false, description: 'Sinh viên phải đạt đúng một chuyên ngành để tốt nghiệp' })
  @IsOptional()
  @IsBoolean()
  specialization_required?: boolean;

  @ApiPropertyOptional({ nullable: true, example: 'mybk', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  source_system?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'DH_CQ_MT_NG_KHM_2023', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source_code?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 22190 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  source_id?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'DH_CQ_MT_NG_KHM_2023.v01', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source_version?: string | null;
}
