import {
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Query,
	Req,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorator';
import { AuthenticatedRequest } from '../auth/auth-session.guard';
import { CourseListQueryDto, ListCurriculaQueryDto } from './curriculum.dto';
import { CurriculumService } from './curriculum.service';

@Controller('curricula')
@Roles('student', 'admin')
export class CurriculumReadController {
	constructor(private readonly curriculumService: CurriculumService) {}

	@Get()
	list(@Query() query: ListCurriculaQueryDto) {
		return this.curriculumService.listAdmin(query);
	}

	@Get(':curriculumId')
	get(@Param('curriculumId', ParseUUIDPipe) curriculumId: string) {
		return this.curriculumService.getCurriculum(curriculumId);
	}

	@Get(':curriculumId/structure')
	structure(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.curriculumService.getStructure(curriculumId, request.user);
	}

	@Get(':curriculumId/courses')
	courses(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Query() query: CourseListQueryDto,
		@Req() request: AuthenticatedRequest,
	) {
		return this.curriculumService.listCourses(
			curriculumId,
			query,
			request.user,
		);
	}
}
