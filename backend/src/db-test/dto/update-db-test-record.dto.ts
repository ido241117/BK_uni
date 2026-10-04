import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDbTestRecordDto {
	@ApiPropertyOptional({ example: 'Bản ghi PostgreSQL đã cập nhật' })
	@IsOptional()
	@IsString()
	@MaxLength(120)
	title?: string;

	@ApiPropertyOptional({ example: 'Mô tả đã được cập nhật.' })
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string | null;
}
