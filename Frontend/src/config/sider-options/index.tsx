import {
    PiBookOpen,
    PiChartLineUp,
    PiGraduationCap,
    PiPath,
    PiRobot,
    PiSquaresFour,
    PiUser,
} from 'react-icons/pi';
import { ROLE, type NavItem } from '@/types';
import { PAGE_RESOURCES, toPageViewPermission } from '@/config/access-control/page-resources';
import { trLive } from '@/i18n/live';

/**
 * Declared menu (not hard-coded in the layout). The shell filters it by permission and renders one
 * sidebar section per `group` (display case; CSS uppercases it). Group + label also form the breadcrumb.
 */
export const sidebarMenu: NavItem[] = trLive([
    {
        key: 'student.courses',
        label: 'Tiến độ học tập',
        path: '/courses',
        icon: <PiChartLineUp />,
        group: 'Học tập',
        roles: [ROLE.STUDENT],
        permission: toPageViewPermission(PAGE_RESOURCES.COURSES),
    },
    {
        key: 'student.program',
        label: 'Chương trình',
        path: '/program',
        icon: <PiBookOpen />,
        group: 'Học tập',
        roles: [ROLE.STUDENT],
        permission: toPageViewPermission(PAGE_RESOURCES.COURSES),
    },
    {
        key: 'student.recommendations',
        label: 'Gợi ý lộ trình',
        path: '/recommendations',
        icon: <PiPath />,
        group: 'Học tập',
        roles: [ROLE.STUDENT],
        permission: toPageViewPermission(PAGE_RESOURCES.RECOMMENDATIONS),
    },
    {
        key: 'student.advisor',
        label: 'Tư vấn với AI',
        path: '/advisor',
        icon: <PiRobot />,
        group: 'Học tập',
        roles: [ROLE.STUDENT],
        permission: toPageViewPermission(PAGE_RESOURCES.ADVISOR),
    },
    {
        key: 'account.profile',
        label: 'Hồ sơ cá nhân',
        path: '/profile',
        icon: <PiUser />,
        group: 'Tài khoản',
        roles: [ROLE.STUDENT],
        permission: toPageViewPermission(PAGE_RESOURCES.PROFILE),
    },
    {
        key: 'admin.curricula',
        label: 'Chương trình đào tạo',
        path: '/admin/curricula',
        icon: <PiSquaresFour />,
        group: 'Quản trị',
        roles: [ROLE.ADMIN],
        permission: toPageViewPermission(PAGE_RESOURCES.ADMIN_CURRICULA),
    },
    {
        key: 'admin.courses',
        label: 'Quản lý môn học',
        path: '/admin/courses',
        icon: <PiGraduationCap />,
        group: 'Quản trị',
        roles: [ROLE.ADMIN],
        permission: toPageViewPermission(PAGE_RESOURCES.ADMIN_COURSES),
    },
]);

/** Lọc menu theo role + quyền của người dùng hiện tại. */
export const filterSidebarMenu = (
    items: NavItem[],
    canView: (item: NavItem) => boolean,
): NavItem[] => items
    .filter(canView)
    .map(item => ({ ...item, children: item.children?.filter(canView) }));
