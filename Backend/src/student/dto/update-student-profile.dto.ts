import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateStudentProfileDto {
  @ApiPropertyOptional({ example: 'Nguyễn Minh Anh', maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  full_name?: string | null;

  @ApiPropertyOptional({ example: '2312345', maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  student_number?: string | null;

  @ApiPropertyOptional({ example: '0901234567', maxLength: 30, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ example: '2005-04-18', nullable: true })
  @IsOptional()
  @IsDateString()
  birth_date?: string | null;

  @ApiPropertyOptional({ example: 2023, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  admission_year?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ description: 'ID chương trình đào tạo', nullable: true })
  @IsOptional()
  @IsUUID()
  curriculum_id?: string | null;

  @ApiPropertyOptional({ example: 18, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  credit_target?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ID chuyên ngành muốn hướng tới; phải thuộc curriculum_id của hồ sơ. Đổi chương trình sẽ tự bỏ chọn.',
  })
  @IsOptional()
  @IsUUID()
  target_specialization_id?: string | null;
}
