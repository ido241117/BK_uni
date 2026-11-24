import { useCallback, useMemo, useState, type PropsWithChildren } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { NARROW_QUERY, ShellLayoutContext, type ShellLayout } from './useShellLayout';

/** Desktop collapse preference, kept in this browser only. Read/write errors (private mode) mean "expanded". */
const STORAGE_KEY = 'bkuni.sider.collapsed';

const readStored = () => {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

const writeStored = (collapsed: boolean) => {
    try {
        window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
        // Not persisted; the choice still applies for this session.
    }
};

/**
 * One shared sidebar state for the whole shell (spec: Sidebar/Topbar are controlled, not self-managing).
 * Wide screens: the user's choice, persisted. Narrow screens: collapsed by default; a manual expand
 * lasts until the user collapses it or the breakpoint is crossed.
 */
export const ShellLayoutProvider = ({ children }: PropsWithChildren) => {
    const narrow = useMediaQuery(NARROW_QUERY);
    const [wideCollapsed, setWideCollapsed] = useState(readStored);
    const [narrowOpen, setNarrowOpen] = useState(false);

    // Crossing the breakpoint drops a manual narrow expand (state adjusted during render, no effect).
    const [lastNarrow, setLastNarrow] = useState(narrow);
    if (lastNarrow !== narrow) {
        setLastNarrow(narrow);
        setNarrowOpen(false);
    }

    const collapsed = narrow ? !narrowOpen : wideCollapsed;

    const setCollapsed = useCallback((next: boolean) => {
        if (narrow) {
            setNarrowOpen(!next);
            return;
        }
        setWideCollapsed(next);
        writeStored(next);
    }, [narrow]);

    const value = useMemo<ShellLayout>(() => ({
        collapsed,
        narrow,
        toggle: () => setCollapsed(!collapsed),
        collapse: () => setCollapsed(true),
    }), [collapsed, narrow, setCollapsed]);

    return <ShellLayoutContext.Provider value={value}>{children}</ShellLayoutContext.Provider>;
};
