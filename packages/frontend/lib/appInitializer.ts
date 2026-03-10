/**
 * App Initialization Service
 * Centralizes all initialization logic for better testability and maintainability
 */

import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { oxyClient } from '@oxyhq/core';

import { useAppearanceStore } from '@/stores/appearanceStore';
import {
  hasNotificationPermission,
  setupNotifications,
} from '@/utils/notifications';
import { initializeI18n } from './i18n';
import { INITIALIZATION_TIMEOUT } from './constants';
import { runStartupHealthCheck } from '@/utils/appHealthCheck';

export interface InitializationResult {
  success: boolean;
  error?: Error;
}

export interface AppInitializationState {
  fontsLoaded: boolean;
  i18nInitialized: boolean;
  notificationsSetup: boolean;
  authReady: boolean;
  appearanceLoaded: boolean;
}

/**
 * Sets up notifications for native platforms
 */
async function setupNotificationsIfNeeded(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    await setupNotifications();
    await hasNotificationPermission();
  } catch (error) {
    console.warn('Failed to setup notifications:', error);
  }
}

/**
 * Loads user appearance settings
 */
async function loadAppearanceSettings(): Promise<void> {
  try {
    await useAppearanceStore.getState().loadMySettings();
  } catch (error) {
    console.warn('Failed to load appearance settings:', error);
  }
}

/**
 * Fetches current user
 */
async function fetchCurrentUser(): Promise<void> {
  try {
    await oxyClient.getCurrentUser();
  } catch (error) {
    // User might not be authenticated yet, which is fine
    console.log('User not authenticated during init');
  }
}

/**
 * Main app initialization function
 * Coordinates all initialization steps
 */
export class AppInitializer {
  /**
   * Initializes i18n
   */
  static async initializeI18n(): Promise<InitializationResult> {
    try {
      await initializeI18n();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown i18n error'),
      };
    }
  }

  /**
   * Initializes the entire app
   * Only blocks on critical-path work (user + appearance).
   * Notifications are deferred.
   */
  static async initializeApp(
    fontsLoaded: boolean
  ): Promise<InitializationResult> {
    if (!fontsLoaded) {
      return {
        success: false,
        error: new Error('Fonts not loaded'),
      };
    }

    try {
      const STARTUP_TIMEOUT_MS = 2000;

      await Promise.race([
        Promise.all([
          fetchCurrentUser(),
          loadAppearanceSettings(),
        ]),
        new Promise<void>((resolve) => setTimeout(resolve, STARTUP_TIMEOUT_MS)),
      ]);

      try {
        await SplashScreen.hideAsync();
      } catch (error) {
        console.warn('Failed to hide native splash screen:', error);
      }

      return { success: true };
    } catch (error) {
      try {
        await SplashScreen.hideAsync();
      } catch (_) {}
      return { success: true };
    }
  }

  /**
   * Deferred initialization — runs after the app is visible.
   */
  static async initializeDeferred(): Promise<void> {
    try {
      await runStartupHealthCheck();
      await setupNotificationsIfNeeded();
    } catch (error) {
      console.warn('[AppInitializer] Deferred init error:', error);
    }
  }

  /**
   * Loads eager settings that don't block app initialization.
   * Skips if user is not yet authenticated (token not available).
   */
  static async loadEagerSettings(): Promise<void> {
    if (!oxyClient.getAccessToken()) return;

    await Promise.allSettled([
      loadAppearanceSettings(),
    ]);
  }
}
