import { queryMethod } from '@/config/query-method';
import type { Account, Credentials } from '@/types';
import { ApiError } from '@/utils/error';

const isAccount = (value: unknown): value is Account => (
    typeof value === 'object'
    && value !== null
    && 'id' in value && typeof (value as { id: unknown }).id === 'string'
    && 'email' in value && typeof (value as { email: unknown }).email === 'string'
    && 'role' in value
    && ((value as { role: unknown }).role === 'STUDENT' || (value as { role: unknown }).role === 'ADMIN')
);

const parseAccount = (value: unknown): Account => {
    if (!isAccount(value)) {
        throw new ApiError('Phản hồi tài khoản từ máy chủ không hợp lệ.');
    }
    return { id: value.id, email: value.email, role: value.role };
};

const normalizeCredentials = (credentials: Credentials) => ({
    email: credentials.email.trim().toLowerCase(),
    password: credentials.password,
});

/** Đăng ký không tạo phiên: phải gọi `login` riêng (theo API-FRONTEND.md 3 & 5.1). */
export const register = async (credentials: Credentials) =>
    parseAccount(await queryMethod.post<unknown>(
        '/auth/register',
        normalizeCredentials(credentials),
        { suppressGlobalErrorToast: true },
    ));

export const login = async (credentials: Credentials) =>
    parseAccount(await queryMethod.post<unknown>(
        '/auth/login',
        normalizeCredentials(credentials),
        { suppressGlobalErrorToast: true },
    ));

export const getCurrentAccount = async () =>
    parseAccount(await queryMethod.get<unknown>(
        '/auth/me',
        { suppressGlobalErrorToast: true },
    ));

export const logout = () => queryMethod.post<null>('/auth/logout', undefined, {
    suppressGlobalErrorToast: true,
});
