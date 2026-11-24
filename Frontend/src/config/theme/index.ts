import { theme as antdTheme, type ThemeConfig } from 'antd';

/**
 * Color values for the antd theme. They mirror the CSS variables in `styles/tokens.css`
 * (antd needs literal colors to derive hover/active shades, so it cannot read CSS variables).
 * Change a color in both places.
 */
export const PALETTE = {
    light: {
        canvas: '#FFFFFF',
        blush: '#FDF4F7',
        elevated: '#FFF8F4',
        tintHover: '#FBEDF2',
        ink: '#3B2230',
        inkMuted: '#8E6B78',
        inkSoft: '#BE9EAA',
        rose: '#B83E6C',
        roseHover: '#A03460',
        roseActive: '#8A2C52',
        roseSoft: 'rgba(184, 62, 108, 0.10)',
        sparkle: '#E58FB0',
        glow: 'rgba(229, 143, 176, 0.22)',
        hairline: '#F3E3EA',
        chrome: '#E4B7CB',
        good: '#5E7F5D',
        warn: '#A0702A',
        err: '#AE4B33',
    },
    dark: {
        canvas: '#1C1218',
        blush: '#24171E',
        elevated: '#2B1C24',
        tintHover: '#33212B',
        ink: '#F6E9EE',
        inkMuted: '#C7A5B2',
        inkSoft: '#8C6E7A',
        rose: '#C2507E',
        roseHover: '#A8436C',
        roseActive: '#8F3A5D',
        roseSoft: 'rgba(194, 80, 126, 0.16)',
        sparkle: '#B86A8A',
        glow: 'rgba(229, 143, 176, 0.16)',
        hairline: '#3A2731',
        chrome: '#5A3546',
        good: '#8DB38B',
        warn: '#D2A157',
        err: '#E07A62',
    },
} as const;

export const FONT = {
    sans: "'Be Vietnam Pro', system-ui, sans-serif",
    serif: "'Fraunces', Georgia, serif",
} as const;

export const RADIUS = { xs: 4, sm: 8, md: 12, lg: 16 } as const;

/**
 * Build the antd theme from the palette. antd derives every state (hover / active / disabled)
 * from these tokens, so no per-state CSS is written by hand.
 */
export const buildAntdTheme = (isDark: boolean): ThemeConfig => {
    const p = isDark ? PALETTE.dark : PALETTE.light;

    return {
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
            colorPrimary: p.rose,
            colorPrimaryHover: p.roseHover,
            colorPrimaryActive: p.roseActive,
            colorInfo: p.rose,
            colorLink: p.rose,
            colorLinkHover: p.roseHover,
            colorLinkActive: p.roseActive,
            colorSuccess: p.good,
            colorWarning: p.warn,
            colorError: p.err,
            borderRadius: RADIUS.sm,
            borderRadiusLG: RADIUS.md,
            borderRadiusSM: RADIUS.xs,
            controlHeight: 40,
            controlHeightLG: 44,
            fontFamily: FONT.sans,
            fontSize: 14,
            colorBgBase: p.canvas,
            colorBgLayout: p.canvas,
            colorBgContainer: p.canvas,
            colorBgElevated: isDark ? p.elevated : p.canvas,
            colorText: p.ink,
            colorTextHeading: p.ink,
            colorTextSecondary: p.inkMuted,
            colorTextTertiary: p.inkMuted,
            colorTextQuaternary: p.inkSoft,
            colorTextPlaceholder: p.inkSoft,
            colorBorder: p.chrome,
            colorBorderSecondary: p.hairline,
            colorSplit: p.hairline,
            controlItemBgHover: p.tintHover,
            controlItemBgActive: p.roseSoft,
            controlOutline: p.glow,
            colorBgMask: 'rgba(59, 34, 48, 0.25)',
            boxShadowSecondary: isDark
                ? '0 16px 40px rgba(0, 0, 0, 0.45)'
                : '0 14px 34px -14px rgba(120, 40, 70, 0.45)',
        },
        components: {
            Button: {
                fontWeight: 600,
                borderRadius: RADIUS.xs,
                borderRadiusLG: RADIUS.xs,
                borderRadiusSM: RADIUS.xs,
                primaryShadow: 'none',
                defaultShadow: 'none',
                dangerShadow: 'none',
                defaultBg: p.canvas,
                defaultBorderColor: p.sparkle,
                defaultColor: p.ink,
                defaultHoverBg: p.blush,
                defaultHoverBorderColor: p.rose,
                defaultHoverColor: p.rose,
            },
            // Inputs are underlined app-wide (ConfigProvider variant="underlined" in App.tsx): template `.search-line`.
            Input: {
                colorBorder: p.inkSoft,
                hoverBorderColor: p.rose,
                activeBorderColor: p.rose,
                activeShadow: 'none',
                paddingBlock: 7,
            },
            InputNumber: {
                colorBorder: p.inkSoft,
                hoverBorderColor: p.rose,
                activeBorderColor: p.rose,
                activeShadow: 'none',
            },
            DatePicker: {
                colorBorder: p.inkSoft,
                hoverBorderColor: p.rose,
                activeBorderColor: p.rose,
                activeShadow: 'none',
            },
            Select: {
                colorBorder: p.inkSoft,
                hoverBorderColor: p.rose,
                activeBorderColor: p.rose,
                activeOutlineColor: 'transparent',
                // components-template.html option list: blush on hover, tint when selected, no bold.
                optionSelectedBg: p.tintHover,
                optionActiveBg: p.blush,
                optionSelectedFontWeight: 500,
            },
            // Bead on a thread (components-template.html): 34 x 22 box, 13px bead; the thread is drawn in
            // styles/antd-skin.css.
            Switch: {
                trackHeight: 22,
                trackMinWidth: 34,
                handleSize: 13,
                trackPadding: 4.5,
            },
            Segmented: {
                trackBg: 'transparent',
                itemColor: p.inkMuted,
                itemHoverColor: p.ink,
                itemHoverBg: p.tintHover,
                itemSelectedBg: p.rose,
                itemSelectedColor: '#FFFFFF',
            },
            Skeleton: {
                gradientFromColor: p.blush,
                gradientToColor: p.tintHover,
            },
            Card: {
                colorBgContainer: p.canvas,
                paddingLG: 24,
            },
            Table: {
                headerBg: p.canvas,
                headerColor: p.inkSoft,
                headerSplitColor: 'transparent',
                // Solid color, not rgba: `fixed` columns need an opaque background or scrolled text shows through.
                rowHoverBg: p.tintHover,
                borderColor: p.hairline,
            },
            Tabs: {
                itemColor: p.inkMuted,
                itemHoverColor: p.ink,
                itemSelectedColor: p.ink,
                inkBarColor: p.rose,
                // Template `.tabbar`: 28px between tabs, 10px under the label, 28px below the bar.
                horizontalItemGutter: 28,
                horizontalItemPadding: '0 0 10px',
                horizontalMargin: '0 0 28px',
            },
            Menu: {
                itemBorderRadius: RADIUS.sm,
                itemSelectedBg: p.roseSoft,
                itemSelectedColor: p.rose,
                itemHoverBg: p.tintHover,
                subMenuItemBg: 'transparent',
            },
            Layout: {
                bodyBg: p.canvas,
                headerBg: p.canvas,
                siderBg: p.blush,
            },
            Modal: {
                contentBg: isDark ? p.elevated : p.canvas,
                headerBg: isDark ? p.elevated : p.canvas,
            },
            Tooltip: {
                colorBgSpotlight: p.ink,
                colorTextLightSolid: p.canvas,
            },
            Form: {
                labelColor: p.ink,
                verticalLabelPadding: '0 0 6px',
            },
        },
    };
};
