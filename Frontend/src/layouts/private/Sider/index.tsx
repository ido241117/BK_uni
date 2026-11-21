import { useMemo } from 'react';
import { Menu, Tooltip, type MenuProps } from 'antd';
import { Link, useNavigate } from 'react-router';
import { LuPanelLeftClose, LuPanelLeftOpen } from 'react-icons/lu';
import type { NavItem } from '@/types';
import { useNavItems } from '../nav';

/**
 * Sidebar trên desktop, thu gọn được còn cột icon (nút ở cuối sidebar). Mobile dùng `AppBottomNav`.
 * Khi thu gọn bỏ tiêu đề nhóm (không đủ chỗ); tên mục hiện bằng tooltip của Menu.
 */
export const AppSider = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => {
    const navigate = useNavigate();
    const { items, activePath } = useNavItems();

    const menuItems = useMemo<MenuProps['items']>(() => {
        const toItem = (child: NavItem) => ({ key: child.path ?? child.key, icon: child.icon, label: child.label });
        if (collapsed) return items.map(toItem);

        const groups = new Map<string, NavItem[]>();
        items.forEach((item) => {
            const group = item.group ?? '';
            groups.set(group, [...(groups.get(group) ?? []), item]);
        });

        return Array.from(groups.entries()).map(([group, children]) => ({
            type: 'group' as const,
            key: group || 'main',
            label: group,
            children: children.map(toItem),
        }));
    }, [items, collapsed]);

    const toggleLabel = collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên';

    return (
        <>
            <Link to="/" className="app-brand" aria-label="BK Uni - trang chủ">
                <span className="app-brand-mark">bk</span>
                {!collapsed && (
                    <span className="app-brand-text">
                        <strong>BK Uni</strong>
                        <small>Hành trình học tập</small>
                    </span>
                )}
            </Link>

            <nav className="app-sidebar-menu" aria-label="Điều hướng chính">
                <Menu
                    mode="inline"
                    inlineCollapsed={collapsed}
                    items={menuItems}
                    selectedKeys={activePath ? [activePath] : []}
                    onClick={({ key }) => navigate(key)}
                    style={{ background: 'transparent', borderInlineEnd: 'none' }}
                />
            </nav>

            <Tooltip title={collapsed ? toggleLabel : undefined} placement="right">
                <button type="button" className="app-sidebar-toggle" onClick={onToggle} aria-label={toggleLabel}
                    aria-expanded={!collapsed}>
                    {collapsed ? <LuPanelLeftOpen /> : <LuPanelLeftClose />}
                    {!collapsed && <span>Thu gọn</span>}
                </button>
            </Tooltip>
        </>
    );
};

export default AppSider;
