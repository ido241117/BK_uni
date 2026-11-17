import { Body, Controller, Delete, Get, Logger, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SignedIn } from '../auth/decorators/access.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { AdvisorService } from './advisor.service';
import { SendAdvisorMessageDto } from './dto/send-advisor-message.dto';

@ApiTags('Tư vấn với AI')
@Controller('advisor')
export class AdvisorController {
  private readonly logger = new Logger(AdvisorController.name);

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

  @Post('messages/stream')
  @SignedIn()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Như POST /advisor/messages nhưng trả Server-Sent Events: session → step (mỗi bước khi vừa lưu) → done | error',
  })
  async stream(@Req() req: AuthenticatedRequest, @Body() dto: SendAdvisorMessageDto, @Res() res: Response): Promise<void> {
    // Lỗi kiểm tra (400/409/503...) ném ra trước khi mở stream nên vẫn đi qua exception filter như thường.
    const turn = await this.advisor.beginTurn(req.user.id, dto);

    let open = true;
    const send = (event: string, data: unknown) => {
      if (open && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    // Client ngắt (đóng tab, đổi trang) thì ngừng ghi nhưng lượt vẫn chạy tiếp và lưu vào CSDL.
    res.on('close', () => { open = false; });

    let heartbeat: NodeJS.Timeout | undefined;
    let running = false;
    try {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      req.socket.setNoDelay(true);
      // Một vòng gọi model có thể im lặng tới vài phút; comment SSE giữ kết nối không bị coi là treo.
      heartbeat = setInterval(() => { if (open && !res.writableEnded) res.write(': ping\n\n'); }, 15_000);

      send('session', turn.session);
      running = true;
      const result = await this.advisor.runPrepared(turn, step => send('step', step));
      send('done', { session: result.session });
    } catch (error) {
      // runPrepared tự nhả khóa; chỉ cần nhả khi lỗi xảy ra trước khi kịp gọi nó.
      if (!running) this.advisor.releaseTurn(turn);
      this.logger.error(`Advisor stream failed: ${error instanceof Error ? error.stack : String(error)}`);
      send('error', { message: 'Hệ thống đang bận. Vui lòng thử lại sau.' });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }
}
