/**
 * i18n Configuration and Initialization
 * Separated from _layout.tsx for better testability and maintainability
 */

import i18n, { init as i18nInit, use as i18nUse } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enUS from '@/locales/en.json';
import esES from '@/locales/es.json';
import itIT from '@/locales/it.json';

import { DEFAULT_LANGUAGE, STORAGE_KEYS } from './constants';
import { getData } from '@/utils/storage';

const i18nResources = {
  'en-US': { translation: enUS },
  'es-ES': { translation: esES },
  'it-IT': { translation: itIT },
} as const;

export interface I18nConfig {
  resources: typeof i18nResources;
  lng: string;
  fallbackLng: string;
  interpolation: { escapeValue: boolean };
}

/**
 * Switches the app's display language. This is the only supported way to
 * change language — all of Schedio's locale bundles are already statically
 * bundled above, so there is no catalog to fetch first (unlike apps that
 * lazy-load locale chunks, where calling i18next's `changeLanguage` directly
 * would switch to a language whose bundle was never loaded).
 */
export async function setLanguage(language: string): Promise<void> {
  await i18n.changeLanguage(language);
}

/**
 * Loads the saved language preference from storage
 */
export async function loadSavedLanguage(): Promise<string> {
  try {
    const savedLanguage = await getData<string>(STORAGE_KEYS.LANGUAGE_PREFERENCE);
    return savedLanguage || DEFAULT_LANGUAGE;
  } catch (error) {
    console.error('Failed to load saved language:', error);
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Initializes i18n with the saved language preference
 */
export async function initializeI18n(): Promise<void> {
  try {
    const initialLanguage = await loadSavedLanguage();

    if (i18n.isInitialized) {
      // If already initialized, just change the language
      await i18n.changeLanguage(initialLanguage);
      return;
    }

    // Initialize i18n with the saved language
    i18nUse(initReactI18next);
    await i18nInit({
      resources: i18nResources,
      lng: initialLanguage,
      fallbackLng: DEFAULT_LANGUAGE,
      interpolation: { escapeValue: false },
    });
  } catch (error) {
    console.error('i18n initialization failed:', error);
    // Fallback to default initialization
    if (!i18n.isInitialized) {
      try {
        i18nUse(initReactI18next);
        await i18nInit({
          resources: i18nResources,
          lng: DEFAULT_LANGUAGE,
          fallbackLng: DEFAULT_LANGUAGE,
          interpolation: { escapeValue: false },
        });
      } catch (fallbackError) {
        console.error('i18n fallback initialization failed:', fallbackError);
        throw fallbackError;
      }
    }
  }
}

export default i18n;

