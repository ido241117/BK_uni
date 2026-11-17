import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import {
  CHECK_VIOLATION,
  DEADLOCK_DETECTED,
  postgresErrorCode,
  SERIALIZATION_FAILURE,
} from '../database/postgres-error';
import { buildError } from '../dto/api-response.dto';

const RETRY_MESSAGE = 'Dữ liệu vừa được một yêu cầu khác thay đổi. Vui lòng thử lại.';
const DATABASE_ERRORS: Record<string, { status: number; message: string }> = {
  [CHECK_VIOLATION]: { status: HttpStatus.BAD_REQUEST, message: 'Dữ liệu không hợp lệ.' },
  [SERIALIZATION_FAILURE]: { status: HttpStatus.CONFLICT, message: RETRY_MESSAGE },
  [DEADLOCK_DETECTED]: { status: HttpStatus.CONFLICT, message: RETRY_MESSAGE },
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const database = exception instanceof QueryFailedError ? DATABASE_ERRORS[postgresErrorCode(exception) ?? ''] : undefined;
    if (database) {
      // Lỗi CSDL "có chủ đích": dữ liệu vi phạm CHECK, hoặc transaction thua trong tranh chấp đồng thời.
      this.logger.warn(`${exception instanceof Error ? exception.message : String(exception)}`);
      response.status(database.status).json(buildError(database.message));
      return;
    }
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Hệ thống đang bận. Vui lòng thử lại sau.';
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    } else if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const value = typeof body === 'string' ? body : 'message' in body ? body.message : undefined;
      if (typeof value === 'string') message = value;
      else if (Array.isArray(value)) message = value.join('; ');
    }
    response.status(status).json(buildError(message));
  }
}
