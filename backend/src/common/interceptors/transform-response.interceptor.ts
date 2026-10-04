import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { buildSuccess } from '../dto/api-response.dto';

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
	intercept(
		_context: ExecutionContext,
		next: CallHandler,
	): Observable<unknown> {
		return next.handle().pipe(
			map((data) => {
				if (isResponseEnvelope(data)) {
					return { ...data };
				}
				return buildSuccess(data);
			}),
		);
	}
}

function isResponseEnvelope(data: unknown): data is Record<string, unknown> {
	if (typeof data !== 'object' || data === null) return false;
	const candidate = data as Record<string, unknown>;
	return (
		typeof candidate.error === 'boolean' &&
		'message' in candidate &&
		'data' in candidate
	);
}
