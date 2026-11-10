import type { PermissionRequirement } from '@/types';

/** Mỗi trang nghiệp vụ là một resource; quyền `view` quyết định có được vào trang. */
export const PAGE_RESOURCES = {
    COURSES: 'page.course',
    REGULATIONS: 'page.regulation',
    RECOMMENDATIONS: 'page.recommendation',
    ADVISOR: 'page.advisor',
    PROFILE: 'page.profile',
    ADMIN_CURRICULA: 'page.admin.curriculum',
    ADMIN_COURSES: 'page.admin.course',
} as const;

export type PageResource = (typeof PAGE_RESOURCES)[keyof typeof PAGE_RESOURCES];

export const toPageViewPermission = (resource: PageResource): PermissionRequirement => ({
    resource,
    action: 'view',
});
