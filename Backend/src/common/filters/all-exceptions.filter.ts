import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { buildError } from '../dto/api-response.dto';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
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
