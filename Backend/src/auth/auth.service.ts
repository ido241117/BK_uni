import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { MoreThan, Repository } from 'typeorm';
import { UserService } from '../user/user.service';
import { User } from '../user/entities/user.entity';
import { AuthSession } from './entities/auth-session.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(AuthSession) private readonly sessions: Repository<AuthSession>,
  ) {}

  async register(dto: RegisterDto) {
    this.validatePasswordLength(dto.password);
    const user = await this.users.createStudent(
      dto.email.trim().toLowerCase(),
      await bcrypt.hash(dto.password, 10),
    );
    return this.publicUser(user);
  }

  async login(dto: LoginDto) {
    this.validatePasswordLength(dto.password);
    const user = await this.users.findByEmailWithPassword(dto.email.trim().toLowerCase());
    const matches = await bcrypt.compare(dto.password, user?.password ?? DUMMY_HASH);
    if (!user || !matches) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác.');
    }
    const ttl = this.config.getOrThrow<number>('SESSION_TTL_SECONDS');
    const session = await this.sessions.save(this.sessions.create({
      user_id: user.id,
      expires_at: new Date(Date.now() + ttl * 1000),
    }));
    const token = await this.jwt.signAsync({ sub: user.id, sessionId: session.id }, { expiresIn: ttl });
    return { token, user: this.publicUser(user), ttl };
  }

  async validateSession(userId: string, sessionId: string) {
    return this.sessions.findOne({
      where: { id: sessionId, user_id: userId, expires_at: MoreThan(new Date()) },
      relations: { user: true },
    });
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.sessions.delete({ id: sessionId, user_id: userId });
  }

  private validatePasswordLength(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('Mật khẩu không được vượt quá 72 byte.');
    }
  }

  private publicUser(user: User) {
    return { id: user.id, email: user.email, role: user.role };
  }
}
