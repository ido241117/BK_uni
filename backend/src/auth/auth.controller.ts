import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	Put,
	Req,
	Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthenticatedRequest } from './auth-session.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto, CredentialsDto } from './auth.dto';
import { Public } from './auth.decorator';

const cookieOptions = (request: Request) => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: request.secure,
});

@Controller()
export class AuthController {
	constructor(private readonly authService: AuthService) { }

	@Public()
	@Get('auth/csrf')
	getCsrf(
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response,
	) {
		const token = this.authService.createCsrfToken();
		response.cookie('bk_uni_csrf', token, {
			...cookieOptions(request),
			httpOnly: false,
		});
		return { token };
	}

	@Public()
	@Post('auth/register')
	@HttpCode(HttpStatus.CREATED)
	async register(
		@Body() body: CredentialsDto,
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response,
	) {
		this.authService.assertRateLimit(
			'register',
			request.ip ?? 'unknown',
			(seconds) => response.setHeader('Retry-After', String(seconds)),
		);
		const result = await this.authService.register(body.email, body.password);
		response.cookie('bk_uni_session', result.token, cookieOptions(request));
		return { user: result.user, profile: result.profile };
	}

	@Public()
	@Post('auth/login')
	@HttpCode(HttpStatus.OK)
	async login(
		@Body() body: CredentialsDto,
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response,
	) {
		this.authService.assertRateLimit(
			'login',
			request.ip ?? 'unknown',
			(seconds) => response.setHeader('Retry-After', String(seconds)),
		);
		const result = await this.authService.login(body.email, body.password);
		response.cookie('bk_uni_session', result.token, cookieOptions(request));
		return { user: result.user, profile: result.profile };
	}

	@Post('auth/logout')
	@HttpCode(HttpStatus.OK)
	async logout(
		@Req() request: AuthenticatedRequest,
		@Res({ passthrough: true }) response: Response,
	) {
		await this.authService.logout(request.authSession.id);
		response.clearCookie('bk_uni_session', cookieOptions(request));
		return { loggedOut: true };
	}

	@Get('me')
	getMe(@Req() request: AuthenticatedRequest) {
		return this.authService.getAccount(request.user);
	}

	@Put('me/password')
	@HttpCode(HttpStatus.OK)
	async changePassword(
		@Body() body: ChangePasswordDto,
		@Req() request: AuthenticatedRequest,
	) {
		await this.authService.changePassword(
			request.user.id,
			request.authSession.id,
			body.newPassword,
		);
		return { changed: true };
	}
}
