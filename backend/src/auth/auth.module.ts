import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSession } from '../users/auth-session.entity';
import { StudentProfile } from '../users/student-profile.entity';
import { User } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { AuthSessionGuard } from './auth-session.guard';
import { AuthService } from './auth.service';

@Module({
	imports: [TypeOrmModule.forFeature([User, AuthSession, StudentProfile])],
	controllers: [AuthController],
	providers: [AuthService, { provide: APP_GUARD, useClass: AuthSessionGuard }],
})
export class AuthModule { }
