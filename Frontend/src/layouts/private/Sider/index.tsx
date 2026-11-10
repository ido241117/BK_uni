import { useMemo } from 'react';
import { Menu, type MenuProps } from 'antd';
import { LuPanelLeftClose, LuPanelLeftOpen } from 'react-icons/lu';
import { Link, useLocation, useNavigate } from 'react-router';
import { IconBtn } from '@/components';
import { filterSidebarMenu, sidebarMenu } from '@/config/sider-options';
import { useAuthzStore } from '@/stores';
import type { NavItem } from '@/types';

interface AppSiderProps {
    collapsed: boolean;
    onToggleCollapse?: () => void;
    /** Đóng drawer trên mobile sau khi điều hướng. */
    onNavigate?: () => void;
}

const findActiveItem = (items: NavItem[], pathname: string): NavItem | undefined => items
    .filter(item => item.path && (pathname === item.path || pathname.startsWith(`${item.path}/`)))
    .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))[0];

export const AppSider = ({ collapsed, onToggleCollapse, onNavigate }: AppSiderProps) => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const can = useAuthzStore(state => state.can);
    const is = useAuthzStore(state => state.is);

    const visibleItems = useMemo(
        () => filterSidebarMenu(sidebarMenu, item => is(item.roles) && can(item.permission)),
        [can, is],
    );

    const menuItems = useMemo<MenuProps['items']>(() => {
        const groups = new Map<string, NavItem[]>();
        visibleItems.forEach((item) => {
            const group = item.group ?? '';
            groups.set(group, [...(groups.get(group) ?? []), item]);
        });

        return Array.from(groups.entries()).map(([group, children]) => ({
            type: 'group' as const,
            key: group || 'main',
            label: collapsed ? undefined : group,
            children: children.map(child => ({
                key: child.path ?? child.key,
                icon: child.icon,
                label: child.label,
            })),
        }));
    }, [collapsed, visibleItems]);

    const activeItem = findActiveItem(visibleItems, pathname);

    return (
        <>
            <Link to="/" className="app-brand" aria-label="BK Uni - trang chủ">
                <span className="app-brand-mark">bk</span>
                <span className="app-brand-text">
                    <strong>BK Uni</strong>
                    <small>Hành trình học tập</small>
                </span>
            </Link>

            <nav className="app-sidebar-menu" aria-label="Điều hướng chính">
                <Menu
                    mode="inline"
                    items={menuItems}
                    selectedKeys={activeItem?.path ? [activeItem.path] : []}
                    onClick={({ key }) => {
                        navigate(key);
                        onNavigate?.();
                    }}
                    style={{ background: 'transparent', borderInlineEnd: 'none' }}
                />
            </nav>

            {onToggleCollapse && (
                <div className="app-sidebar-footer">
                    <IconBtn
                        icon={collapsed ? <LuPanelLeftOpen /> : <LuPanelLeftClose />}
                        label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
                        onClick={onToggleCollapse}
                    />
                </div>
            )}
        </>
    );
};

export default AppSider;
