import {
    LuBookOpen,
    LuBot,
    LuFileCheck,
    LuGraduationCap,
    LuLayoutGrid,
    LuSparkles,
    LuUserRound,
} from 'react-icons/lu';
import { ROLE, type NavItem } from '@/types';
import { PAGE_RESOURCES, toPageViewPermission } from '@/config/access-control/page-resources';

/**
 * Menu khai báo (không hard-code trong layout). Sider chỉ việc lọc theo quyền
 * rồi đổ ra antd Menu.
 */
export const sidebarMenu: NavItem[] = [
    {
        key: 'student.courses',
        label: 'Môn học & kế hoạch',
        path: '/courses',
        icon: <LuBookOpen />,
        group: 'HỌC TẬP',
        roles: [ROLE.STUDENT],
        permission: toPageViewPermission(PAGE_RESOURCES.COURSES),
    },
    {
        key: 'student.regulations',
        label: 'Quy định tốt nghiệp',
        path: '/regulations',
        icon: <LuFileCheck />,
        group: 'HỌC TẬP',
        roles: [ROLE.STUDENT],
        permission: toPageViewPermission(PAGE_RESOURCES.REGULATIONS),
    },
    {
        key: 'student.recommendations',
        label: 'Gợi ý học phần',
        path: '/recommendations',
        icon: <LuSparkles />,
        group: 'HỌC TẬP',
        roles: [ROLE.STUDENT],
        permission: toPageViewPermission(PAGE_RESOURCES.RECOMMENDATIONS),
    },
    {
        key: 'student.advisor',
        label: 'Tư vấn với AI',
        path: '/advisor',
        icon: <LuBot />,
        group: 'HỌC TẬP',
        roles: [ROLE.STUDENT],
        permission: toPageViewPermission(PAGE_RESOURCES.ADVISOR),
    },
    {
        key: 'account.profile',
        label: 'Hồ sơ cá nhân',
        path: '/profile',
        icon: <LuUserRound />,
        group: 'TÀI KHOẢN',
        roles: [ROLE.STUDENT],
        permission: toPageViewPermission(PAGE_RESOURCES.PROFILE),
    },
    {
        key: 'admin.curricula',
        label: 'Chương trình đào tạo',
        path: '/admin/curricula',
        icon: <LuLayoutGrid />,
        group: 'QUẢN TRỊ',
        roles: [ROLE.ADMIN],
        permission: toPageViewPermission(PAGE_RESOURCES.ADMIN_CURRICULA),
    },
    {
        key: 'admin.courses',
        label: 'Quản lý môn học',
        path: '/admin/courses',
        icon: <LuGraduationCap />,
        group: 'QUẢN TRỊ',
        roles: [ROLE.ADMIN],
        permission: toPageViewPermission(PAGE_RESOURCES.ADMIN_COURSES),
    },
];

/** Lọc menu theo role + quyền của người dùng hiện tại. */
export const filterSidebarMenu = (
    items: NavItem[],
    canView: (item: NavItem) => boolean,
): NavItem[] => items
    .filter(canView)
    .map(item => ({ ...item, children: item.children?.filter(canView) }));
