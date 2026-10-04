import {
	CallHandler,
	ExecutionContext,
	Injectable,
	Logger,
	NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { buildSuccess } from '../dto/api-response.dto';

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
	private readonly logger = new Logger(TransformResponseInterceptor.name);

	intercept(
		_context: ExecutionContext,
		next: CallHandler,
	): Observable<unknown> {
		return next.handle().pipe(
			map((data) => {
				if (
					data &&
					typeof data === 'object' &&
					'error' in data &&
					'message' in data &&
					'data' in data
				) {
					return { ...(data as Record<string, unknown>) };
				}
				return buildSuccess(data);
			}),
			catchError((error: unknown) => {
				const message =
					error instanceof Error ? error.message : 'Lỗi không xác định';
				this.logger.error(message);
				return throwError(() => error);
			}),
		);
	}
}
