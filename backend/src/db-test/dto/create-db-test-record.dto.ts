import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDbTestRecordDto {
	@ApiProperty({ example: 'Kết nối PostgreSQL' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(120)
	title: string;

	@ApiPropertyOptional({ example: 'Bản ghi dùng để kiểm tra CRUD.' })
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string;
}
