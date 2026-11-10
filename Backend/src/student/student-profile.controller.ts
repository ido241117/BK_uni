import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SignedIn } from '../auth/decorators/access.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { StudentService } from './student.service';

@ApiTags('Hồ sơ sinh viên')
@Controller('student-profiles')
export class StudentProfileController {
  constructor(private readonly students: StudentService) {}

  @Get('me')
  @SignedIn()
  @ApiOperation({ summary: 'Hồ sơ của tôi (null nếu chưa tạo)' })
  me(@Req() req: AuthenticatedRequest) {
    return this.students.findMyProfile(req.user.id);
  }

  @Patch('me')
  @SignedIn()
  @ApiOperation({ summary: 'Cập nhật hồ sơ của tôi (tạo mới nếu chưa có)' })
  save(@Req() req: AuthenticatedRequest, @Body() dto: UpdateStudentProfileDto) {
    return this.students.saveMyProfile(req.user.id, dto);
  }
}
