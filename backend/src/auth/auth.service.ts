import {
	ConflictException,
	HttpException,
	HttpStatus,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AuthSession } from '../users/auth-session.entity';
import { StudentProfile } from '../users/student-profile.entity';
import { User, UserRole } from '../users/user.entity';
import { createCsrfToken } from './csrf.util';

type RateAction = 'login' | 'register';
type AttemptBucket = { timestamps: number[] };

@Injectable()
export class AuthService {
	private readonly rateBuckets = new Map<string, AttemptBucket>();
	private readonly failedLogins = new Map<
		string,
		{ timestamps: number[]; lockedUntil?: number }
	>();

	constructor(
		private readonly dataSource: DataSource,
		private readonly config: ConfigService,
	) { }

	createCsrfToken() {
		return createCsrfToken(this.config.get<string>('CSRF_SECRET') || undefined);
	}

	assertRateLimit(
		action: RateAction,
		ip: string,
		setRetryAfter: (seconds: number) => void,
	) {
		const now = Date.now();
		const windowMs = action === 'login' ? 15 * 60_000 : 60 * 60_000;
		const maximum = action === 'login' ? 30 : 10;
		const key = `${action}:${ip}`;
		const bucket = this.rateBuckets.get(key) ?? { timestamps: [] };
		bucket.timestamps = bucket.timestamps.filter(
			(timestamp) => now - timestamp < windowMs,
		);
		if (bucket.timestamps.length >= maximum) {
			const retryAfter = Math.max(
				1,
				Math.ceil((bucket.timestamps[0] + windowMs - now) / 1000),
			);
			setRetryAfter(retryAfter);
			throw new HttpException(
				{
					message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
					code: 'RATE_LIMIT_EXCEEDED',
				},
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}
		bucket.timestamps.push(now);
		this.rateBuckets.set(key, bucket);
	}

	async register(emailInput: string, password: string) {
		const email = this.normalizeEmail(emailInput);
		const passwordHash = await bcrypt.hash(password, 12);
		const token = randomBytes(32).toString('base64url');
		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
		try {
			return await this.dataSource.transaction(async (manager) => {
				const user = await manager.save(
					manager.create(User, {
						email,
						passwordHash,
						role: 'student',
					}),
				);
				const profile = await manager.save(
					manager.create(StudentProfile, {
						userId: user.id,
						displayName: null,
						curriculumId: null,
					}),
				);
				const session = await manager.save(
					manager.create(AuthSession, {
						userId: user.id,
						tokenHash: this.hashToken(token),
						expiresAt,
						revokedAt: null,
					}),
				);
				return {
					user: this.safeUser(user),
					profile: {
						id: profile.id,
						displayName: profile.displayName,
						curriculumId: profile.curriculumId,
					},
					token,
					session,
				};
			});
		} catch (error) {
			const databaseError = error as { code?: unknown };
			if (databaseError.code === '23505') {
				throw new ConflictException({
					message: 'Email đã được sử dụng.',
					code: 'CONFLICT',
				});
			}
			throw error;
		}
	}

	async login(emailInput: string, password: string) {
		const email = this.normalizeEmail(emailInput);
		const now = Date.now();
		const attempts = this.failedLogins.get(email) ?? { timestamps: [] };
		if (attempts.lockedUntil && attempts.lockedUntil > now) {
			throw new UnauthorizedException({
				message: 'Email hoặc mật khẩu không chính xác.',
				code: 'INVALID_CREDENTIALS',
			});
		}
		attempts.timestamps = attempts.timestamps.filter(
			(timestamp) => now - timestamp < 15 * 60_000,
		);
		const user = await this.dataSource
			.getRepository(User)
			.createQueryBuilder('user')
			.where('lower(user.email) = :email', { email })
			.getOne();
		const validPassword = user
			? await bcrypt.compare(password, user.passwordHash)
			: await bcrypt.compare(
				password,
				'$2b$12$C6UzMDM.H6dfI/f/IKcEe.3hX3fPVzXEkK0bL8n1Q8V7cX9V9Wc6a',
			);
		if (!user || !validPassword) {
			attempts.timestamps.push(now);
			if (attempts.timestamps.length >= 10) {
				attempts.lockedUntil = now + 15 * 60_000;
				attempts.timestamps = [];
			}
			this.failedLogins.set(email, attempts);
			throw new UnauthorizedException({
				message: 'Email hoặc mật khẩu không chính xác.',
				code: 'INVALID_CREDENTIALS',
			});
		}

		this.failedLogins.delete(email);
		const token = randomBytes(32).toString('base64url');
		const expiresAt = new Date(now + 7 * 24 * 60 * 60_000);
		const session = await this.dataSource.getRepository(AuthSession).save({
			userId: user.id,
			tokenHash: this.hashToken(token),
			expiresAt,
			revokedAt: null,
		});
		const profile =
			user.role === 'student'
				? await this.dataSource.getRepository(StudentProfile).findOne({
					where: { userId: user.id },
				})
				: null;
		return {
			user: this.safeUser(user),
			profile: profile
				? {
					id: profile.id,
					displayName: profile.displayName,
					curriculumId: profile.curriculumId,
				}
				: null,
			token,
			session,
		};
	}

	async logout(sessionId: string) {
		await this.dataSource
			.getRepository(AuthSession)
			.createQueryBuilder()
			.update()
			.set({ revokedAt: new Date() })
			.where('id = :sessionId', { sessionId })
			.andWhere('revoked_at IS NULL')
			.execute();
	}

	async changePassword(
		userId: string,
		currentSessionId: string,
		password: string,
	) {
		const passwordHash = await bcrypt.hash(password, 12);
		await this.dataSource.transaction(async (manager) => {
			await manager
				.getRepository(User)
				.update({ id: userId }, { passwordHash });
			await manager
				.getRepository(AuthSession)
				.createQueryBuilder()
				.update()
				.set({ revokedAt: new Date() })
				.where('user_id = :userId', { userId })
				.andWhere('id != :currentSessionId', { currentSessionId })
				.andWhere('revoked_at IS NULL')
				.execute();
		});
	}

	getAccount(user: User) {
		return this.safeUser(user);
	}

	private normalizeEmail(email: string) {
		return email.trim().toLowerCase();
	}

	private hashToken(token: string) {
		return createHash('sha256').update(token).digest('hex');
	}

	private safeUser(user: User): { id: string; email: string; role: UserRole } {
		return { id: user.id, email: user.email, role: user.role };
	}
}
