import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorator';
import { CourseListQueryDto, ListCurriculaQueryDto } from './curriculum.dto';
import { CurriculumService } from './curriculum.service';

@Controller('curricula')
@Roles('student', 'admin')
export class CurriculumReadController {
	constructor(private readonly curriculumService: CurriculumService) { }

	@Get()
	list(@Query() query: ListCurriculaQueryDto) {
		return this.curriculumService.listAdmin(query);
	}

	@Get(':curriculumId')
	get(@Param('curriculumId', ParseUUIDPipe) curriculumId: string) {
		return this.curriculumService.getCurriculum(curriculumId);
	}

	@Get(':curriculumId/structure')
	structure(@Param('curriculumId', ParseUUIDPipe) curriculumId: string) {
		return this.curriculumService.getStructure(curriculumId);
	}

	@Get(':curriculumId/courses')
	courses(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Query() query: CourseListQueryDto,
	) {
		return this.curriculumService.listCourses(curriculumId, query);
	}
}
