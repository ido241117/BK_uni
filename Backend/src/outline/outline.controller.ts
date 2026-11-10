import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminOnly, SignedIn } from '../auth/decorators/access.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ImportOutlinesDto, OutlineDiscrepancyQueryDto, OutlineSemesterQueryDto } from './dto/outline.dto';
import { OutlineImportService } from './outline-import.service';
import { OutlineService } from './outline.service';

/** Route nhập đề cương nhận body lớn (tới 25 MB), xem `app.setup.ts`. */
export const OUTLINE_IMPORT_PATH = 'course-outlines/import';

@ApiTags('Đề cương môn học')
@Controller('course-outlines')
export class OutlineController {
  constructor(
    private readonly outlines: OutlineService,
    private readonly importer: OutlineImportService,
  ) {}

  @Post('import')
  @AdminOnly()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Nhập một file bkuni.course-outlines (chỉ thêm/cập nhật theo course_code + version, không xóa, không sửa courses/course_relations)',
  })
  import(@Req() req: AuthenticatedRequest, @Body() dto: ImportOutlinesDto) {
    return this.importer.importDocument(dto, { channel: 'api', userId: req.user.id });
  }

  @Get('imports')
  @AdminOnly()
  @ApiOperation({ summary: '50 lần nhập đề cương gần nhất' })
  imports() {
    return this.outlines.listImports();
  }

  @Get('discrepancies')
  @AdminOnly()
  @ApiOperation({ summary: 'Đối chiếu điều kiện môn giữa chương trình đào tạo và đề cương (chỉ đọc)' })
  discrepancies(@Query() query: OutlineDiscrepancyQueryDto) {
    return this.outlines.discrepancies(query.curriculum_id, query.semester);
  }

  @Get('summaries')
  @SignedIn()
  @ApiOperation({ summary: 'Tóm tắt đề cương (giờ học, đánh giá, điều kiện) của mọi môn trong một chương trình, theo học kỳ' })
  summaries(@Query() query: OutlineDiscrepancyQueryDto) {
    return this.outlines.summaries(query.curriculum_id, query.semester);
  }

  @Get('by-code/:code')
  @SignedIn()
  @ApiOperation({ summary: 'Đề cương của một môn: bản áp dụng cho học kỳ (mặc định kỳ hiện tại) + danh sách phiên bản' })
  byCode(@Param('code') code: string, @Query() query: OutlineSemesterQueryDto) {
    return this.outlines.findByCode(code, query.semester);
  }

  @Get(':id')
  @SignedIn()
  @ApiOperation({ summary: 'Một phiên bản đề cương cụ thể (kèm nội dung và điều kiện môn)' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.outlines.findById(id);
  }
}
