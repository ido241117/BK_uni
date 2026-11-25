import { Suspense, useMemo } from 'react';
import { ConfigProvider } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/vi';
import { ToastContainer, type IconProps } from 'react-toastify';
import { PiCheckCircleFill, PiInfoFill, PiWarningFill, PiXCircleFill } from 'react-icons/pi';
import { RouteLoading } from '@/components';
import { ThemeProvider, useAppTheme } from '@/contexts';
import { buildAntdTheme } from '@/config/theme';
import AppRouter from '@/routes';
import { useLanguage } from '@/i18n/useLanguage';

import 'react-toastify/dist/ReactToastify.css';

/** Toast icon per type (ui-template/feedback.html, toast); the color comes from the toast's tone. */
const toastIcon = ({ type, isLoading }: IconProps) => {
    if (isLoading) return undefined;
    if (type === 'success') return <PiCheckCircleFill color="var(--sem-good)" size={16} />;
    if (type === 'error') return <PiXCircleFill color="var(--sem-err)" size={16} />;
    if (type === 'warning') return <PiWarningFill color="var(--sem-warn)" size={16} />;
    return <PiInfoFill color="var(--accent-rose)" size={16} />;
};

const AppContent = () => {
    const { isDark } = useAppTheme();
    const { lang } = useLanguage();
    const antdTheme = useMemo(() => buildAntdTheme(isDark), [isDark]);
    // Date words (month names, "today") follow the UI language.
    dayjs.locale(lang);

    return (
        <ConfigProvider locale={lang === 'en' ? enUS : viVN} theme={antdTheme} variant="underlined">
            <Suspense fallback={<RouteLoading />}>
                {/* Remount on language change so every page re-renders in the new language (queries stay cached). */}
                <AppRouter key={lang} />
            </Suspense>

            <ToastContainer
                icon={toastIcon}
                position="top-right"
                autoClose={3000}
                newestOnTop
                closeOnClick
                theme={isDark ? 'dark' : 'light'}
            />
        </ConfigProvider>
    );
};

// `layer`: antd's generated styles go into `@layer antd` (order declared in styles/index.css), so our component
// styles can override antd instead of always losing to its unlayered rules.
const App = () => (
    <StyleProvider layer>
        <ThemeProvider>
            <AppContent />
        </ThemeProvider>
    </StyleProvider>
);

export default App;
