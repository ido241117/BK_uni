import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import PrivateLayout from '@/layouts/private';

const AccountPage = lazy(() => import('@/pages/account'));
const AdminPage = lazy(() => import('@/pages/admin'));
const AnalysisPage = lazy(() => import('@/pages/analysis'));
const AuthPage = lazy(() => import('@/pages/auth'));
const StudentPage = lazy(() => import('@/pages/student'));
const HistoryPage = lazy(() => import('@/pages/analysis').then((module) => ({ default: module.HistoryPage })));

const router = createBrowserRouter([
	{ path: '/', element: <Navigate to="/login" replace /> },
	{ path: '/login', element: <AuthPage /> },
	{ path: '/register', element: <AuthPage initialMode="register" /> },
	{
		path: '/',
		element: <PrivateLayout />,
		children: [
			{ path: 'student', element: <StudentPage /> },
			{ path: 'analysis', element: <AnalysisPage /> },
			{ path: 'history', element: <HistoryPage /> },
			{ path: 'admin', element: <AdminPage /> },
			{ path: 'account', element: <AccountPage /> },
		],
	},
	{ path: '*', element: <Navigate to="/login" replace /> },
]);

export default function AppRoutes() {
	return (
		<Suspense fallback={<div className="route-loading">BK Uni · Đang tải</div>}>
			<RouterProvider router={router} />
		</Suspense>
	);
}