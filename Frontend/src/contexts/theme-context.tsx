import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { ThemeMode } from '@/types';
import { ThemeContext } from './theme';

const THEME_STORAGE_KEY = 'bk-uni:theme';

const getInitialMode = (): ThemeMode => {
    if (typeof window === 'undefined') return 'light';

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const ThemeProvider = ({ children }: PropsWithChildren) => {
    const [mode, setMode] = useState<ThemeMode>(getInitialMode);
    const isDark = mode === 'dark';

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = mode;
        root.style.colorScheme = mode;
        window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    }, [mode]);

    const value = useMemo(
        () => ({
            mode,
            isDark,
            setMode,
            toggleMode: () => setMode(previous => (previous === 'dark' ? 'light' : 'dark')),
        }),
        [isDark, mode],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export default ThemeProvider;
