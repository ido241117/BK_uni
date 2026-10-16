import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Req,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorator';
import { AuthenticatedRequest } from '../auth/auth-session.guard';
import { ConversationListQueryDto, SendConversationTurnDto } from './conversation.dto';
import { ConversationService } from './conversation.service';

@Controller('me/profile/conversations')
@Roles('student')
export class ConversationController {
	constructor(private readonly conversationService: ConversationService) { }

	@Post()
	create(@Req() request: AuthenticatedRequest) {
		return this.conversationService.create(request.user.id);
	}

	@Post(':conversationId/turns')
	@HttpCode(HttpStatus.OK)
	sendTurn(
		@Req() request: AuthenticatedRequest,
		@Param('conversationId', new ParseUUIDPipe()) conversationId: string,
		@Body() body: SendConversationTurnDto,
	) {
		return this.conversationService.sendTurn(
			request.user.id,
			conversationId,
			body.message,
		);
	}

	@Get()
	list(
		@Req() request: AuthenticatedRequest,
		@Query() query: ConversationListQueryDto,
	) {
		return this.conversationService.list(request.user.id, query);
	}

	@Get(':conversationId')
	detail(
		@Req() request: AuthenticatedRequest,
		@Param('conversationId', new ParseUUIDPipe()) conversationId: string,
	) {
		return this.conversationService.detail(request.user.id, conversationId);
	}

	@Delete(':conversationId')
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(
		@Req() request: AuthenticatedRequest,
		@Param('conversationId', new ParseUUIDPipe()) conversationId: string,
	) {
		return this.conversationService.delete(request.user.id, conversationId);
	}
}