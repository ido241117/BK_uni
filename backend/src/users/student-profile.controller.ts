import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Put,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorator';
import { AuthenticatedRequest } from '../auth/auth-session.guard';
import {
  UpdateCourseStatusesDto,
  UpdateStudentProfileDto,
} from './student-profile.dto';
import { StudentProfileService } from './student-profile.service';

@Controller('me/profile')
@Roles('student')
export class StudentProfileController {
  constructor(private readonly profileService: StudentProfileService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.profileService.get(request.user.id);
  }

  @Put()
  update(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateStudentProfileDto,
  ) {
    return this.profileService.update(request.user.id, body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() request: AuthenticatedRequest) {
    return this.profileService.remove(request.user.id);
  }

  @Patch('course-statuses')
  updateStatuses(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateCourseStatusesDto,
  ) {
    return this.profileService.updateStatuses(request.user.id, body.items);
  }
}
