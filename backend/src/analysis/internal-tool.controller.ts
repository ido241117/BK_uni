import {
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	Req,
	UseGuards,
} from '@nestjs/common';
import { InternalService } from '../auth/auth.decorator';
import { RecommendationService } from './recommendation.service';
import { InternalToolGuard, InternalToolRequest } from './internal-tool.guard';

@Controller('internal/v1/tools')
@InternalService()
@UseGuards(InternalToolGuard)
export class InternalToolController {
	constructor(private readonly recommendationService: RecommendationService) { }

	@Post('recommendation')
	@HttpCode(HttpStatus.OK)
	recommend(@Req() request: InternalToolRequest) {
		const delegatedContext = request.delegatedContext;
		if (!delegatedContext) throw new Error('InternalToolGuard did not set delegated context');
		return this.recommendationService.recommend(delegatedContext.sub);
	}
}