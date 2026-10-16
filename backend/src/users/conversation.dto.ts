import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SendConversationTurnDto {
	@IsString()
	@MinLength(1)
	@MaxLength(4000)
	message: string;
}

export class ConversationListQueryDto {
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 20;

	@Type(() => Number)
	@IsInt()
	@Min(0)
	offset = 0;
}