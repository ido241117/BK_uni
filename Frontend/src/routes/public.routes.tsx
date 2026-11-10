import type { RouteObject } from 'react-router';
import { lazy } from '@/utils/lazy';

const LoginPage = lazy(() => import('@/pages/auth/login'));
const RegisterPage = lazy(() => import('@/pages/auth/register'));

/** Trang công khai cho khách (đã bọc `RequireGuest` + `AuthLayout` ở `routes/index`). */
export const publicRoutes: RouteObject[] = [
    { path: 'login', Component: LoginPage },
    { path: 'register', Component: RegisterPage },
];

export default publicRoutes;
