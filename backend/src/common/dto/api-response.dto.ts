import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiResponseDto<T = unknown> {
	@ApiProperty({ example: false })
	error!: boolean;

	@ApiPropertyOptional({
		description: 'Payload data (object, array, primitive) or null',
		nullable: true,
	})
	data!: T | T[] | null;

	@ApiProperty({ example: 'Success' })
	message!: string;

	@ApiPropertyOptional({ example: 'VALIDATION_ERROR' })
	code?: string;

	@ApiPropertyOptional({
		type: [String],
		example: ['name: should not be empty'],
	})
	details?: unknown[];
}

export function buildSuccess<T>(
	data: T | T[],
	message = 'Thành công',
): ApiResponseDto<T> {
	return { error: false, data, message };
}

export function buildError(
	message: string,
	code: string,
	details?: unknown[],
): ApiResponseDto<null> {
	return {
		error: true,
		data: null,
		message,
		code,
		...(details?.length ? { details } : {}),
	};
}
