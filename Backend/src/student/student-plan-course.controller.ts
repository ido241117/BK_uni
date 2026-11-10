import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SignedIn } from '../auth/decorators/access.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UpsertPlanCourseDto } from './dto/upsert-plan-course.dto';
import { StudentService } from './student.service';

@ApiTags('Kế hoạch học tập')
@Controller('student-plan-courses')
export class StudentPlanCourseController {
  constructor(private readonly students: StudentService) {}

  @Get('me')
  @SignedIn()
  @ApiQuery({ name: 'curriculum_id', required: false, description: 'Lọc theo chương trình đào tạo' })
  @ApiOperation({ summary: 'Các môn trong kế hoạch của tôi (kèm thông tin môn)' })
  list(@Req() req: AuthenticatedRequest, @Query('curriculum_id') curriculumId?: string) {
    return this.students.listMyPlanCourses(req.user.id, curriculumId);
  }

  @Put('me/:curriculumId/:courseId')
  @SignedIn()
  @ApiOperation({ summary: 'Thêm hoặc đổi học kỳ dự kiến của môn trong kế hoạch' })
  upsert(
    @Req() req: AuthenticatedRequest,
    @Param('curriculumId', ParseUUIDPipe) curriculumId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: UpsertPlanCourseDto,
  ) {
    return this.students.upsertMyPlanCourse(req.user.id, curriculumId, courseId, dto);
  }

  @Delete('me/:curriculumId/:courseId')
  @SignedIn()
  @ApiOperation({ summary: 'Bỏ môn khỏi kế hoạch' })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('curriculumId', ParseUUIDPipe) curriculumId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ) {
    return this.students.removeMyPlanCourse(req.user.id, curriculumId, courseId);
  }
}
