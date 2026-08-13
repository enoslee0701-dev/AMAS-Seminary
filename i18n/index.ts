import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';

/**
 * Decide the initial language. We honour an explicit user choice from
 * localStorage first (so the in-app language switcher wins), then fall back
 * to the browser's preference, and finally to zh-CN — which matches the
 * historical UI behaviour before i18n existed.
 */
const detectInitialLanguage = (): 'zh-CN' | 'en' => {
  try {
    const stored = typeof localStorage !== 'undefined'
      ? localStorage.getItem('amas_lang')
      : null;
    if (stored === 'zh-CN' || stored === 'en') return stored;
  } catch {
    // localStorage can throw in some sandboxed contexts (e.g. private mode
    // in old Safari). Treat as "no preference stored" and continue.
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      return navigator.language.startsWith('zh') ? 'zh-CN' : 'en';
    }
  } catch {
    // ignore
  }
  return 'zh-CN';
};

// Initialised synchronously so the very first render already has a usable
// translation function. `initImmediate: false` keeps everything in-memory.
void i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      en: { translation: en },
    },
    lng: detectInitialLanguage(),
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
export { useTranslation } from 'react-i18next';
