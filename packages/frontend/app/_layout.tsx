// Required polyfill for @oxyhq/services - must be imported first
import 'react-native-url-polyfill/auto';
// Import Reanimated early to ensure proper initialization before other modules
import 'react-native-reanimated';

import NetInfo from '@react-native-community/netinfo';
import { preventNativeSplashAutoHide, useHideNativeSplashWhenReady } from '@oxyhq/expo-splash';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState, memo } from "react";
import { AppState, Platform, StyleSheet, View, type AppStateStatus } from "react-native";

// Components
import AppSplashScreen from '@/components/AppSplashScreen';
import { NotificationPermissionGate } from '@/components/notifications/NotificationPermissionGate';
import RegisterPush from '@/components/notifications/RegisterPushToken';
import { SideBar } from "@/components/SideBar";
import { BottomBar } from "@/components/layout/BottomBar";
import { ThemedView } from "@/components/ThemedView";
import { AppProviders } from '@/components/providers/AppProviders';
import { QUERY_CLIENT_CONFIG } from '@/components/providers/constants';

// Bloom theme provider — required by @oxyhq/services >=10 SDK components
// (OxySignInButton, bottom sheets) which consume Bloom's `useTheme`. Must wrap
// every render branch (splash + app) or those components throw
// "useTheme must be used within a <BloomThemeProvider>".
import { BloomThemeProvider } from '@oxyhq/bloom/theme';

// Hooks
import { useColorScheme } from "@/hooks/useColorScheme";
import { useIsScreenNotMobile } from "@/hooks/useOptimizedMediaQuery";
import { useTheme } from '@/hooks/useTheme';
import { useOxy } from '@oxyhq/services';

// Services & Utils
import { AppInitializer } from '@/lib/appInitializer';
import { startConnectionMonitoring } from '@/lib/network/connectionStatus';
import { loadFontsWithFallback } from '@/utils/fontLoader';

// Styles
import '../styles/global.css';

// NATIVE ONLY: hold the OS splash so it stays visible until fonts + init finish,
// then hide it once `appIsReady` flips (via `useHideNativeSplashWhenReady`). This
// makes the native OS splash the SINGLE splash on native — Schedio's white logo
// centered on the dark brand background with the Oxy symbol pinned to the bottom
// (configured by `@oxyhq/expo-splash` in app.config.js). The custom
// `AppSplashScreen` React overlay is gated to web only. No-op on web (the shared
// helper guards `Platform.OS === 'web'`).
preventNativeSplashAutoHide();

// Types
interface SplashState {
  initializationComplete: boolean;
  startFade: boolean;
  // WEB ONLY: set when the custom <AppSplashScreen> finishes fading out. Native
  // never renders that overlay, so this stays false there and must NOT gate
  // native readiness (see the readiness gate in RootLayout).
  fadeComplete: boolean;
}

interface MainLayoutProps {
  isScreenNotMobile: boolean;
}

/**
 * MainLayout Component
 * Memoized to prevent unnecessary re-renders when parent updates
 */
const MainLayout: React.FC<MainLayoutProps> = memo(({ isScreenNotMobile }) => {
  const theme = useTheme();
  const pathname = usePathname();
  const { user: currentUser } = useOxy();

  const needsAuth = !currentUser;
  const shouldShowBottomBar = !isScreenNotMobile;

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      width: '100%',
      marginHorizontal: 'auto',
      flexDirection: isScreenNotMobile ? 'row' : 'column',
      backgroundColor: theme.colors.background,
    },
    mainContent: {
      marginHorizontal: isScreenNotMobile ? 'auto' : 0,
      justifyContent: 'space-between',
      flexDirection: isScreenNotMobile ? 'row' : 'column',
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    mainContentWrapper: {
      flex: isScreenNotMobile ? 2.2 : 1,
      ...(isScreenNotMobile ? {
        borderLeftWidth: 0.5,
        borderRightWidth: 0.5,
        borderColor: theme.colors.border,
      } : {}),
      backgroundColor: theme.colors.background,
    },
  }), [isScreenNotMobile, theme.colors.background, theme.colors.border]);

  return (
    <View style={styles.container}>
      {isScreenNotMobile && <SideBar />}
      <View style={styles.mainContent}>
        <ThemedView style={styles.mainContentWrapper}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(main)" redirect={needsAuth} />
            <Stack.Screen name="(auth)" redirect={!needsAuth} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </ThemedView>
      </View>
      {shouldShowBottomBar && <BottomBar />}
    </View>
  );
});

MainLayout.displayName = 'MainLayout';

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [splashState, setSplashState] = useState<SplashState>({
    initializationComplete: false,
    startFade: false,
    fadeComplete: false,
  });

  const isScreenNotMobile = useIsScreenNotMobile();
  const queryClient = useMemo(() => new QueryClient(QUERY_CLIENT_CONFIG), []);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': require('@/assets/fonts/inter/Inter-Regular.otf'),
    'Inter-Medium': require('@/assets/fonts/inter/Inter-Medium.otf'),
    'Inter-SemiBold': require('@/assets/fonts/inter/Inter-SemiBold.otf'),
    'Inter-Bold': require('@/assets/fonts/inter/Inter-Bold.otf'),
    'Phudu': require('@/assets/fonts/Phudu-VariableFont_wght.ttf'),
  });

  // WEB only: the custom <AppSplashScreen> fades out once init completes; its
  // `onFadeComplete` records that the fade finished. On native this callback
  // never fires (no custom overlay is rendered), which is why native readiness
  // must NOT depend on it (see the readiness gate below).
  const handleSplashFadeComplete = useCallback(() => {
    setSplashState((prev) => ({ ...prev, fadeComplete: true }));
  }, []);

  const initializeApp = useCallback(async () => {
    if (fontError) {
      console.warn('Font loading failed, using system fonts:', fontError);
    } else if (!fontsLoaded) {
      console.log('Fonts still loading, continuing with system fonts temporarily...');
    }

    const result = await AppInitializer.initializeApp(fontsLoaded || false);

    if (result.success) {
      setSplashState((prev) => ({ ...prev, initializationComplete: true }));
    } else {
      console.error('App initialization failed:', result.error);
      setSplashState((prev) => ({ ...prev, initializationComplete: true }));
    }
  }, [fontsLoaded, fontError]);


  useEffect(() => {
    AppInitializer.initializeI18n().catch((error) => {
      console.error('Failed to initialize i18n:', error);
    });
  }, []);

  useEffect(() => {
    AppInitializer.loadEagerSettings();
  }, []);

  useEffect(() => {
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      onlineManager.setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    const stopMonitoring = startConnectionMonitoring();

    const onAppStateChange = (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    };
    const appStateSub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      unsubscribeNetInfo();
      stopMonitoring();
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    if (splashState.initializationComplete) return;

    loadFontsWithFallback(fontsLoaded, fontError).then(() => {
      if (!splashState.initializationComplete) {
        initializeApp();
      }
    });
  }, [fontsLoaded, fontError, initializeApp, splashState.initializationComplete]);

  useEffect(() => {
    if (splashState.initializationComplete && !splashState.startFade) {
      setSplashState((prev) => ({ ...prev, startFade: true }));
    }
  }, [splashState.initializationComplete, splashState.startFade]);

  // NATIVE ONLY: once ready, hide the held OS splash. The shared helper is a
  // no-op on web (the OS splash was never held; the custom overlay handles the
  // transition there).
  useHideNativeSplashWhenReady(appIsReady);

  // Readiness gate.
  // - WEB keeps the fade-gated flow: the custom <AppSplashScreen> renders, fades
  //   out when init completes, and its `onFadeComplete` sets `fadeComplete`, so
  //   web readiness = init complete AND the custom splash finished fading.
  // - NATIVE renders NO custom splash (the held OS splash covers the screen), so
  //   `onFadeComplete` never fires; native readiness = init complete ONLY, else
  //   the OS splash would hang forever.
  useEffect(() => {
    if (appIsReady) return;
    const ready =
      Platform.OS === 'web'
        ? splashState.initializationComplete && splashState.fadeComplete
        : splashState.initializationComplete;
    if (ready) {
      setAppIsReady(true);
    }
  }, [appIsReady, splashState.initializationComplete, splashState.fadeComplete]);

  useEffect(() => {
    if (appIsReady) {
      AppInitializer.initializeDeferred();
    }
  }, [appIsReady]);

  const colorScheme = useColorScheme();

  const appContent = useMemo(() => {
    if (!appIsReady) {
      // WEB: the custom splash covers font-load + init and fades out; its
      // `onFadeComplete` gates `appIsReady`. NATIVE renders null here — the held
      // OS splash is on top, so nothing underneath needs to paint.
      return Platform.OS === 'web' ? (
        <AppSplashScreen
          startFade={splashState.startFade}
          onFadeComplete={handleSplashFadeComplete}
        />
      ) : null;
    }

    return (
      <AppProviders colorScheme={colorScheme} queryClient={queryClient}>
        {Platform.OS !== 'web' && (
          <NotificationPermissionGate
            appIsReady={appIsReady}
            initializationComplete={splashState.initializationComplete}
          />
        )}
        <MainLayout isScreenNotMobile={isScreenNotMobile} />
        <RegisterPush />
      </AppProviders>
    );
  }, [
    appIsReady,
    splashState.startFade,
    splashState.initializationComplete,
    colorScheme,
    isScreenNotMobile,
    handleSplashFadeComplete,
    queryClient,
  ]);

  return (
    <BloomThemeProvider mode={colorScheme}>
      <ThemedView style={{ flex: 1 }}>
        {appContent}
      </ThemedView>
    </BloomThemeProvider>
  );
}
