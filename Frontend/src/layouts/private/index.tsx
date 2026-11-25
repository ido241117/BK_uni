import { Suspense } from 'react';
import { PiQuestion } from 'react-icons/pi';
import { Outlet } from 'react-router';
import {
    AppShell, Breadcrumb, LanguageMenu, SemesterBadge, Sidebar, SidebarFooterLink, SidebarNavItem, SidebarNavSection, ThemeToggle, Topbar,
} from '@/components/shell';
import { RouteLoading } from '@/components';
import { currentSemester } from '@/utils/semester';
import { AccountMenu } from './AccountMenu';
import { useNavItems } from './nav';
import i18n from '@/i18n';

const AppSidebar = () => {
    const { sections, activePath } = useNavItems();

    return (
        <Sidebar footer={<SidebarFooterLink icon={<PiQuestion />} label={i18n.t('Trợ giúp')} hint={i18n.t('Trang trợ giúp: sắp có')} />}>
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

    return (
        <Topbar start={<Breadcrumb items={breadcrumb} />}>
            <SemesterBadge code={currentSemester()} />
            <ThemeToggle />
            <LanguageMenu />
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
