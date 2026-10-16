import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
} from '@nestjs/common';
import { buildError } from '../dto/api-response.dto';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
	private readonly fallbackMessages: Record<number, string> = {
		[HttpStatus.BAD_REQUEST]: 'Dữ liệu gửi lên không hợp lệ.',
		[HttpStatus.UNAUTHORIZED]: 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.',
		[HttpStatus.FORBIDDEN]: 'Bạn không có quyền thực hiện thao tác này.',
		[HttpStatus.NOT_FOUND]: 'Không tìm thấy dữ liệu yêu cầu.',
		[HttpStatus.CONFLICT]: 'Dữ liệu đang xung đột, vui lòng kiểm tra lại.',
		[HttpStatus.UNPROCESSABLE_ENTITY]:
			'Dữ liệu không đáp ứng quy tắc nghiệp vụ.',
		[HttpStatus.TOO_MANY_REQUESTS]:
			'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
		[HttpStatus.INTERNAL_SERVER_ERROR]:
			'Hệ thống đang bận. Vui lòng thử lại sau.',
	};

	private normalizeMessage(status: number, rawMessage: string) {
		if (status >= 500) {
			return this.fallbackMessages[HttpStatus.INTERNAL_SERVER_ERROR];
		}
		const message = (rawMessage || '').trim();
		if (!message) {
			return (
				this.fallbackMessages[status] ||
				this.fallbackMessages[HttpStatus.INTERNAL_SERVER_ERROR]
			);
		}
		return message;
	}

	catch(exception: unknown, host: ArgumentsHost) {
		const ctx = host.switchToHttp();
		const response: {
			status: (code: number) => { json: (body: unknown) => void };
		} = ctx.getResponse();
		let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
		let message = 'Lỗi hệ thống';
		let code: string | undefined;
		let details: unknown[] | undefined;

		if (exception instanceof HttpException) {
			status = exception.getStatus();
			const result = exception.getResponse();
			if (typeof result === 'string') message = result;
			else if (
				typeof result === 'object' &&
				result !== null
			) {
				const exceptionBody = result as {
					message?: unknown;
					code?: unknown;
					details?: unknown;
				};
				const exceptionMessage = exceptionBody.message;
				if (typeof exceptionBody.code === 'string') code = exceptionBody.code;
				if (Array.isArray(exceptionBody.details)) {
					details = exceptionBody.details;
				}
				if (typeof exceptionMessage === 'string') {
					message = exceptionMessage;
				} else if (
					Array.isArray(exceptionMessage) &&
					exceptionMessage.every((item) => typeof item === 'string')
				) {
					details = details ?? exceptionMessage;
					message = this.fallbackMessages[status] ?? 'Yêu cầu không hợp lệ.';
				}
			}
		}

		const defaultCodes: Record<number, string> = {
			[HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
			[HttpStatus.UNAUTHORIZED]: 'AUTH_REQUIRED',
			[HttpStatus.FORBIDDEN]: 'FORBIDDEN',
			[HttpStatus.NOT_FOUND]: 'NOT_FOUND',
			[HttpStatus.CONFLICT]: 'CONFLICT',
			[HttpStatus.UNPROCESSABLE_ENTITY]: 'BUSINESS_RULE_VIOLATION',
			[HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
			[HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
		};
		if (status >= 500) {
			if (!['AGENT_UNAVAILABLE', 'AGENT_TIMEOUT'].includes(code ?? '')) {
				code = 'INTERNAL_SERVER_ERROR';
			}
			details = undefined;
		}

		response
			.status(status)
			.json(
				buildError(
					this.normalizeMessage(status, message),
					code ?? defaultCodes[status] ?? 'REQUEST_FAILED',
					details,
				),
			);
	}
}
