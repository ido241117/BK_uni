import { useTranslation } from 'react-i18next';
import type { Language } from './index';

/** Current UI language and a setter; the choice is remembered in this browser (see i18n/index.ts). */
export const useLanguage = () => {
    const { i18n } = useTranslation();
    const lang: Language = i18n.language === 'en' ? 'en' : 'vi';

    return {
        lang,
        setLang: (next: Language) => { void i18n.changeLanguage(next); },
        toggle: () => { void i18n.changeLanguage(lang === 'vi' ? 'en' : 'vi'); },
    };
};
