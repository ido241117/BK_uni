import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { Link } from 'react-router';
import { useShellLayout } from './useShellLayout';

interface SidebarNavSectionProps {
    title: string;
    children: ReactNode;
}

/** One nav group: owns the uppercase label and the hairline below it (spec: Side bar). */
export const SidebarNavSection = ({ title, children }: SidebarNavSectionProps) => (
    <nav className="nav-section" aria-label={title}>
        <div className="nav-group-title">{title}</div>
        <div className="nav-list">{children}</div>
    </nav>
);

interface SidebarNavItemProps {
    icon: ReactNode;
    label: string;
    to: string;
    active?: boolean;
}

/** One nav link: icon, label, active state. Collapsed: icon only, label in a tooltip. */
export const SidebarNavItem = ({ icon, label, to, active = false }: SidebarNavItemProps) => {
    const { collapsed, narrow, collapse } = useShellLayout();

    return (
        <Tooltip title={collapsed ? label : undefined} placement="right">
            <Link
                to={to}
                className="nav-item"
                data-active={active}
                aria-current={active ? 'page' : undefined}
                aria-label={collapsed ? label : undefined}
                // On narrow screens the expanded sidebar is an overlay; close it after navigating.
                onClick={narrow ? collapse : undefined}
            >
                {icon}
                <span>{label}</span>
            </Link>
        </Tooltip>
    );
};

interface SidebarFooterLinkProps {
    icon: ReactNode;
    label: string;
    /** Shown as a tooltip; used while the target does not exist yet. */
    hint?: string;
    onClick?: () => void;
}

/** Footer action such as "Trợ giúp". */
export const SidebarFooterLink = ({ icon, label, hint, onClick }: SidebarFooterLinkProps) => {
    const { collapsed } = useShellLayout();

    return (
        <Tooltip title={hint ?? (collapsed ? label : undefined)} placement="right">
            <button type="button" className="help-link" onClick={onClick} aria-label={label}
                aria-disabled={!onClick}>
                {icon}
                <span>{label}</span>
            </button>
        </Tooltip>
    );
};
