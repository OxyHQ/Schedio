import React, { useMemo, useCallback } from 'react';
import { StyleSheet, View, Text, ViewStyle, Platform, Vibration, Pressable } from 'react-native';
import { Link, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Components
import Avatar from '@/components/Avatar';

// Icons
import { Home, HomeActive } from '@/assets/icons/home-icon';
import { Gear, GearActive } from '@/assets/icons/gear-icon';
import { ComposeIcon, ComposeIIconActive } from '@/assets/icons/compose-icon';
import { CalendarIcon } from '@/assets/icons/calendar-icon';
import { AnalyticsIcon, AnalyticsIconActive } from '@/assets/icons/analytics-icon';

// Hooks
import { useTheme } from '@/hooks/useTheme';
import { useOxy, useAuth } from '@oxyhq/services';

// Utils
import { ROUTES, routeMatchers, isRouteActive } from '@/utils/routeUtils';

// Types
import type { NavigationItem } from '@/types/navigation';

const IconComponent = Ionicons as any;

export const BottomBar = () => {
    const { t } = useTranslation();
    const pathname = usePathname();
    const { user, isAuthenticated, oxyServices } = useOxy();
    const { signIn } = useAuth();
    const insets = useSafeAreaInsets();
    const theme = useTheme();

    const avatarUri = useMemo(() => {
        return user?.avatar ? oxyServices.getFileDownloadUrl(user.avatar as string, 'thumb') : undefined;
    }, [user?.avatar, oxyServices]);

    // Build navigation items with theme-aware icons
    const navigationItems = useMemo<NavigationItem[]>(() => [
        {
            title: t("Dashboard"),
            icon: <Home color={theme.colors.text} size={24} />,
            iconActive: <HomeActive color={theme.colors.primary} size={24} />,
            route: ROUTES.HOME,
        },
        {
            title: t("Compose"),
            icon: <ComposeIcon color={theme.colors.text} size={24} />,
            iconActive: <ComposeIIconActive color={theme.colors.primary} size={24} />,
            route: ROUTES.COMPOSE,
        },
        {
            title: t("Queue"),
            icon: <CalendarIcon color={theme.colors.text} size={24} />,
            iconActive: <CalendarIcon color={theme.colors.primary} size={24} />,
            route: ROUTES.QUEUE,
        },
        {
            title: t("Analytics"),
            icon: <AnalyticsIcon color={theme.colors.text} size={24} />,
            iconActive: <AnalyticsIconActive color={theme.colors.primary} size={24} />,
            route: ROUTES.ANALYTICS,
        },
        {
            title: t("Settings"),
            icon: <Gear color={theme.colors.text} />,
            iconActive: <GearActive color={theme.colors.primary} />,
            route: ROUTES.SETTINGS,
        },
    ], [theme.colors, t]);

    const getIsRouteActive = useCallback((route: string): boolean => {
        if (route === ROUTES.HOME) {
            return routeMatchers.isHomeRoute(pathname);
        }
        if (route === ROUTES.COMPOSE) {
            return routeMatchers.isComposeRoute(pathname);
        }
        if (route === ROUTES.QUEUE) {
            return routeMatchers.isQueueRoute(pathname);
        }
        if (route === ROUTES.ANALYTICS) {
            return routeMatchers.isAnalyticsRoute(pathname);
        }
        if (route === ROUTES.SETTINGS) {
            return routeMatchers.isSettingsRoute(pathname);
        }
        return isRouteActive(pathname, route, { startsWith: true, includes: true });
    }, [pathname]);

    const styles = StyleSheet.create({
        bottomBar: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            height: 60 + insets.bottom,
            backgroundColor: theme.colors.card,
            flexDirection: 'row',
            justifyContent: 'space-around',
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            elevation: 8,
            paddingBottom: insets.bottom,
            paddingTop: 8,
            zIndex: 1000,
            ...Platform.select({
                web: {
                    position: 'fixed',
                    height: 60,
                    paddingBottom: 8,
                },
            }),
        } as ViewStyle,
        tab: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 8,
            minHeight: 48,
        },
        tabContent: {
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
        },
        tabIcon: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        tabText: {
            fontSize: 11,
            fontWeight: '500',
            marginTop: 2,
            color: theme.colors.textSecondary,
        },
        tabTextActive: {
            color: theme.colors.primary,
            fontWeight: '600',
        },
    });

    return (
        <View style={styles.bottomBar}>
            {navigationItems.map(({ title, icon, iconActive, route, onPress }) => {
                const isActive = getIsRouteActive(route);

                const tabContent = (
                    <View style={styles.tabContent}>
                        <View style={styles.tabIcon}>
                            {isActive ? iconActive : icon}
                        </View>
                        <Text style={[
                            styles.tabText,
                            isActive && styles.tabTextActive,
                            {
                                color: isActive ? theme.colors.primary : theme.colors.textSecondary,
                            }
                        ]}>
                            {title}
                        </Text>
                    </View>
                );

                return (
                    <Link
                        key={`${route}-${title}`}
                        href={route as any}
                        style={styles.tab}
                        asChild
                    >
                        <Pressable
                            onPress={onPress}
                            style={({ pressed }: any) => [
                                styles.tab,
                                pressed && {
                                    backgroundColor: `${theme.colors.primary}10`,
                                    borderRadius: 8,
                                },
                            ]}
                        >
                            {tabContent}
                        </Pressable>
                    </Link>
                );
            })}

            {/* Profile/Avatar button */}
            <Link
                href={user?.username ? `/@${user.username}` as any : '#' as any}
                style={styles.tab}
                asChild
            >
                <Pressable
                    onPress={async () => {
                        if (!isAuthenticated || !user?.username) {
                            try {
                                await signIn();
                            } catch (error: any) {
                                if (!error?.message?.includes('cancelled') && !error?.message?.includes('closed')) {
                                    console.error('Authentication error:', error);
                                }
                            }
                        }
                    }}
                    style={({ pressed }: any) => [
                        styles.tab,
                        pressed && {
                            backgroundColor: `${theme.colors.primary}10`,
                            borderRadius: 8,
                        },
                        pathname?.startsWith('/@') && {
                            backgroundColor: `${theme.colors.primary}15`,
                            borderRadius: 8,
                        },
                    ]}
                >
                    <View style={styles.tabContent}>
                        <View style={styles.tabIcon}>
                            <Avatar
                                size={24}
                                source={avatarUri ? { uri: avatarUri } : undefined}
                            />
                        </View>
                        <Text style={[
                            styles.tabText,
                            pathname?.startsWith('/@') && styles.tabTextActive,
                            {
                                color: pathname?.startsWith('/@') ? theme.colors.primary : theme.colors.textSecondary,
                            }
                        ]}>
                            {user?.username ? t("Profile") : t("Sign In")}
                        </Text>
                    </View>
                </Pressable>
            </Link>
        </View>
    );
};
