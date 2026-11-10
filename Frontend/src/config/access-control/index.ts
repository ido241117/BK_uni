import { ROLE, type PermissionMap, type PermissionRequirement, type UserRole } from '@/types';
import { PAGE_RESOURCES, type PageResource } from './page-resources';

export interface RouteAccessRule {
    pathPrefix: string;
    permission?: PermissionRequirement;
    roles?: UserRole[];
}

const STUDENT_PAGES: PageResource[] = [
    PAGE_RESOURCES.COURSES,
    PAGE_RESOURCES.REGULATIONS,
    PAGE_RESOURCES.RECOMMENDATIONS,
    PAGE_RESOURCES.ADVISOR,
    PAGE_RESOURCES.PROFILE,
];

const ADMIN_PAGES: PageResource[] = [
    PAGE_RESOURCES.ADMIN_CURRICULA,
    PAGE_RESOURCES.ADMIN_COURSES,
    PAGE_RESOURCES.COURSES,
    PAGE_RESOURCES.PROFILE,
];

/**
 * Nguồn quyền duy nhất của app.
 * Backend hiện chỉ trả `role` nên quyền suy ra từ role; khi có API quyền chi tiết
 * chỉ cần thay thân hàm này, guard/menu/nút giữ nguyên.
 */
export const getPermissionsForRole = (role: UserRole | null | undefined): PermissionMap => {
    if (!role) return {};

    const resources = role === ROLE.ADMIN ? ADMIN_PAGES : STUDENT_PAGES;

    return resources.reduce<PermissionMap>((map, resource) => {
        map[resource] = ['view'];
        return map;
    }, {});
};

export const hasRoleAccess = (role: UserRole | null | undefined, roles?: UserRole[]): boolean => {
    if (!roles?.length) return true;
    if (!role) return false;
    return roles.includes(role);
};

export const hasPermissionAccess = (
    role: UserRole | null | undefined,
    permissions: PermissionMap,
    requirement?: PermissionRequirement,
): boolean => {
    if (!requirement) return true;
    if (!role) return false;
    if (role === ROLE.ADMIN) return true;

    const actions = permissions[requirement.resource] ?? [];
    return actions.includes(requirement.action ?? 'view');
};

export const routeAccessRules: RouteAccessRule[] = [
    {
        pathPrefix: '/courses',
        permission: { resource: PAGE_RESOURCES.COURSES, action: 'view' },
        roles: [ROLE.STUDENT, ROLE.ADMIN],
    },
    {
        pathPrefix: '/regulations',
        permission: { resource: PAGE_RESOURCES.REGULATIONS, action: 'view' },
        roles: [ROLE.STUDENT],
    },
    {
        pathPrefix: '/recommendations',
        permission: { resource: PAGE_RESOURCES.RECOMMENDATIONS, action: 'view' },
        roles: [ROLE.STUDENT],
    },
    {
        pathPrefix: '/advisor',
        permission: { resource: PAGE_RESOURCES.ADVISOR, action: 'view' },
        roles: [ROLE.STUDENT],
    },
    {
        pathPrefix: '/profile',
        permission: { resource: PAGE_RESOURCES.PROFILE, action: 'view' },
        roles: [ROLE.STUDENT, ROLE.ADMIN],
    },
    {
        pathPrefix: '/admin/curricula',
        permission: { resource: PAGE_RESOURCES.ADMIN_CURRICULA, action: 'view' },
        roles: [ROLE.ADMIN],
    },
    {
        pathPrefix: '/admin/courses',
        permission: { resource: PAGE_RESOURCES.ADMIN_COURSES, action: 'view' },
        roles: [ROLE.ADMIN],
    },
];

const normalizePath = (path: string) => path.replace(/\/+$/, '') || '/';

/** Tìm rule khớp path dài nhất (rule cụ thể thắng rule chung). */
export const matchAccessRule = (pathname: string): RouteAccessRule | undefined => {
    const normalizedPath = normalizePath(pathname);
    const sorted = [...routeAccessRules].sort((a, b) => b.pathPrefix.length - a.pathPrefix.length);

    return sorted.find((rule) => {
        const prefix = normalizePath(rule.pathPrefix);
        return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
    });
};
