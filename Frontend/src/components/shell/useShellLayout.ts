import { createContext, useContext } from 'react';

/** Below this width the sidebar collapses to its icon rail by default. Keep in sync with shell.css. */
export const NARROW_QUERY = '(max-width: 1024px)';

export interface ShellLayout {
    collapsed: boolean;
    /** True below the breakpoint; an expanded sidebar then overlays the content instead of pushing it. */
    narrow: boolean;
    toggle: () => void;
    collapse: () => void;
}

export const ShellLayoutContext = createContext<ShellLayout | null>(null);

export const useShellLayout = (): ShellLayout => {
    const value = useContext(ShellLayoutContext);
    if (!value) throw new Error('useShellLayout must be used inside <ShellLayoutProvider>');
    return value;
};
