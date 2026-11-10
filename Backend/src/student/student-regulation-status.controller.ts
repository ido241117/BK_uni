import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SignedIn } from '../auth/decorators/access.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { UpsertRegulationStatusDto } from './dto/upsert-regulation-status.dto';
import { StudentService } from './student.service';

@ApiTags('Trạng thái quy định')
@Controller('student-regulation-statuses')
export class StudentRegulationStatusController {
  constructor(private readonly students: StudentService) {}

  @Get('me')
  @SignedIn()
  @ApiQuery({ name: 'curriculum_id', required: false, description: 'Lọc theo chương trình đào tạo' })
  @ApiOperation({ summary: 'Trạng thái các quy định tôi đã khai' })
  list(@Req() req: AuthenticatedRequest, @Query('curriculum_id') curriculumId?: string) {
    return this.students.listMyRegulationStatuses(req.user.id, curriculumId);
  }

  @Put('me/:regulationId')
  @SignedIn()
  @ApiOperation({ summary: 'Khai hoặc cập nhật trạng thái một quy định' })
  upsert(
    @Req() req: AuthenticatedRequest,
    @Param('regulationId', ParseUUIDPipe) regulationId: string,
    @Body() dto: UpsertRegulationStatusDto,
  ) {
    return this.students.upsertMyRegulationStatus(req.user.id, regulationId, dto);
  }

  @Delete('me/:regulationId')
  @SignedIn()
  @ApiOperation({ summary: 'Bỏ trạng thái của một quy định' })
  remove(@Req() req: AuthenticatedRequest, @Param('regulationId', ParseUUIDPipe) regulationId: string) {
    return this.students.removeMyRegulationStatus(req.user.id, regulationId);
  }
}
