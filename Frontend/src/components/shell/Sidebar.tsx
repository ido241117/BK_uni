import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { PiSidebarSimple } from 'react-icons/pi';
import { BrandLogo } from './BrandLogo';
import { useShellLayout } from './useShellLayout';

interface SidebarProps {
    /** Nav sections (`SidebarNavSection`). */
    children: ReactNode;
    /** Pinned to the bottom, e.g. the help link. */
    footer?: ReactNode;
}

/** Sidebar frame: brand + collapse toggle at the top, scrollable sections, footer at the bottom. */
export const Sidebar = ({ children, footer }: SidebarProps) => {
    const { collapsed, narrow, toggle, collapse } = useShellLayout();
    const toggleLabel = collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên';
    const overlay = narrow && !collapsed;

    return (
        <>
            <aside className="sidebar" data-collapsed={collapsed} data-overlay={overlay}>
                <div className="sidebar-brand">
                    <BrandLogo iconOnly={collapsed} />
                    <Tooltip title={collapsed ? toggleLabel : undefined} placement="right">
                        <button type="button" className="nav-toggle" onClick={toggle} aria-label={toggleLabel}
                            aria-expanded={!collapsed}>
                            <PiSidebarSimple />
                        </button>
                    </Tooltip>
                </div>

                <div className="sidebar-sections">{children}</div>

                {footer && <div className="sidebar-footer">{footer}</div>}
            </aside>
            {overlay && <div className="sidebar-scrim" onClick={collapse} aria-hidden="true" />}
        </>
    );
};

export default Sidebar;
