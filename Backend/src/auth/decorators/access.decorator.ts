import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { ROLE } from '../../user/enum/role';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/** Route chỉ dành cho Admin: yêu cầu phiên đăng nhập và vai trò ADMIN. */
export function AdminOnly() {
  return applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(ROLE.ADMIN), ApiCookieAuth('accessToken'));
}

/** Route yêu cầu phiên đăng nhập, không giới hạn vai trò. */
export function SignedIn() {
  return applyDecorators(UseGuards(JwtAuthGuard), ApiCookieAuth('accessToken'));
}
