import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import hy from "./locales/hy.json";

export const LANGUAGE_STORAGE_KEY = "listly:lang";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hy", label: "Հայերեն" },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hy: { translation: hy },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "hy"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"],
    },
  });

export default i18n;
