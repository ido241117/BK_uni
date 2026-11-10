import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../auth/decorators/access.decorator';
import { CourseService } from './course.service';
import { CourseQueryDto } from './dto/course-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { ReplaceOpenedSemestersDto } from './dto/replace-opened-semesters.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@ApiTags('Môn học')
@Controller('courses')
export class CourseController {
  constructor(private readonly courses: CourseService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách môn học (phân trang, tìm theo mã hoặc tên)' })
  list(@Query() query: CourseQueryDto) {
    return this.courses.findPage(query);
  }

  @Get('by-code/:code')
  @ApiOperation({ summary: 'Lấy môn học theo mã' })
  byCode(@Param('code') code: string) {
    return this.courses.findByCode(code);
  }

  @Get(':id/opened-semesters')
  @ApiOperation({ summary: 'Danh sách học kỳ đã mở của môn học' })
  openedSemesters(@Param('id', ParseUUIDPipe) id: string) {
    return this.courses.openedSemesters(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết môn học' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.courses.findOne(id);
  }

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: 'Tạo môn học (Admin)' })
  create(@Body() dto: CreateCourseDto) {
    return this.courses.create(dto);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Sửa môn học (Admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCourseDto) {
    return this.courses.update(id, dto);
  }

  @Delete(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Xóa môn học và toàn bộ dữ liệu con (Admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.courses.remove(id);
  }

  @Put(':id/opened-semesters')
  @AdminOnly()
  @ApiOperation({ summary: 'Thay danh sách học kỳ đã mở của môn học (Admin)' })
  replaceOpenedSemesters(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceOpenedSemestersDto) {
    return this.courses.replaceOpenedSemesters(id, dto);
  }

  @Delete(':id/opened-semesters/:semesterCode')
  @AdminOnly()
  @ApiOperation({ summary: 'Bỏ một học kỳ đã mở của môn học (Admin)' })
  removeOpenedSemester(@Param('id', ParseUUIDPipe) id: string, @Param('semesterCode') semesterCode: string) {
    return this.courses.removeOpenedSemester(id, semesterCode);
  }
}
