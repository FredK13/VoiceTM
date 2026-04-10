// lib/i18n.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const LANG_STORAGE_KEY = "app_language";

export const SUPPORTED_LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "ru", label: "Русский" },
  { code: "it", label: "Italiano" },
  { code: "hi", label: "हिन्दी" },
] as const;

export type SupportedLangCode = (typeof SUPPORTED_LANGS)[number]["code"];

// ✅ Import JSON files (Expo supports this)
import en from "../assets/i18n/en.json";
import es from "../assets/i18n/es.json";
import fr from "../assets/i18n/fr.json";
import de from "../assets/i18n/de.json";
import ja from "../assets/i18n/ja.json";
import zh from "../assets/i18n/zh.json";
import ru from "../assets/i18n/ru.json";
import it from "../assets/i18n/it.json";
import hi from "../assets/i18n/hi.json";

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  ja: { translation: ja },
  zh: { translation: zh },
  ru: { translation: ru },
  it: { translation: it },
  hi: { translation: hi },
} as const;

function normalizeToSupported(code: string): SupportedLangCode {
  const base = (code || "en").toLowerCase().split("-")[0];
  return (SUPPORTED_LANGS.some((l) => l.code === base) ? base : "en") as SupportedLangCode;
}

async function ensureI18nInitialized() {
  if (i18n.isInitialized) return;

  await i18n.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export async function initAppLanguage() {
  await ensureI18nInitialized();

  const saved = await AsyncStorage.getItem(LANG_STORAGE_KEY);
  if (saved) {
    await i18n.changeLanguage(normalizeToSupported(saved));
    return;
  }

  const deviceTag =
    Localization.getLocales()?.[0]?.languageTag ??
    Localization.getLocales()?.[0]?.languageCode ??
    "en";

  const supported = normalizeToSupported(deviceTag);
  await i18n.changeLanguage(supported);
}

export async function setAppLanguage(code: SupportedLangCode) {
  await ensureI18nInitialized();
  await i18n.changeLanguage(code);
  await AsyncStorage.setItem(LANG_STORAGE_KEY, code);
}

export default i18n;

