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
}

export function buildSuccess<T>(
	data: T | T[],
	message = 'Thành công',
): ApiResponseDto<T> {
	return { error: false, data, message };
}

export function buildError(message: string): ApiResponseDto<null> {
	return { error: true, data: null, message };
}
