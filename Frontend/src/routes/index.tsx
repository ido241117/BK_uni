import { createBrowserRouter, RouterProvider } from 'react-router';
import AuthLayout from '@/layouts/auth';
import PrivateLayout from '@/layouts/private';
import PublicLayout from '@/layouts/public';
import { lazy } from '@/utils/lazy';
import adminRoutes from './admin.routes';
import { HomeRedirect, RequireAuth, RequireGuest, SessionBoundary } from './guards';
import publicRoutes from './public.routes';
import studentRoutes from './student.routes';

const NotFoundPage = lazy(() => import('@/pages/not-found'));

/**
 * Cây route duy nhất:
 * SessionBoundary (khôi phục phiên) → khách (AuthLayout) | đã đăng nhập (PrivateLayout)
 * Mỗi nhánh nghiệp vụ tự khai báo quyền bằng `RequireAccess`.
 */
const router = createBrowserRouter([
    {
        Component: SessionBoundary,
        children: [
            { index: true, Component: HomeRedirect },

            {
                Component: RequireGuest,
                children: [{ Component: AuthLayout, children: publicRoutes }],
            },

            {
                Component: RequireAuth,
                children: [
                    {
                        path: '/',
                        Component: PrivateLayout,
                        children: [...studentRoutes, ...adminRoutes],
                    },
                ],
            },

            {
                Component: PublicLayout,
                children: [{ path: '*', Component: NotFoundPage }],
            },
        ],
    },
]);

const AppRouter = () => <RouterProvider router={router} />;

export default AppRouter;
