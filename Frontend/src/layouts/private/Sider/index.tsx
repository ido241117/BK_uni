import { useMemo } from 'react';
import { Menu, type MenuProps } from 'antd';
import { Link, useNavigate } from 'react-router';
import type { NavItem } from '@/types';
import { useNavItems } from '../nav';

/** Sidebar cố định trên desktop. Mobile dùng `AppBottomNav`. */
export const AppSider = () => {
    const navigate = useNavigate();
    const { items, activePath } = useNavItems();

    const menuItems = useMemo<MenuProps['items']>(() => {
        const groups = new Map<string, NavItem[]>();
        items.forEach((item) => {
            const group = item.group ?? '';
            groups.set(group, [...(groups.get(group) ?? []), item]);
        });

        return Array.from(groups.entries()).map(([group, children]) => ({
            type: 'group' as const,
            key: group || 'main',
            label: group,
            children: children.map(child => ({
                key: child.path ?? child.key,
                icon: child.icon,
                label: child.label,
            })),
        }));
    }, [items]);

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
                    selectedKeys={activePath ? [activePath] : []}
                    onClick={({ key }) => navigate(key)}
                    style={{ background: 'transparent', borderInlineEnd: 'none' }}
                />
            </nav>
        </>
    );
};

export default AppSider;
