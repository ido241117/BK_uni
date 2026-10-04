import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { AuthSession } from '../users/auth-session.entity';
import { User } from '../users/user.entity';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorator';
import { isValidCsrfToken } from './csrf.util';

export interface AuthenticatedRequest extends Request {
	user: User;
	authSession: AuthSession;
}

const parseCookies = (cookieHeader = '') =>
	Object.fromEntries(
		cookieHeader.split(';').flatMap((part) => {
			const separator = part.indexOf('=');
			if (separator < 0) return [];
			const value = part.slice(separator + 1).trim();
			let decodedValue = value;
			try {
				decodedValue = decodeURIComponent(value);
			} catch {
				// Keep malformed cookie data as-is; validation will reject it safely.
			}
			return [[part.slice(0, separator).trim(), decodedValue]];
		}),
	);

@Injectable()
export class AuthSessionGuard implements CanActivate {
	constructor(
		private readonly dataSource: DataSource,
		private readonly reflector: Reflector,
		private readonly config: ConfigService,
	) { }

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
		const response = context.switchToHttp().getResponse<{
			setHeader: (name: string, value: string) => void;
		}>();
		const method = request.method.toUpperCase();
		if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
			this.assertOrigin(request);
			this.assertCsrf(request);
		}

		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);
		if (isPublic) return true;

		const cookies = parseCookies(request.headers.cookie);
		const token = cookies.bk_uni_session;
		if (!token) throw new UnauthorizedException();

		const tokenHash = createHash('sha256').update(token).digest('hex');
		const session = await this.dataSource
			.getRepository(AuthSession)
			.createQueryBuilder('session')
			.innerJoinAndSelect('session.user', 'user')
			.where('session.token_hash = :tokenHash', { tokenHash })
			.andWhere('session.revoked_at IS NULL')
			.andWhere('session.expires_at > :now', { now: new Date() })
			.getOne();
		if (!session) {
			response.setHeader(
				'Set-Cookie',
				'bk_uni_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
			);
			throw new UnauthorizedException();
		}

		request.user = session.user;
		request.authSession = session;
		const allowedRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
			context.getHandler(),
			context.getClass(),
		]);
		if (allowedRoles?.length && !allowedRoles.includes(session.user.role)) {
			throw new ForbiddenException();
		}
		return true;
	}

	private assertOrigin(request: Request) {
		const origin = request.headers.origin;
		const configured = (this.config.get<string>('CORS_ORIGINS') ?? '')
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
		const isDevelopment =
			this.config.get<string>('NODE_ENV', 'development') === 'development';
		const allowed =
			typeof origin === 'string' &&
			(configured.includes(origin) ||
				(isDevelopment &&
					/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)));
		if (!allowed) {
			throw new ForbiddenException({
				message: 'Origin không được phép.',
				code: 'CSRF_INVALID',
			});
		}
	}

	private assertCsrf(request: Request) {
		const cookie = parseCookies(request.headers.cookie).bk_uni_csrf;
		const header = request.headers['x-csrf-token'];
		if (
			typeof header !== 'string' ||
			!isValidCsrfToken(
				cookie,
				header,
				this.config.get<string>('CSRF_SECRET') || undefined,
			)
		) {
			throw new ForbiddenException({
				message: 'CSRF token không hợp lệ.',
				code: 'CSRF_INVALID',
			});
		}
	}
}
