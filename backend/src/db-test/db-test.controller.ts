import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateDbTestRecordDto } from './dto/create-db-test-record.dto';
import { UpdateDbTestRecordDto } from './dto/update-db-test-record.dto';
import { DbTestService } from './db-test.service';

@ApiTags('DB test')
@Controller('db-test')
export class DbTestController {
	constructor(private readonly dbTestService: DbTestService) { }

	@Get()
	@ApiOperation({ summary: 'Liệt kê bản ghi kiểm tra PostgreSQL' })
	findAll() {
		return this.dbTestService.findAll();
	}

	@Get(':id')
	@ApiOperation({ summary: 'Đọc một bản ghi kiểm tra PostgreSQL' })
	findOne(@Param('id', new ParseUUIDPipe()) id: string) {
		return this.dbTestService.findOne(id);
	}

	@Post()
	@ApiOperation({ summary: 'Tạo bản ghi kiểm tra PostgreSQL' })
	create(@Body() dto: CreateDbTestRecordDto) {
		return this.dbTestService.create(dto);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Cập nhật bản ghi kiểm tra PostgreSQL' })
	update(
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() dto: UpdateDbTestRecordDto,
	) {
		return this.dbTestService.update(id, dto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Xóa bản ghi kiểm tra PostgreSQL' })
	remove(@Param('id', new ParseUUIDPipe()) id: string) {
		return this.dbTestService.remove(id);
	}
}
