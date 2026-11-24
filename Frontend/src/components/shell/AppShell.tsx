import type { ReactNode } from 'react';
import { ShellLayoutProvider } from './LayoutContext';
import { useShellLayout } from './useShellLayout';

interface AppShellProps {
    /** `<Sidebar>` */
    sidebar: ReactNode;
    /** `<Topbar>` */
    topbar: ReactNode;
    /** Page content. */
    children: ReactNode;
}

const ShellFrame = ({ sidebar, topbar, children }: AppShellProps) => {
    const { collapsed, narrow } = useShellLayout();

    return (
        <div className="shell" data-collapsed={collapsed} data-narrow={narrow}>
            {sidebar}
            <div className="main-wrap">
                {topbar}
                <main className="workspace">{children}</main>
            </div>
        </div>
    );
};

/** App frame shared by every signed-in page: sidebar + sticky topbar + workspace. */
export const AppShell = (props: AppShellProps) => (
    <ShellLayoutProvider>
        <ShellFrame {...props} />
    </ShellLayoutProvider>
);

export default AppShell;
