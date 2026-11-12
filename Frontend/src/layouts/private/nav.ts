import { useMemo } from 'react';
import { useLocation } from 'react-router';
import { filterSidebarMenu, sidebarMenu } from '@/config/sider-options';
import { useAuthzStore } from '@/stores';
import type { NavItem } from '@/types';

const findActiveItem = (items: NavItem[], pathname: string): NavItem | undefined => items
    .filter(item => item.path && (pathname === item.path || pathname.startsWith(`${item.path}/`)))
    .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))[0];

/** Mục menu người dùng hiện tại được thấy + mục đang active, dùng chung cho sidebar (desktop) và bottom nav (mobile). */
export const useNavItems = () => {
    const { pathname } = useLocation();
    const can = useAuthzStore(state => state.can);
    const is = useAuthzStore(state => state.is);

    const items = useMemo(
        () => filterSidebarMenu(sidebarMenu, item => is(item.roles) && can(item.permission)),
        [can, is],
    );

    return { items, activePath: findActiveItem(items, pathname)?.path };
};
