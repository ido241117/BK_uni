import { Navigate, type RouteObject } from 'react-router';
import { PAGE_RESOURCES, toPageViewPermission } from '@/config/access-control/page-resources';
import { ROLE } from '@/types';
import { lazy } from '@/utils/lazy';
import { RequireAccess } from './guards';

const CoursesPage = lazy(() => import('@/pages/courses'));
const CourseDetailPage = lazy(() => import('@/pages/courses/detail'));
// Người duyệt 22/11: tạm tắt trang Quy định tốt nghiệp (điều kiện tốt nghiệp sửa ở Hiệu chỉnh, trang Môn học).
// const RegulationsPage = lazy(() => import('@/pages/regulations'));
const RecommendationsPage = lazy(() => import('@/pages/recommendations'));
const ProfilePage = lazy(() => import('@/pages/profile'));

/** Route cho sinh viên (đã bọc `RequireAuth` + `PrivateLayout` ở `routes/index`). */
export const studentRoutes: RouteObject[] = [
    {
        element: (
            <RequireAccess
                roles={[ROLE.STUDENT, ROLE.ADMIN]}
                permission={toPageViewPermission(PAGE_RESOURCES.COURSES)}
            />
        ),
        children: [
            { path: 'courses', Component: CoursesPage },
            { path: 'courses/:code', Component: CourseDetailPage },
            // Hai trang cũ đã gộp vào /courses; giữ đường dẫn để link/bookmark cũ không gãy.
            { path: 'student-courses', element: <Navigate to="/courses" replace /> },
            { path: 'plan', element: <Navigate to="/courses" replace /> },
        ],
    },
    // Tạm tắt 22/11 (xem ghi chú ở import): link/bookmark cũ chuyển về trang Môn học. Bật lại thì bỏ comment khối dưới
    // và xóa dòng Navigate.
    // {
    //     element: (
    //         <RequireAccess
    //             roles={[ROLE.STUDENT]}
    //             permission={toPageViewPermission(PAGE_RESOURCES.REGULATIONS)}
    //         />
    //     ),
    //     children: [{ path: 'regulations', Component: RegulationsPage }],
    // },
    { path: 'regulations', element: <Navigate to="/courses" replace /> },
    {
        element: (
            <RequireAccess
                roles={[ROLE.STUDENT]}
                permission={toPageViewPermission(PAGE_RESOURCES.RECOMMENDATIONS)}
            />
        ),
        children: [{ path: 'recommendations', Component: RecommendationsPage }],
    },
    {
        element: (
            <RequireAccess
                roles={[ROLE.STUDENT, ROLE.ADMIN]}
                permission={toPageViewPermission(PAGE_RESOURCES.PROFILE)}
            />
        ),
        children: [{ path: 'profile', Component: ProfilePage }],
    },
];

export default studentRoutes;
