import useAuthStore from '@/stores/auth';
import useAuthzStore from '@/stores/authz';
import type { PermissionRequirement, UserRole } from '@/types';

/** Tài khoản đang đăng nhập (null khi chưa đăng nhập). */
export const useCurrentUser = () => useAuthStore(state => state.account);

export const useCurrentRole = (): UserRole | null => useAuthStore(state => state.account?.role ?? null);

/** Kiểm tra quyền của người dùng hiện tại, ví dụ: `usePermission({ resource: 'page.course' })`. */
export const usePermission = (requirement?: PermissionRequirement): boolean =>
    useAuthzStore(state => state.can(requirement));

/** Kiểm tra role của người dùng hiện tại. */
export const useHasRole = (roles?: UserRole[]): boolean =>
    useAuthzStore(state => state.is(roles));
