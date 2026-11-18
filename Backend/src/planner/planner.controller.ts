import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SignedIn } from '../auth/decorators/access.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { SolvePlanDto } from './dto/solve-plan.dto';
import { PlannerService } from './planner.service';

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
}
