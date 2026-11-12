import { Suspense } from 'react';
import { Spin } from 'antd';
import { Outlet } from 'react-router';
import { useMediaQuery } from '@/hooks';
import AppBottomNav from './BottomNav';
import AppHeader from './Header';
import AppSider from './Sider';

/**
 * Khung ứng dụng sau đăng nhập: sidebar (desktop) / bottom nav chỉ icon (mobile),
 * topbar và vùng nội dung có Suspense riêng cho lazy page.
 */
const PrivateLayout = () => {
    const isMobile = useMediaQuery('(max-width: 1024px)');

    return (
        <div className="app-shell">
            {!isMobile && (
                <aside className="app-sidebar">
                    <AppSider />
                </aside>
            )}

            <div className="app-main">
                <AppHeader showBrand={isMobile} />
                <main className="app-content">
                    <Suspense
                        fallback={(
                            <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
                                <Spin size="large" />
                            </div>
                        )}
                    >
                        <Outlet />
                    </Suspense>
                </main>
            </div>

            {isMobile && <AppBottomNav />}
        </div>
    );
};

export default PrivateLayout;
