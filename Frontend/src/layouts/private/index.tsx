import { Suspense } from 'react';
import { Tooltip } from 'antd';
import { PiCaretDown, PiGlobe, PiMoon, PiQuestion, PiSun } from 'react-icons/pi';
import { Outlet } from 'react-router';
import {
    AppShell, Breadcrumb, SemesterBadge, Sidebar, SidebarFooterLink, SidebarNavItem, SidebarNavSection, Topbar,
} from '@/components/shell';
import { RouteLoading } from '@/components';
import { useAppTheme } from '@/contexts';
import { currentSemester } from '@/utils/semester';
import { AccountMenu } from './AccountMenu';
import { useNavItems } from './nav';

const AppSidebar = () => {
    const { sections, activePath } = useNavItems();

    return (
        <Sidebar footer={<SidebarFooterLink icon={<PiQuestion />} label="Trợ giúp" hint="Trang trợ giúp: sắp có" />}>
            {sections.map(section => (
                <SidebarNavSection key={section.title} title={section.title}>
                    {section.items.map(item => item.path && (
                        <SidebarNavItem key={item.key} icon={item.icon} label={item.label} to={item.path}
                            active={item.path === activePath} />
                    ))}
                </SidebarNavSection>
            ))}
        </Sidebar>
    );
};

const AppTopbar = () => {
    const { breadcrumb } = useNavItems();
    const { isDark, toggleMode } = useAppTheme();
    const themeLabel = isDark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối';

    return (
        <Topbar start={<Breadcrumb items={breadcrumb} />}>
            <SemesterBadge code={currentSemester()} />
            <Tooltip title={themeLabel}>
                <button type="button" className="icon-btn" onClick={toggleMode} aria-label={themeLabel}>
                    {isDark ? <PiSun /> : <PiMoon />}
                </button>
            </Tooltip>
            {/* No i18n yet: shown so the layout is final, disabled so it does not pretend to work. */}
            <Tooltip title="Tiếng Anh: sắp có">
                <span>
                    <button type="button" className="lang-select" disabled aria-label="Ngôn ngữ: Tiếng Việt">
                        <PiGlobe /> VN <PiCaretDown className="caret" />
                    </button>
                </span>
            </Tooltip>
            <AccountMenu />
        </Topbar>
    );
};

/** Signed-in app frame: shared shell + a Suspense boundary for lazy pages. */
const PrivateLayout = () => (
    <AppShell sidebar={<AppSidebar />} topbar={<AppTopbar />}>
        <Suspense fallback={<RouteLoading />}>
            <Outlet />
        </Suspense>
    </AppShell>
);

export default PrivateLayout;
