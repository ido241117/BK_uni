import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SignedIn } from '../auth/decorators/access.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { BulkUpsertStudentCoursesDto } from './dto/bulk-upsert-student-courses.dto';
import { StudentService } from './student.service';

@ApiTags('Trạng thái môn học')
@Controller('student-courses')
export class StudentCourseController {
  constructor(private readonly students: StudentService) {}

  @Get('me')
  @SignedIn()
  @ApiOperation({ summary: 'Trạng thái các môn tôi đã khai (kèm thông tin môn)' })
  list(@Req() req: AuthenticatedRequest) {
    return this.students.listMyCourses(req.user.id);
  }

  @Put('me')
  @SignedIn()
  @ApiOperation({ summary: 'Khai trạng thái nhiều môn một lần (nhập tiến độ myBK); môn không gửi giữ nguyên' })
  bulkUpsert(@Req() req: AuthenticatedRequest, @Body() dto: BulkUpsertStudentCoursesDto) {
    return this.students.bulkUpsertMyCourses(req.user.id, dto);
  }

}
