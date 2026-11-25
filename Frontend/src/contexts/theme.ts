import { createContext, useContext } from 'react';
import type { ThemeContextValue } from '@/types';
import i18n from '@/i18n';

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Hook đọc theme; ném lỗi sớm nếu quên bọc `<ThemeProvider>`. */
export const useAppTheme = (): ThemeContextValue => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error(i18n.t('useAppTheme phải được dùng bên trong <ThemeProvider>.'));
    }
    return context;
};
