import {
	ExecutionContext,
	ForbiddenException,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AuthSession } from '../users/auth-session.entity';
import { User } from '../users/user.entity';
import { IS_PUBLIC_KEY } from './auth.decorator';
import { AuthSessionGuard } from './auth-session.guard';
import { createCsrfToken } from './csrf.util';

describe('AuthSessionGuard', () => {
	let isPublic: boolean;
	let allowedRoles: string[] | undefined;
	const queryBuilder = {
		innerJoinAndSelect: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		getOne: jest.fn(),
	};
	const repository = { createQueryBuilder: jest.fn(() => queryBuilder) };
	const getRepository = jest.fn(() => repository);
	const dataSource = {
		getRepository,
	} as unknown as DataSource;
	const reflector = {
		getAllAndOverride: jest.fn((key: string) =>
			key === IS_PUBLIC_KEY ? isPublic : allowedRoles,
		),
	} as unknown as Reflector;
	const config = {
		get: jest.fn((key: string) =>
			key === 'NODE_ENV' ? 'development' : undefined,
		),
	} as unknown as ConfigService;
	const response = { setHeader: jest.fn() };
	let guard: AuthSessionGuard;

	const requestFor = (method: string, headers: Record<string, string> = {}) =>
		({ method, headers }) as never;
	const contextFor = (request: never) =>
		({
			switchToHttp: () => ({
				getRequest: () => request,
				getResponse: () => response,
			}),
			getHandler: () => 'handler',
			getClass: () => 'controller',
		}) as unknown as ExecutionContext;

	beforeEach(() => {
		isPublic = false;
		allowedRoles = undefined;
		queryBuilder.getOne.mockReset();
		response.setHeader.mockReset();
		guard = new AuthSessionGuard(dataSource, reflector, config);
	});

	it('allows a declared public GET route without a session', async () => {
		isPublic = true;
		await expect(
			guard.canActivate(contextFor(requestFor('GET'))),
		).resolves.toBe(true);
		expect(getRepository).not.toHaveBeenCalled();
	});

	it('requires an allowed Origin and valid CSRF token on public mutations', async () => {
		isPublic = true;
		const token = createCsrfToken();
		const validRequest = requestFor('POST', {
			origin: 'http://localhost:5173',
			cookie: `bk_uni_csrf=${token}`,
			'x-csrf-token': token,
		});
		await expect(guard.canActivate(contextFor(validRequest))).resolves.toBe(
			true,
		);

		const invalidRequest = requestFor('POST', {
			origin: 'https://attacker.example',
			cookie: `bk_uni_csrf=${token}`,
			'x-csrf-token': token,
		});
		await expect(
			guard.canActivate(contextFor(invalidRequest)),
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('rejects requests without a valid session', async () => {
		await expect(
			guard.canActivate(contextFor(requestFor('GET'))),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('loads a live session and enforces allowed roles', async () => {
		const user = { id: 'user-1', role: 'student' } as User;
		const session = { id: 'session-1', user } as AuthSession;
		queryBuilder.getOne.mockResolvedValue(session);
		const request = requestFor('GET', {
			cookie: 'bk_uni_session=opaque-session-token',
		});
		await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
		expect(request.user).toBe(user);
		expect(request.authSession).toBe(session);
		expect(queryBuilder.andWhere).toHaveBeenCalledWith(
			'session.revoked_at IS NULL',
		);
		expect(queryBuilder.andWhere).toHaveBeenCalledWith(
			'session.expires_at > :now',
			expect.any(Object),
		);

		allowedRoles = ['admin'];
		await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
			ForbiddenException,
		);
	});

	it('expires stale cookies when the session is revoked or expired', async () => {
		queryBuilder.getOne.mockResolvedValue(null);
		await expect(
			guard.canActivate(
				contextFor(
					requestFor('GET', {
						cookie: 'bk_uni_session=expired-session-token',
					}),
				),
			),
		).rejects.toBeInstanceOf(UnauthorizedException);
		expect(response.setHeader).toHaveBeenCalledWith(
			'Set-Cookie',
			expect.stringContaining('Max-Age=0'),
		);
	});
});
