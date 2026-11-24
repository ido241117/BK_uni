import { Suspense } from 'react';
import { RouteLoading } from '@/components';
import { Outlet } from 'react-router';

/** Layout công khai: chỉ bọc Outlet và một Suspense riêng. */
const PublicLayout = () => (
    <Suspense fallback={<RouteLoading />}>
        <Outlet />
    </Suspense>
);

export default PublicLayout;
