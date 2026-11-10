import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../auth/decorators/access.decorator';
import { CurriculumService } from './curriculum.service';
import { CreateCurriculumDto } from './dto/create-curriculum.dto';
import { CurriculumQueryDto } from './dto/curriculum-query.dto';
import { UpdateCurriculumDto } from './dto/update-curriculum.dto';

@ApiTags('Chương trình đào tạo')
@Controller('curricula')
export class CurriculumController {
  constructor(private readonly curricula: CurriculumService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách chương trình đào tạo (phân trang, tìm kiếm)' })
  list(@Query() query: CurriculumQueryDto) {
    return this.curricula.findPage(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết chương trình đào tạo' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.curricula.findOne(id);
  }

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: 'Tạo chương trình đào tạo (Admin)' })
  create(@Body() dto: CreateCurriculumDto) {
    return this.curricula.create(dto);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Sửa chương trình đào tạo (Admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCurriculumDto) {
    return this.curricula.update(id, dto);
  }

  @Delete(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Xóa chương trình và toàn bộ dữ liệu con (Admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.curricula.remove(id);
  }
}
