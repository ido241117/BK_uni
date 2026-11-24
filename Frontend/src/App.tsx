import { Suspense, useMemo } from 'react';
import { ConfigProvider, Spin } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { ToastContainer } from 'react-toastify';
import { ThemeProvider, useAppTheme } from '@/contexts';
import { buildAntdTheme } from '@/config/theme';
import AppRouter from '@/routes';

import 'react-toastify/dist/ReactToastify.css';

dayjs.locale('vi');

const AppContent = () => {
    const { isDark } = useAppTheme();
    const antdTheme = useMemo(() => buildAntdTheme(isDark), [isDark]);

    return (
        <ConfigProvider locale={viVN} theme={antdTheme}>
            <Suspense
                fallback={(
                    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
                        <Spin size="large" />
                    </div>
                )}
            >
                <AppRouter />
            </Suspense>

            <ToastContainer
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
