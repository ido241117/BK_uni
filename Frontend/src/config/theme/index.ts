import { theme as antdTheme, type ThemeConfig } from 'antd';

/** Nguồn màu duy nhất cho cả antd token và CSS variable (`styles/tokens.css`). */
export const BRAND = {
    primary: '#0066cc',
    primaryDark: '#4a9eff',
    hover: '#0057ad',
    hoverDark: '#6fb1ff',
    active: '#004a94',
    activeDark: '#2f86e0',
    soft: 'rgba(0, 102, 204, 0.10)',
    softStrong: 'rgba(0, 102, 204, 0.20)',
    contrast: '#ffffff',
} as const;

export const SURFACE = {
    light: {
        page: '#f5f5f7',
        surface: '#ffffff',
        elevated: '#ffffff',
        subtle: '#f0f0f2',
        text: '#1d1d1f',
        textSecondary: '#6e6e73',
        textMuted: '#86868b',
        border: '#e6e6e8',
        borderStrong: '#d2d2d7',
        inverse: '#1d1d1f',
        inverseText: '#ffffff',
    },
    dark: {
        page: '#0e1116',
        surface: '#161a20',
        elevated: '#1b2028',
        subtle: '#1f242c',
        text: '#f5f5f7',
        textSecondary: 'rgba(245, 245, 247, 0.72)',
        textMuted: 'rgba(245, 245, 247, 0.54)',
        border: 'rgba(255, 255, 255, 0.14)',
        borderStrong: 'rgba(255, 255, 255, 0.22)',
        inverse: '#f5f5f7',
        inverseText: '#0e1116',
    },
} as const;

export const RADIUS = { sm: 8, md: 12, lg: 16 } as const;

/**
 * Dựng theme antd từ token. Mọi trạng thái (default / hover / active / disabled)
 * đều do antd sinh ra từ các token này — không viết CSS tay cho từng trạng thái.
 */
export const buildAntdTheme = (isDark: boolean): ThemeConfig => {
    const palette = isDark ? SURFACE.dark : SURFACE.light;
    const primary = isDark ? BRAND.primaryDark : BRAND.primary;
    const primaryHover = isDark ? BRAND.hoverDark : BRAND.hover;
    const primaryActive = isDark ? BRAND.activeDark : BRAND.active;

    return {
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
            colorPrimary: primary,
            colorInfo: primary,
            colorLink: primary,
            colorLinkHover: primaryHover,
            colorLinkActive: primaryActive,
            colorSuccess: '#1a9e5c',
            colorWarning: '#d98300',
            colorError: '#d92d20',
            borderRadius: RADIUS.sm,
            borderRadiusLG: RADIUS.md,
            borderRadiusSM: 6,
            controlHeight: 40,
            controlHeightLG: 46,
            fontFamily: '"Inter", "Segoe UI Variable", "Segoe UI", sans-serif',
            colorBgBase: palette.page,
            colorBgLayout: palette.page,
            colorBgContainer: palette.surface,
            colorBgElevated: palette.elevated,
            colorText: palette.text,
            colorTextSecondary: palette.textSecondary,
            colorTextTertiary: palette.textMuted,
            colorBorder: palette.borderStrong,
            colorBorderSecondary: palette.border,
            boxShadowSecondary: isDark
                ? '0 16px 40px rgba(0, 0, 0, 0.45)'
                : '0 16px 40px rgba(20, 20, 22, 0.12)',
        },
        components: {
            Button: {
                fontWeight: 600,
                primaryShadow: 'none',
                defaultShadow: 'none',
                dangerShadow: 'none',
                defaultBg: palette.surface,
                defaultBorderColor: palette.borderStrong,
                defaultColor: palette.text,
            },
            Input: {
                activeBorderColor: primary,
                hoverBorderColor: primary,
                activeShadow: `0 0 0 3px ${isDark ? 'rgba(74, 158, 255, 0.24)' : BRAND.softStrong}`,
                paddingBlock: 8,
            },
            Select: {
                optionSelectedBg: isDark ? 'rgba(74, 158, 255, 0.20)' : BRAND.soft,
                optionActiveBg: isDark ? 'rgba(74, 158, 255, 0.14)' : BRAND.softStrong,
            },
            Card: {
                colorBgContainer: palette.surface,
                paddingLG: 24,
            },
            Table: {
                headerBg: palette.subtle,
                headerColor: palette.text,
                headerSplitColor: palette.border,
                rowHoverBg: isDark ? 'rgba(74, 158, 255, 0.12)' : BRAND.soft,
                borderColor: palette.border,
            },
            Menu: {
                itemBorderRadius: RADIUS.sm,
                itemSelectedBg: isDark ? 'rgba(74, 158, 255, 0.18)' : BRAND.soft,
                itemSelectedColor: primary,
                itemHoverBg: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 15, 15, 0.04)',
                subMenuItemBg: 'transparent',
            },
            Layout: {
                bodyBg: palette.page,
                headerBg: palette.surface,
                siderBg: palette.surface,
            },
            Modal: {
                contentBg: palette.elevated,
                headerBg: palette.elevated,
            },
            Form: {
                labelColor: palette.text,
                verticalLabelPadding: '0 0 6px',
            },
        },
    };
};
