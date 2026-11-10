import type { RouteObject } from 'react-router';
import { PAGE_RESOURCES, toPageViewPermission } from '@/config/access-control/page-resources';
import { ROLE } from '@/types';
import { lazy } from '@/utils/lazy';
import { RequireAccess } from './guards';

const AdminCurriculaPage = lazy(() => import('@/pages/admin/curricula'));
const CurriculumDetailPage = lazy(() => import('@/pages/admin/curricula/detail'));
const AdminCoursesPage = lazy(() => import('@/pages/admin/courses'));

/** Route quản trị (đã bọc `RequireAuth` + `PrivateLayout` ở `routes/index`). */
export const adminRoutes: RouteObject[] = [
    {
        element: (
            <RequireAccess
                roles={[ROLE.ADMIN]}
                permission={toPageViewPermission(PAGE_RESOURCES.ADMIN_CURRICULA)}
            />
        ),
        children: [
            { path: 'admin/curricula', Component: AdminCurriculaPage },
            { path: 'admin/curricula/create', Component: CurriculumDetailPage },
            { path: 'admin/curricula/:id', Component: CurriculumDetailPage },
        ],
    },
    {
        element: (
            <RequireAccess
                roles={[ROLE.ADMIN]}
                permission={toPageViewPermission(PAGE_RESOURCES.ADMIN_COURSES)}
            />
        ),
        children: [{ path: 'admin/courses', Component: AdminCoursesPage }],
    },
];

export default adminRoutes;
