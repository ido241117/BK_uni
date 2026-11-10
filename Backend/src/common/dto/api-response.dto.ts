import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T = unknown> {
  @ApiProperty()
  error!: boolean;

  @ApiProperty({ nullable: true })
  data!: T | null;

  @ApiProperty()
  message!: string;
}

export function buildSuccess<T>(data: T, message = 'Thành công'): ApiResponseDto<T> {
  return { error: false, data: data ?? null, message };
}

export function buildError(message: string): ApiResponseDto<null> {
  return { error: true, data: null, message };
}
