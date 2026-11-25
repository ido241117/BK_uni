import { Tooltip } from 'antd';
import { PiMoon, PiSun } from 'react-icons/pi';
import { useAppTheme } from '@/contexts';
import i18n from '@/i18n';

/** Light / dark switch (moon in light mode, sun in dark mode). Used in the topbar and on the login page. */
export const ThemeToggle = () => {
    const { isDark, toggleMode } = useAppTheme();
    const label = isDark ? i18n.t('Chuyển giao diện sáng') : i18n.t('Chuyển giao diện tối');

    return (
        <Tooltip title={label}>
            <button type="button" className="icon-btn" onClick={toggleMode} aria-label={label}>
                {isDark ? <PiSun /> : <PiMoon />}
            </button>
        </Tooltip>
    );
};
