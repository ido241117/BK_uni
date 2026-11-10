import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../auth/decorators/access.decorator';
import { CurriculumContentService } from './curriculum-content.service';
import { CreateCourseCategoryDto } from './dto/create-course-category.dto';
import { CreateCourseGroupDto } from './dto/create-course-group.dto';
import { CreateCurriculumCourseDto } from './dto/create-curriculum-course.dto';
import { CreateRegulationDto } from './dto/create-regulation.dto';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';
import { ReplaceCourseCategoriesDto } from './dto/replace-course-categories.dto';
import { ReplaceCourseRelationsDto } from './dto/replace-course-relations.dto';
import { ReplaceGroupMembersDto } from './dto/replace-group-members.dto';
import { UpdateCourseCategoryDto } from './dto/update-course-category.dto';
import { UpdateCourseGroupDto } from './dto/update-course-group.dto';
import { UpdateCurriculumCourseDto } from './dto/update-curriculum-course.dto';
import { UpdateRegulationDto } from './dto/update-regulation.dto';

@ApiTags('Nội dung chương trình đào tạo')
@Controller('curricula')
export class CurriculumContentController {
  constructor(private readonly content: CurriculumContentService) {}

  // Môn trong chương trình

  @Get(':id/courses')
  @ApiOperation({ summary: 'Danh sách môn của chương trình (kèm thông tin môn)' })
  listCourses(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.listCourses(id);
  }

  @Post(':id/courses')
  @AdminOnly()
  @ApiOperation({ summary: 'Thêm môn vào chương trình (Admin). Môn đã có thì cập nhật năm/kỳ khuyến nghị.' })
  upsertCourse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCurriculumCourseDto) {
    return this.content.upsertCourse(id, dto);
  }

  @Patch(':id/courses/:courseId')
  @AdminOnly()
  @ApiOperation({ summary: 'Sửa năm/kỳ khuyến nghị của môn trong chương trình (Admin)' })
  updateCourse(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: UpdateCurriculumCourseDto,
  ) {
    return this.content.updateCourse(id, courseId, dto);
  }

  @Delete(':id/courses/:courseId')
  @AdminOnly()
  @ApiOperation({ summary: 'Bỏ môn khỏi chương trình (Admin)' })
  removeCourse(@Param('id', ParseUUIDPipe) id: string, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.content.removeCourse(id, courseId);
  }

  // Nhóm môn

  @Get(':id/groups')
  @ApiOperation({ summary: 'Danh sách nhóm môn kèm thành viên' })
  listGroups(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.listGroups(id);
  }

  @Post(':id/groups')
  @AdminOnly()
  @ApiOperation({ summary: 'Tạo nhóm môn (Admin)' })
  createGroup(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCourseGroupDto) {
    return this.content.createGroup(id, dto);
  }

  @Patch(':id/groups/:groupId')
  @AdminOnly()
  @ApiOperation({ summary: 'Sửa nhóm môn (Admin)' })
  updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateCourseGroupDto,
  ) {
    return this.content.updateGroup(id, groupId, dto);
  }

  @Delete(':id/groups/:groupId')
  @AdminOnly()
  @ApiOperation({ summary: 'Xóa nhóm môn (Admin)' })
  removeGroup(@Param('id', ParseUUIDPipe) id: string, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.content.removeGroup(id, groupId);
  }

  @Get(':id/groups/:groupId/members')
  @ApiOperation({ summary: 'Danh sách môn của nhóm' })
  listGroupMembers(@Param('id', ParseUUIDPipe) id: string, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.content.listGroupMembers(id, groupId);
  }

  @Put(':id/groups/:groupId/members')
  @AdminOnly()
  @ApiOperation({ summary: 'Thay toàn bộ môn của nhóm (Admin)' })
  replaceGroupMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: ReplaceGroupMembersDto,
  ) {
    return this.content.replaceGroupMembers(id, groupId, dto);
  }

  // Nhóm học phần (mô tả)

  @Get(':id/categories')
  @ApiOperation({ summary: 'Danh sách nhóm học phần (mô tả) kèm môn' })
  listCategories(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.listCategories(id);
  }

  @Post(':id/categories')
  @AdminOnly()
  @ApiOperation({ summary: 'Tạo nhóm học phần (Admin). Tên do admin tự đặt, không ràng buộc số môn/tín chỉ.' })
  createCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCourseCategoryDto) {
    return this.content.createCategory(id, dto);
  }

  @Patch(':id/categories/:categoryId')
  @AdminOnly()
  @ApiOperation({ summary: 'Sửa tên hoặc danh sách môn của nhóm học phần (Admin)' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateCourseCategoryDto,
  ) {
    return this.content.updateCategory(id, categoryId, dto);
  }

  @Delete(':id/categories/:categoryId')
  @AdminOnly()
  @ApiOperation({ summary: 'Xóa nhóm học phần (Admin)' })
  removeCategory(@Param('id', ParseUUIDPipe) id: string, @Param('categoryId', ParseUUIDPipe) categoryId: string) {
    return this.content.removeCategory(id, categoryId);
  }

  @Put(':id/courses/:courseId/categories')
  @AdminOnly()
  @ApiOperation({ summary: 'Thay các nhóm học phần của một môn (Admin)' })
  replaceCourseCategories(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: ReplaceCourseCategoriesDto,
  ) {
    return this.content.replaceCourseCategories(id, courseId, dto);
  }

  // Chuyên ngành

  @Get(':id/specializations')
  @ApiOperation({ summary: 'Danh sách chuyên ngành kèm các khối chuyên ngành' })
  listSpecializations(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.listSpecializations(id);
  }

  @Post(':id/specializations')
  @AdminOnly()
  @ApiOperation({ summary: 'Tạo chuyên ngành (Admin). Khối chuyên ngành tạo qua POST /groups.' })
  createSpecialization(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSpecializationDto) {
    return this.content.createSpecialization(id, dto);
  }

  @Patch(':id/specializations/:specializationId')
  @AdminOnly()
  @ApiOperation({ summary: 'Sửa chuyên ngành (Admin)' })
  updateSpecialization(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('specializationId', ParseUUIDPipe) specializationId: string,
    @Body() dto: UpdateSpecializationDto,
  ) {
    return this.content.updateSpecialization(id, specializationId, dto);
  }

  @Delete(':id/specializations/:specializationId')
  @AdminOnly()
  @ApiOperation({ summary: 'Xóa chuyên ngành và các khối chuyên ngành của nó (Admin)' })
  removeSpecialization(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('specializationId', ParseUUIDPipe) specializationId: string,
  ) {
    return this.content.removeSpecialization(id, specializationId);
  }

  // Quan hệ môn học

  @Get(':id/relations')
  @ApiQuery({ name: 'course_id', required: false, description: 'Lọc theo môn học' })
  @ApiOperation({ summary: 'Danh sách quan hệ tiên quyết/khuyến nghị trong chương trình' })
  listRelations(@Param('id', ParseUUIDPipe) id: string, @Query('course_id') courseId?: string) {
    return this.content.listRelations(id, courseId);
  }

  @Get(':id/courses/:courseId/relations')
  @ApiOperation({ summary: 'Quan hệ của một môn trong chương trình' })
  listCourseRelations(@Param('id', ParseUUIDPipe) id: string, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.content.listRelations(id, courseId);
  }

  @Put(':id/courses/:courseId/relations')
  @AdminOnly()
  @ApiOperation({ summary: 'Thay quan hệ tiên quyết/khuyến nghị của một môn (Admin)' })
  replaceCourseRelations(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: ReplaceCourseRelationsDto,
  ) {
    return this.content.replaceCourseRelations(id, courseId, dto);
  }

  // Học kỳ mở lớp

  @Get(':id/opened-semesters')
  @ApiOperation({ summary: 'Học kỳ đã mở lớp của mọi môn trong chương trình' })
  listOpenedSemesters(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.listOpenedSemesters(id);
  }

  // Quy định

  @Get(':id/regulations')
  @ApiOperation({ summary: 'Danh sách quy định của chương trình' })
  listRegulations(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.listRegulations(id);
  }

  @Post(':id/regulations')
  @AdminOnly()
  @ApiOperation({ summary: 'Thêm quy định (Admin)' })
  createRegulation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRegulationDto) {
    return this.content.createRegulation(id, dto);
  }

  @Patch(':id/regulations/:regulationId')
  @AdminOnly()
  @ApiOperation({ summary: 'Sửa quy định (Admin)' })
  updateRegulation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('regulationId', ParseUUIDPipe) regulationId: string,
    @Body() dto: UpdateRegulationDto,
  ) {
    return this.content.updateRegulation(id, regulationId, dto);
  }

  @Delete(':id/regulations/:regulationId')
  @AdminOnly()
  @ApiOperation({ summary: 'Xóa quy định (Admin)' })
  removeRegulation(@Param('id', ParseUUIDPipe) id: string, @Param('regulationId', ParseUUIDPipe) regulationId: string) {
    return this.content.removeRegulation(id, regulationId);
  }
}
