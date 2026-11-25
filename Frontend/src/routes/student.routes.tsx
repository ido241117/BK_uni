import { Navigate, type RouteObject } from 'react-router';
import { PAGE_RESOURCES, toPageViewPermission } from '@/config/access-control/page-resources';
import { ROLE } from '@/types';
import { lazy } from '@/utils/lazy';
import { RequireAccess } from './guards';

const CoursesPage = lazy(() => import('@/pages/courses'));
const CourseDetailPage = lazy(() => import('@/pages/courses/detail'));
const ProgramPage = lazy(() => import('@/pages/program'));
// Người duyệt 22/11: tạm tắt trang Quy định tốt nghiệp (điều kiện tốt nghiệp sửa ở Hiệu chỉnh, trang Môn học).
const RecommendationsPage = lazy(() => import('@/pages/recommendations'));
const AdvisorPage = lazy(() => import('@/pages/advisor'));
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
            // Merged into the "Phân tích" tab of Tiến độ học tập; old links keep working.
            { path: 'courses/analysis', element: <Navigate to="/courses?tab=analysis" replace /> },
            { path: 'courses/:code', Component: CourseDetailPage },
            { path: 'program', Component: ProgramPage },
            // Hai trang cũ đã gộp vào /courses; giữ đường dẫn để link/bookmark cũ không gãy.
            { path: 'student-courses', element: <Navigate to="/courses" replace /> },
            { path: 'plan', element: <Navigate to="/courses" replace /> },
        ],
    },
    // Regulations are edited in the "Điều kiện tốt nghiệp" parts of Tiến độ học tập (both tabs).
    { path: 'regulations', element: <Navigate to="/courses?tab=analysis" replace /> },
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
                roles={[ROLE.STUDENT]}
                permission={toPageViewPermission(PAGE_RESOURCES.ADVISOR)}
            />
        ),
        children: [{ path: 'advisor', Component: AdvisorPage }],
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
