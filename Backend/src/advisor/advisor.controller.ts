import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SignedIn } from '../auth/decorators/access.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AdvisorService } from './advisor.service';
import { SendAdvisorMessageDto } from './dto/send-advisor-message.dto';

@ApiTags('Tư vấn với AI')
@Controller('advisor')
export class AdvisorController {
  constructor(private readonly advisor: AdvisorService) {}

  @Get('sessions')
  @SignedIn()
  @ApiOperation({ summary: 'Các cuộc trò chuyện của tôi (mới nhất trước, tối đa 50)' })
  list(@Req() req: AuthenticatedRequest) {
    return this.advisor.listSessions(req.user.id);
  }

  @Get('sessions/:id')
  @SignedIn()
  @ApiOperation({ summary: 'Một cuộc trò chuyện kèm toàn bộ trajectory (system/context/user/assistant/tool/answer)' })
  detail(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.advisor.getSession(req.user.id, id);
  }

  @Delete('sessions/:id')
  @SignedIn()
  @ApiOperation({ summary: 'Xóa một cuộc trò chuyện' })
  remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.advisor.deleteSession(req.user.id, id);
  }

  @Post('messages')
  @SignedIn()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Gửi tin nhắn cho AI; chạy agent đến khi có câu trả lời và trả về các bước mới của lượt này',
  })
  send(@Req() req: AuthenticatedRequest, @Body() dto: SendAdvisorMessageDto) {
    return this.advisor.sendMessage(req.user.id, dto);
  }
}
