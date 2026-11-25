import { Dropdown } from 'antd';
import { PiCaretDown, PiCheck, PiGlobe } from 'react-icons/pi';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, type Language } from '@/i18n';
import { useLanguage } from '@/i18n/useLanguage';

/** Language names are written in their own language, so they read right whichever language is active. */
const NAMES: Record<Language, string> = { vi: 'Tiếng Việt', en: 'English' };
const SHORT: Record<Language, string> = { vi: 'VN', en: 'EN' };

/** Globe + "VN"/"EN" button opening the language list (topbar, login page). */
export const LanguageMenu = () => {
    const { t } = useTranslation();
    const { lang, setLang } = useLanguage();

    return (
        <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
                selectedKeys: [lang],
                items: LANGUAGES.map(code => ({
                    key: code,
                    label: NAMES[code],
                    icon: code === lang ? <PiCheck /> : <span style={{ width: 14, display: 'inline-block' }} />,
                })),
                onClick: ({ key }) => setLang(key as Language),
            }}
        >
            <button type="button" className="lang-select" aria-label={t('Ngôn ngữ: {{name}}', { name: NAMES[lang] })}>
                <PiGlobe aria-hidden="true" /> {SHORT[lang]} <PiCaretDown className="caret" aria-hidden="true" />
            </button>
        </Dropdown>
    );
};

export default LanguageMenu;
