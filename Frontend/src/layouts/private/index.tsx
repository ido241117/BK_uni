import { Suspense, useState } from 'react';
import { Spin } from 'antd';
import { Outlet } from 'react-router';
import { useMediaQuery } from '@/hooks';
import AppBottomNav from './BottomNav';
import AppHeader from './Header';
import AppSider from './Sider';

/** Lựa chọn thu gọn sidebar, chỉ lưu trong trình duyệt này; đọc/ghi lỗi (chế độ riêng tư) thì coi như mở rộng. */
const SIDER_KEY = 'bkuni.sider.collapsed';
const readCollapsed = () => {
    try {
        return window.localStorage.getItem(SIDER_KEY) === '1';
    } catch {
        return false;
    }
};

/**
 * Khung ứng dụng sau đăng nhập: sidebar (desktop, thu gọn được còn icon) / bottom nav chỉ icon (mobile),
 * topbar và vùng nội dung có Suspense riêng cho lazy page.
 */
const PrivateLayout = () => {
    const isMobile = useMediaQuery('(max-width: 1024px)');
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const toggle = () => setCollapsed((prev) => {
        try {
            window.localStorage.setItem(SIDER_KEY, prev ? '0' : '1');
        } catch {
            // Không lưu được thì chỉ đổi trong phiên này.
        }
        return !prev;
    });

    return (
        <div className="app-shell" data-sider-collapsed={!isMobile && collapsed}>
            {!isMobile && (
                <aside className="app-sidebar">
                    <AppSider collapsed={collapsed} onToggle={toggle} />
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
