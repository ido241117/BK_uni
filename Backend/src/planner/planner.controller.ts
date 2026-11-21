import {
  BadRequestException, Body, Controller, Get, HttpCode, Post, Put, Req, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SignedIn } from '../auth/decorators/access.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AdjustMybkDto } from './dto/adjust-mybk.dto';
import { SolvePlanDto } from './dto/solve-plan.dto';
import { PlannerService } from './planner.service';

/** Tối đa 5 MB; file chỉ nằm trong bộ nhớ (multer memory storage mặc định), không ghi ra đĩa. */
const MYBK_MAX_BYTES = 5 * 1024 * 1024;

@ApiTags('Gợi ý lộ trình')
@Controller('plans')
export class PlannerController {
  constructor(private readonly planner: PlannerService) {}

  @Post('solve')
  @HttpCode(200)
  @SignedIn()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Giải lộ trình các kỳ còn lại theo trạng thái môn và kịch bản what-if' })
  solve(@Req() req: AuthenticatedRequest, @Body() dto: SolvePlanDto) {
    return this.planner.solve(req.user.id, dto);
  }

  @Post('mybk/review')
  @HttpCode(200)
  @SignedIn()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'T32: đọc PDF tiến độ myBK, tìm chương trình theo mã myBK, liệt kê mâu thuẫn (không lưu gì)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MYBK_MAX_BYTES, files: 1 } }))
  reviewMybk(@Req() req: AuthenticatedRequest, @UploadedFile() file?: { buffer: Buffer; size: number }) {
    if (!file?.buffer?.length) throw new BadRequestException('Chưa chọn file.');
    return this.planner.reviewMybk(req.user.id, file.buffer);
  }

  @Post('mybk/import')
  @HttpCode(200)
  @SignedIn()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Đọc PDF tiến độ myBK, lưu nội dung file và ghi trạng thái môn đúng như file. '
    + 'Trường form apply_curriculum=true: đặt chương trình trong hồ sơ theo mã myBK của file' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MYBK_MAX_BYTES, files: 1 } }))
  importMybk(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: { buffer: Buffer; size: number },
    @Body('apply_curriculum') applyCurriculum?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Chưa chọn file.');
    return this.planner.importMybk(req.user.id, file.buffer, applyCurriculum === 'true');
  }

  @Put('mybk/adjustments')
  @SignedIn()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Hiệu chỉnh: sửa trạng thái môn (kể cả thêm môn) và khai học kỳ hiện tại; nội dung file giữ nguyên' })
  adjustMybk(@Req() req: AuthenticatedRequest, @Body() dto: AdjustMybkDto) {
    return this.planner.adjustMybk(req.user.id, dto);
  }

  @Get('mybk/progress')
  @SignedIn()
  @ApiOperation({ summary: 'Nội dung file tiến độ myBK đã lưu của tài khoản đang đăng nhập' })
  getProgress(@Req() req: AuthenticatedRequest) {
    return this.planner.getProgress(req.user.id);
  }

  @Post('mybk/preview')
  @HttpCode(200)
  @SignedIn()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Đọc file tiến độ myBK, nhận chương trình, đề xuất trạng thái môn (không lưu gì)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MYBK_MAX_BYTES, files: 1 } }))
  previewMybk(@Req() req: AuthenticatedRequest, @UploadedFile() file?: { buffer: Buffer; size: number }) {
    if (!file?.buffer?.length) throw new BadRequestException('Chưa chọn file.');
    return this.planner.previewMybk(req.user.id, file.buffer);
  }
}
