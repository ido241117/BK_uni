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
		[HttpStatus.TOO_MANY_REQUESTS]:
			'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
		[HttpStatus.INTERNAL_SERVER_ERROR]:
			'Hệ thống đang bận. Vui lòng thử lại sau.',
	};

	private normalizeMessage(status: number, rawMessage: string) {
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
		let status = HttpStatus.INTERNAL_SERVER_ERROR;
		let message = 'Lỗi hệ thống';

		if (exception instanceof HttpException) {
			status = exception.getStatus();
			const result = exception.getResponse();
			if (typeof result === 'string') message = result;
			else if (
				typeof result === 'object' &&
				result !== null &&
				'message' in result
			) {
				const exceptionMessage = (result as { message?: unknown }).message;
				if (typeof exceptionMessage === 'string') {
					message = exceptionMessage;
				} else if (
					Array.isArray(exceptionMessage) &&
					exceptionMessage.every((item) => typeof item === 'string')
				) {
					message = exceptionMessage.join('; ');
				}
			}
		}

		response
			.status(status)
			.json(buildError(this.normalizeMessage(status, message)));
	}
}
