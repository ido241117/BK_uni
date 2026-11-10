export type ThemeMode = 'light' | 'dark';

export interface ThemeContextValue {
    mode: ThemeMode;
    isDark: boolean;
    setMode: (mode: ThemeMode) => void;
    toggleMode: () => void;
}
