import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	InternalServerErrorException,
	UnauthorizedException,
	UnprocessableEntityException,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { buildSuccess } from './dto/api-response.dto';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { TransformResponseInterceptor } from './interceptors/transform-response.interceptor';

describe('API response envelope', () => {
	it('wraps successful values in the standard envelope', async () => {
		const interceptor = new TransformResponseInterceptor();
		const response = await lastValueFrom(
			interceptor.intercept({} as never, { handle: () => of({ id: '1' }) }),
		);

		expect(response).toEqual(buildSuccess({ id: '1' }));
	});

	it('preserves an already enveloped response', async () => {
		const envelope = buildSuccess('ok');
		const interceptor = new TransformResponseInterceptor();
		const response = await lastValueFrom(
			interceptor.intercept({} as never, { handle: () => of(envelope) }),
		);

		expect(response).toEqual(envelope);
	});

	it('returns validation details without changing the HTTP status', () => {
		const result = applyFilter(
			new BadRequestException({ message: ['email must be an email'] }),
		);

		expect(result.status).toBe(400);
		expect(result.body).toMatchObject({
			error: true,
			data: null,
			code: 'VALIDATION_ERROR',
			details: ['email must be an email'],
		});
	});

	it.each([
		[new UnauthorizedException(), 401, 'AUTH_REQUIRED'],
		[new ForbiddenException(), 403, 'FORBIDDEN'],
		[new ConflictException(), 409, 'CONFLICT'],
		[new UnprocessableEntityException(), 422, 'BUSINESS_RULE_VIOLATION'],
	])('uses the standard envelope for HTTP %i', (exception, status, code) => {
		const result = applyFilter(exception);

		expect(result.status).toBe(status);
		expect(result.body).toMatchObject({
			error: true,
			data: null,
			code,
		});
	});

	it('hides internal exception messages and stack details', () => {
		const result = applyFilter(
			new InternalServerErrorException('secret database password'),
		);

		expect(result.status).toBe(500);
		expect(JSON.stringify(result.body)).not.toContain(
			'secret database password',
		);
		expect(JSON.stringify(result.body)).not.toContain('stack');
		expect(result.body).toMatchObject({
			error: true,
			data: null,
			code: 'INTERNAL_SERVER_ERROR',
		});
	});
});

function applyFilter(exception: unknown) {
	let status = 0;
	let body: unknown;
	const response = {
		status: (value: number) => {
			status = value;
			return {
				json: (value: unknown) => {
					body = value;
				},
			};
		},
	};
	const host = {
		switchToHttp: () => ({ getResponse: () => response }),
	};

	new AllExceptionsFilter().catch(exception, host as never);
	return { status, body };
}
