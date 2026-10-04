import {
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Req,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorator';
import { AuthenticatedRequest } from '../auth/auth-session.guard';
import { AnalysisHistoryQueryDto } from './analysis.dto';
import { AnalysisService } from './analysis.service';

@Controller('me/profile/analyses')
@Roles('student')
export class AnalysisController {
	constructor(private readonly analysisService: AnalysisService) { }

	@Post()
	analyze(@Req() request: AuthenticatedRequest) {
		return this.analysisService.analyze(request.user.id);
	}

	@Get()
	list(
		@Req() request: AuthenticatedRequest,
		@Query() query: AnalysisHistoryQueryDto,
	) {
		return this.analysisService.listHistory(request.user.id, query);
	}

	@Get(':analysisId')
	detail(
		@Req() request: AuthenticatedRequest,
		@Param('analysisId', ParseUUIDPipe) analysisId: string,
	) {
		return this.analysisService.getHistoryDetail(request.user.id, analysisId);
	}
}