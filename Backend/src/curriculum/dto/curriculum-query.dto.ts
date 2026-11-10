import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageOptionsDto } from '../../common/dto/page-options.dto';

export class CurriculumQueryDto extends PageOptionsDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã, tên hoặc khoa', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
