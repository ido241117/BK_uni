import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/auth.decorator';
import { AuthenticatedRequest } from '../auth/auth-session.guard';
import { RecommendationService } from './recommendation.service';

@Controller('me/profile')
@Roles('student')
export class RecommendationController {
	constructor(private readonly recommendationService: RecommendationService) { }

	@Post('course-recommendations')
	@HttpCode(HttpStatus.OK)
	recommend(@Req() request: AuthenticatedRequest) {
		return this.recommendationService.recommend(request.user.id);
	}
}
