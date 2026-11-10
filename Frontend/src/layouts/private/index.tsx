import { Suspense, useState } from 'react';
import { Drawer, Spin } from 'antd';
import { Outlet } from 'react-router';
import { useMediaQuery } from '@/hooks';
import AppHeader from './Header';
import AppSider from './Sider';

/**
 * Khung ứng dụng sau đăng nhập: sider (desktop) / drawer (mobile),
 * topbar và vùng nội dung có Suspense riêng cho lazy page.
 */
const PrivateLayout = () => {
    const isMobile = useMediaQuery('(max-width: 1024px)');
    const [collapsed, setCollapsed] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);

    return (
        <div className="app-shell" data-collapsed={!isMobile && collapsed}>
            {!isMobile && (
                <aside className="app-sidebar">
                    <AppSider
                        collapsed={collapsed}
                        onToggleCollapse={() => setCollapsed(previous => !previous)}
                    />
                </aside>
            )}

            <Drawer
                open={isMobile && drawerOpen}
                onClose={() => setDrawerOpen(false)}
                placement="left"
                width={264}
                title="BK Uni"
                styles={{ body: { padding: 12, display: 'flex', flexDirection: 'column', gap: 14 } }}
            >
                <AppSider collapsed={false} onNavigate={() => setDrawerOpen(false)} />
            </Drawer>

            <div className="app-main">
                <AppHeader onOpenMenu={isMobile ? () => setDrawerOpen(true) : undefined} />
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
        </div>
    );
};

export default PrivateLayout;
