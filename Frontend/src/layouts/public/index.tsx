import { Suspense } from 'react';
import { Spin } from 'antd';
import { Outlet } from 'react-router';

/** Layout công khai: chỉ bọc Outlet và một Suspense riêng. */
const PublicLayout = () => (
    <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}><Spin size="large" /></div>}>
        <Outlet />
    </Suspense>
);

export default PublicLayout;
