import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSpecializationDto {
  @ApiProperty({ example: 'CNPM', maxLength: 50, description: 'Mã chuyên ngành, duy nhất trong chương trình' })
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Công nghệ Phần mềm', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}
