/**
 * AppProviders Component
 * Centralizes all provider components for better organization
 * Memoized to prevent unnecessary re-renders
 */

import React, { memo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { MenuProvider } from 'react-native-popup-menu';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { OxyProvider } from '@oxy.so/services';

import ErrorBoundary from '@/components/ErrorBoundary';
import { BottomSheetProvider } from '@/context/BottomSheetContext';
import { HomeRefreshProvider } from '@/context/HomeRefreshContext';
import i18n, { setLanguage } from '@/lib/i18n';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@/lib/constants';
import { OXY_BASE_URL, OXY_CLIENT_ID } from '@/config';
import { logger } from '@/utils/logger';

interface AppProvidersProps {
  children: React.ReactNode;
  colorScheme: 'light' | 'dark' | null | undefined;
  queryClient: QueryClient;
}

/**
 * Wraps the app with all necessary providers
 * Separated from _layout.tsx for better testability
 * Memoized to prevent re-renders when props don't change
 */
export const AppProviders = memo(function AppProviders({
  children,
  colorScheme,
  queryClient,
}: AppProvidersProps) {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <OxyProvider
            baseURL={OXY_BASE_URL}
            clientId={OXY_CLIENT_ID}
            language={{
              supportedLocales: SUPPORTED_LANGUAGES,
              fallbackLocale: DEFAULT_LANGUAGE,
              onChange: setLanguage,
              onError: (error, locale) =>
                logger.error('Failed to follow the Oxy-resolved language', error, { locale }),
            }}
          >
            <I18nextProvider i18n={i18n}>
              <BottomSheetModalProvider>
                <BottomSheetProvider>
                  <MenuProvider>
                    <ErrorBoundary>
                      <HomeRefreshProvider>
                        {children}
                        <StatusBar style="auto" />
                      </HomeRefreshProvider>
                    </ErrorBoundary>
                  </MenuProvider>
                </BottomSheetProvider>
              </BottomSheetModalProvider>
            </I18nextProvider>
          </OxyProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
});

