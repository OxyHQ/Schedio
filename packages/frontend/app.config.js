const pkg = require('./package.json')
const fs = require('fs')
const path = require('path')
const { oxySplashScreenPlugin } = require('@oxyhq/expo-splash/config')

module.exports = function(_config) {

    /**
     * App version number. Should be incremented as part of a release cycle.
     */
  const VERSION = pkg.version

  /**
   * Uses built-in Expo env vars
   *
   * @see https://docs.expo.dev/build-reference/variables/#built-in-environment-variables
   */
  const PLATFORM = process.env.EAS_BUILD_PLATFORM

  const IS_TESTFLIGHT = process.env.EXPO_PUBLIC_ENV === 'testflight'
  const IS_PRODUCTION = process.env.EXPO_PUBLIC_ENV === 'production'
  const IS_DEV = !IS_TESTFLIGHT || !IS_PRODUCTION

  // Check if google-services.json exists
  const googleServicesPath = path.resolve(__dirname, '../../google-services.json')
  const hasGoogleServices = fs.existsSync(googleServicesPath)


return {
    expo: {
        name: "Schedio",
        slug: "schedio",
        version: VERSION,
      orientation: 'portrait',
      icon: './assets/images/schedio-icon.png',
      scheme: 'schedio',
      userInterfaceStyle: 'automatic',
      newArchEnabled: true,
      experiments: {
        typedRoutes: true,
        reactCompiler: true
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.schedio.ios',
      },
        android: {
            adaptiveIcon: {
                foregroundImage: "./assets/images/schedio-icon_foreground.png",
                backgroundImage: "./assets/images/schedio-icon_background.png",
                monochromeImage: "./assets/images/schedio-icon_monochrome.png"
            },
            permissions: [],
            // Must match google-services.json package_name
            package: "com.schedio.app",
            // Point to your google-services.json for FCM (only if file exists)
            ...(hasGoogleServices && { googleServicesFile: "../../google-services.json" }),
            intentFilters: [
                    {
                        action: 'VIEW',
                        autoVerify: true,
                        data: [
                            {
                                scheme: 'https',
                                host: 'schedio.app',
                            },
                            IS_DEV && {
                                scheme: 'http',
                                host: 'localhost:3001',
                            },
                            IS_DEV && {
                                scheme: 'http',
                                host: '192.168.86.44:3001',
                            },
                            IS_DEV && {
                                scheme: 'http',
                                host: '192.168.86.44:3000',
                            },
                            {
                                scheme: 'https',
                                host: 'oxy.so',
                            },
                            IS_DEV && {
                                scheme: 'http',
                                host: 'localhost:3000',
                            },
                        ],
                        category: ['BROWSABLE', 'DEFAULT'],
                    },
            ],
            softwareKeyboardLayoutMode: "pan",
            edgeToEdgeEnabled: true,
        },
        web: {
            bundler: "metro",
            output: "static",
            favicon: "./public/favicon.ico",
            manifest: "./public/manifest.json",
            meta: {
                viewport: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
                themeColor: "#4F46E5",
                appleMobileWebAppCapable: "yes",
                appleMobileWebAppStatusBarStyle: "default",
                appleMobileWebAppTitle: "Schedio",
                applicationName: "Schedio",
                msapplicationTileColor: "#4F46E5",
                msapplicationConfig: "/browserconfig.xml"
            },
            build: {
          babel: {
            include: ['@expo/vector-icons'],
          },
        },
        // Add Metro configuration for better module resolution
        metro: {
          resolver: {
            alias: {
              '@react-native-async-storage/async-storage': require.resolve('@react-native-async-storage/async-storage'),
            },
          },
        },
        },
        // Build the plugins array dynamically so we can exclude certain
        // native-only plugins (like expo-notifications) from web builds.
        plugins: (() => {
            const base = [
                "expo-router",
                // Native OS splash (Oxy family "Instagram, from Meta" pattern):
                // Schedio's own logo (white paper-plane mark on transparent)
                // centered on the dark brand background, with the shared Oxy
                // symbol pinned to the bottom. `oxySplashScreenPlugin` builds the
                // `expo-splash-screen` tuple; the bare `@oxyhq/expo-splash` entry
                // (which bundles the Oxy mark) MUST come IMMEDIATELY after it to
                // add the bottom branding — the ordering is load-bearing, so keep
                // these two entries adjacent (expo-notifications is spliced in
                // AFTER them below).
                oxySplashScreenPlugin({
                    image: './assets/images/splash-logo.png',
                    imageWidth: 176,
                    backgroundColor: '#0B0B0F',
                }),
                '@oxyhq/expo-splash',
                "expo-image-picker",
                "expo-video",
                [
                    "expo-secure-store",
                    {
                        configureAndroidBackup: true,
                        faceIDPermission: "Allow $(PRODUCT_NAME) to access your Face ID biometric data."
                    }
                ],
                [
                    'expo-font',
                    {
                      fonts: [
                        './assets/fonts/inter/Inter-Regular.otf',
                        './assets/fonts/inter/Inter-Italic.otf',
                        './assets/fonts/inter/Inter-SemiBold.otf',
                        './assets/fonts/inter/Inter-SemiBoldItalic.otf',
                        './assets/fonts/inter/Inter-ExtraBold.otf',
                        './assets/fonts/inter/Inter-ExtraBoldItalic.otf',
                        './assets/fonts/Phudu-VariableFont_wght.ttf',
                      ],
                    },
                  ],
                [
                    '@bitdrift/react-native',
                    {
                        networkInstrumentation: true,
                    }
                ],
                [
                    'expo-build-properties',
                    {
                      ios: {
                        deploymentTarget: '16.4',
                      },
                      android: {
                        compileSdkVersion: 35,
                        targetSdkVersion: 35,
                        buildToolsVersion: '35.0.0',
                        enableProguardInReleaseBuilds: true,
                        enableShrinkResourcesInReleaseBuilds: true,
                        useLegacyPackaging: false
                      },
                    },
                ],
                "expo-web-browser",
            ];

            // Only include expo-notifications for native builds (android/ios).
            // Insert at index 3 (was 2) so it lands AFTER the two splash entries
            // (`oxySplashScreenPlugin(...)` at 1 + `'@oxyhq/expo-splash'` at 2)
            // and never splits that load-bearing pair.
            if (PLATFORM !== 'web') {
                base.splice(3, 0, [
                    "expo-notifications",
                    {
                        color: "#ffffff"
                    }
                ]);
            }

            return base;
        })(),
        extra: {
            eas: {
                projectId: "47bac898-ae20-479b-ab0f-2d8ab2770c83"
            },
            router: {
                origin: false
            }
        },
        owner: "oxyhq"
    }
};
};
