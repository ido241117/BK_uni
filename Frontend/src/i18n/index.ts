import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';

/*
 * Language switch (VN / EN). Keys are the Vietnamese text itself ("gettext style"): `t('Đăng nhập')`. Vietnamese needs
 * no dictionary; `en.json` maps each Vietnamese string to English. A string missing from en.json falls back to
 * Vietnamese instead of showing a key. Interpolation: `t('Đã lưu {{count}} môn', { count })`.
 * Check for untranslated strings: `npm run i18n:check`.
 */
export const LANGUAGES = ['vi', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'bk-uni:lang';

const readStored = (): Language => {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return stored === 'en' ? 'en' : 'vi';
    } catch {
        return 'vi';
    }
};

void i18n.use(initReactI18next).init({
    resources: { vi: { translation: {} }, en: { translation: en } },
    lng: readStored(),
    fallbackLng: 'vi',
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
});

const syncDocument = (lang: string) => {
    document.documentElement.lang = lang;
};
syncDocument(i18n.language);

i18n.on('languageChanged', (lang) => {
    syncDocument(lang);
    try {
        window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
        // Not persisted; the choice still applies for this session.
    }
});

export default i18n;
