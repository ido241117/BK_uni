import { HttpException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AuthSession } from '../users/auth-session.entity';
import { User } from '../users/user.entity';

jest.mock('bcryptjs', () => ({
	hash: jest.fn(),
	compare: jest.fn().mockResolvedValue(false),
}));

describe('AuthService security limits', () => {
	const queryBuilder = {
		where: jest.fn().mockReturnThis(),
		getOne: jest.fn().mockResolvedValue(null),
	};
	const repository = {
		createQueryBuilder: jest.fn(() => queryBuilder),
	};
	const dataSource = {
		getRepository: jest.fn(() => repository),
	} as never;
	const config = { get: jest.fn(() => undefined) } as never;
	let service: AuthService;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-10-04T00:00:00Z'));
		queryBuilder.getOne.mockClear();
		service = new AuthService(dataSource, config);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('locks an account on the tenth failed login and unlocks after 15 minutes', async () => {
		for (let attempt = 0; attempt < 10; attempt += 1) {
			await expect(
				service.login('student@example.test', 'wrong-pass'),
			).rejects.toBeInstanceOf(UnauthorizedException);
		}
		await expect(
			service.login('student@example.test', 'wrong-pass'),
		).rejects.toBeInstanceOf(UnauthorizedException);
		expect(queryBuilder.getOne).toHaveBeenCalledTimes(10);

		jest.advanceTimersByTime(15 * 60_000 + 1);
		await expect(
			service.login('student@example.test', 'wrong-pass'),
		).rejects.toBeInstanceOf(UnauthorizedException);
		expect(queryBuilder.getOne).toHaveBeenCalledTimes(11);
	});

	it.each([
		['login', 30],
		['register', 10],
	] as const)(
		'returns 429 after %i %s requests from one IP',
		(action, maximum) => {
			const setRetryAfter = jest.fn();
			for (let attempt = 0; attempt < maximum; attempt += 1) {
				service.assertRateLimit(action, '127.0.0.1', setRetryAfter);
			}

			try {
				service.assertRateLimit(action, '127.0.0.1', setRetryAfter);
				throw new Error('Expected rate limit to reject the request.');
			} catch (error) {
				expect(error).toBeInstanceOf(HttpException);
				expect((error as HttpException).getStatus()).toBe(429);
				expect(setRetryAfter).toHaveBeenCalledWith(
					action === 'login' ? 900 : 3600,
				);
			}
		},
	);
});

describe('AuthService account workflows', () => {
	it('creates a student, empty profile, and hashed session in one transaction', async () => {
		jest.mocked(bcrypt.hash).mockResolvedValue('bcrypt-hash');
		let generatedId = 0;
		const manager = {
			create: jest.fn(
				(_entity: unknown, values: Record<string, unknown>) => values,
			),
			save: jest.fn((values: Record<string, unknown>) => ({
				...values,
				id: `generated-${++generatedId}`,
			})),
		};
		const dataSource = {
			transaction: jest.fn(
				(callback: (transactionManager: typeof manager) => unknown) =>
					callback(manager),
			),
		} as never;
		const service = new AuthService(dataSource, { get: jest.fn() } as never);

		const result = await service.register(
			' Student@Example.Test ',
			'password-123',
		);

		expect(dataSource.transaction).toHaveBeenCalledTimes(1);
		expect(manager.save).toHaveBeenCalledTimes(3);
		expect(manager.save.mock.calls[0][0]).toMatchObject({
			email: 'student@example.test',
			passwordHash: 'bcrypt-hash',
			role: 'student',
		});
		expect(manager.save.mock.calls[1][0]).toMatchObject({
			userId: 'generated-1',
			displayName: null,
			curriculumId: null,
		});
		const persistedSession = manager.save.mock.calls[2][0] as AuthSession;
		expect(persistedSession.tokenHash).toBe(
			createHash('sha256').update(result.token).digest('hex'),
		);
		expect(persistedSession.tokenHash).not.toBe(result.token);
		expect(result.user.role).toBe('student');
		expect(result.profile).toMatchObject({
			displayName: null,
			curriculumId: null,
		});
	});

	it('changes the password and revokes only other active sessions', async () => {
		jest.mocked(bcrypt.hash).mockResolvedValue('new-bcrypt-hash');
		const sessionQuery = {
			update: jest.fn().mockReturnThis(),
			set: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			execute: jest.fn().mockResolvedValue({ affected: 2 }),
		};
		const userRepository = {
			update: jest.fn().mockResolvedValue({ affected: 1 }),
		};
		const sessionRepository = {
			createQueryBuilder: jest.fn(() => sessionQuery),
		};
		const manager = {
			getRepository: jest.fn((entity: unknown) =>
				entity === User ? userRepository : sessionRepository,
			),
		};
		const dataSource = {
			transaction: jest.fn(
				(callback: (transactionManager: typeof manager) => unknown) =>
					callback(manager),
			),
		} as never;
		const service = new AuthService(dataSource, { get: jest.fn() } as never);

		await service.changePassword('user-1', 'current-session', 'new-password');

		expect(userRepository.update).toHaveBeenCalledWith(
			{ id: 'user-1' },
			{ passwordHash: 'new-bcrypt-hash' },
		);
		expect(sessionQuery.where).toHaveBeenCalledWith('user_id = :userId', {
			userId: 'user-1',
		});
		expect(sessionQuery.andWhere).toHaveBeenCalledWith(
			'id != :currentSessionId',
			{ currentSessionId: 'current-session' },
		);
		expect(sessionQuery.andWhere).toHaveBeenCalledWith('revoked_at IS NULL');
	});
});
