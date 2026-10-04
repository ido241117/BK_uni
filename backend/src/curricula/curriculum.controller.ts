import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	Req,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorator';
import { AuthenticatedRequest } from '../auth/auth-session.guard';
import {
	CreateCourseDto,
	CreateCourseRuleDto,
	CreateCurriculumDto,
	CreateElectiveGroupDto,
	CreateTermDto,
	ListCurriculaQueryDto,
	UpdateCourseDto,
	UpdateCourseRuleDto,
	UpdateCurriculumDto,
	UpdateElectiveGroupDto,
	UpdateTermDto,
} from './curriculum.dto';
import { CurriculumService } from './curriculum.service';

@Controller('admin/curricula')
@Roles('admin')
export class CurriculumController {
	constructor(private readonly curriculumService: CurriculumService) { }

	@Get()
	list(@Query() query: ListCurriculaQueryDto) {
		return this.curriculumService.listAdmin(query);
	}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	create(
		@Req() request: AuthenticatedRequest,
		@Body() body: CreateCurriculumDto,
	) {
		return this.curriculumService.createCurriculum(request.user.id, body);
	}

	@Patch(':curriculumId')
	update(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Body() body: UpdateCurriculumDto,
	) {
		return this.curriculumService.updateCurriculum(curriculumId, body);
	}

	@Post(':curriculumId/terms')
	@HttpCode(HttpStatus.CREATED)
	createTerm(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Body() body: CreateTermDto,
	) {
		return this.curriculumService.createTerm(curriculumId, body);
	}

	@Patch(':curriculumId/terms/:termId')
	updateTerm(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Param('termId', ParseUUIDPipe) termId: string,
		@Body() body: UpdateTermDto,
	) {
		return this.curriculumService.updateTerm(curriculumId, termId, body);
	}

	@Delete(':curriculumId/terms/:termId')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteTerm(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Param('termId', ParseUUIDPipe) termId: string,
	) {
		return this.curriculumService.deleteTerm(curriculumId, termId);
	}

	@Post(':curriculumId/elective-groups')
	@HttpCode(HttpStatus.CREATED)
	createElectiveGroup(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Body() body: CreateElectiveGroupDto,
	) {
		return this.curriculumService.createElectiveGroup(curriculumId, body);
	}

	@Patch(':curriculumId/elective-groups/:groupId')
	updateElectiveGroup(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Param('groupId', ParseUUIDPipe) groupId: string,
		@Body() body: UpdateElectiveGroupDto,
	) {
		return this.curriculumService.updateElectiveGroup(
			curriculumId,
			groupId,
			body,
		);
	}

	@Delete(':curriculumId/elective-groups/:groupId')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteElectiveGroup(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Param('groupId', ParseUUIDPipe) groupId: string,
	) {
		return this.curriculumService.deleteElectiveGroup(curriculumId, groupId);
	}

	@Post(':curriculumId/courses')
	@HttpCode(HttpStatus.CREATED)
	createCourse(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Body() body: CreateCourseDto,
	) {
		return this.curriculumService.createCourse(curriculumId, body);
	}

	@Patch(':curriculumId/courses/:courseId')
	updateCourse(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Param('courseId', ParseUUIDPipe) courseId: string,
		@Body() body: UpdateCourseDto,
	) {
		return this.curriculumService.updateCourse(curriculumId, courseId, body);
	}

	@Delete(':curriculumId/courses/:courseId')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteCourse(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Param('courseId', ParseUUIDPipe) courseId: string,
	) {
		return this.curriculumService.deleteCourse(curriculumId, courseId);
	}

	@Get(':curriculumId/courses/:courseId/rules')
	listRules(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Param('courseId', ParseUUIDPipe) courseId: string,
	) {
		return this.curriculumService.listCourseRules(curriculumId, courseId);
	}

	@Post(':curriculumId/courses/:courseId/rules')
	@HttpCode(HttpStatus.CREATED)
	createRule(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Param('courseId', ParseUUIDPipe) courseId: string,
		@Body() body: CreateCourseRuleDto,
	) {
		return this.curriculumService.createCourseRule(
			curriculumId,
			courseId,
			body,
		);
	}

	@Patch(':curriculumId/courses/:courseId/rules/:ruleId')
	updateRule(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Param('courseId', ParseUUIDPipe) courseId: string,
		@Param('ruleId', ParseUUIDPipe) ruleId: string,
		@Body() body: UpdateCourseRuleDto,
	) {
		return this.curriculumService.updateCourseRule(
			curriculumId,
			courseId,
			ruleId,
			body,
		);
	}

	@Delete(':curriculumId/courses/:courseId/rules/:ruleId')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteRule(
		@Param('curriculumId', ParseUUIDPipe) curriculumId: string,
		@Param('courseId', ParseUUIDPipe) courseId: string,
		@Param('ruleId', ParseUUIDPipe) ruleId: string,
	) {
		return this.curriculumService.deleteCourseRule(
			curriculumId,
			courseId,
			ruleId,
		);
	}
}
