import { useMemo } from 'react';
import { useLocation } from 'react-router';
import { filterSidebarMenu, sidebarMenu } from '@/config/sider-options';
import { useAuthzStore } from '@/stores';
import type { NavItem } from '@/types';

const findActiveItem = (items: NavItem[], pathname: string): NavItem | undefined => items
    .filter(item => item.path && (pathname === item.path || pathname.startsWith(`${item.path}/`)))
    .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))[0];

export interface NavSection {
    title: string;
    items: NavItem[];
}

/** Menu items the current user may see, grouped into sidebar sections, plus the active item and breadcrumb. */
export const useNavItems = () => {
    const { pathname } = useLocation();
    const can = useAuthzStore(state => state.can);
    const is = useAuthzStore(state => state.is);

    const items = useMemo(
        () => filterSidebarMenu(sidebarMenu, item => is(item.roles) && can(item.permission)),
        [can, is],
    );

    const sections = useMemo<NavSection[]>(() => {
        const groups = new Map<string, NavItem[]>();
        items.forEach(item => groups.set(item.group ?? '', [...(groups.get(item.group ?? '') ?? []), item]));
        return Array.from(groups, ([title, groupItems]) => ({ title, items: groupItems }));
    }, [items]);

    const active = findActiveItem(items, pathname);
    const breadcrumb = active ? [active.group, active.label].filter((part): part is string => Boolean(part)) : [];

    return { items, sections, activePath: active?.path, breadcrumb };
};
