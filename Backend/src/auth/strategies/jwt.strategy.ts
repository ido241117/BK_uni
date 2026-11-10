import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ROLE } from '../../user/enum/role';
import { AuthService } from '../auth.service';

export interface JwtPayload {
  sub: string;
  sessionId: string;
}

export interface RequestUser {
  id: string;
  email: string;
  role: ROLE;
  sessionId: string;
}

function extractCookie(req: Request): string | null {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('accessToken='));
  return cookie ? cookie.slice('accessToken='.length) : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractCookie]),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (typeof payload.sub !== 'string' || typeof payload.sessionId !== 'string') {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
    const session = await this.auth.validateSession(payload.sub, payload.sessionId);
    if (!session) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    return {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
    };
  }
}
