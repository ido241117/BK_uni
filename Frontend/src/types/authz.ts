import type { ReactNode } from 'react';

/**
 * Vai trò trong hệ thống. Khai báo bằng const object thay vì enum để tương thích
 * `erasableSyntaxOnly` và để giá trị vẫn là string literal khi so sánh.
 */
export const ROLE = {
    STUDENT: 'STUDENT',
    ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof ROLE)[keyof typeof ROLE];

export const USER_ROLES: UserRole[] = [ROLE.STUDENT, ROLE.ADMIN];

export const ROLE_LABEL: Record<UserRole, string> = {
    [ROLE.STUDENT]: 'Sinh viên',
    [ROLE.ADMIN]: 'Quản trị viên',
};

export type PermissionAction = 'view' | 'create' | 'update' | 'delete';

/** Một yêu cầu quyền, ví dụ `{ resource: 'page.course', action: 'view' }`. */
export interface PermissionRequirement {
    resource: string;
    action?: PermissionAction;
}

/** Bản đồ quyền đã chuẩn hoá: resource -> danh sách action được phép. */
export type PermissionMap = Record<string, string[]>;

/** Một mục menu khai báo trong `config/sider-options`. */
export interface NavItem {
    key: string;
    label: string;
    path?: string;
    icon?: ReactNode;
    group?: string;
    roles?: UserRole[];
    permission?: PermissionRequirement;
    children?: NavItem[];
}
