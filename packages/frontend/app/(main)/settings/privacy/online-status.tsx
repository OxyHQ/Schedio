import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { HeaderIconButton } from '@/components/layout/HeaderIconButton';
import { BackArrowIcon } from '@/assets/icons/back-arrow-icon';
import { Toggle } from '@/components/Toggle';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { authenticatedClient } from '@/utils/api';
import { updatePrivacySettingsCache, type PrivacySettings } from '@/hooks/usePrivacySettings';

const IconComponent = Ionicons as typeof Ionicons;

export default function OnlineStatusScreen() {
    const { t } = useTranslation();
    const theme = useTheme();

    const [settings, setSettings] = useState<PrivacySettings>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const response = await authenticatedClient.get<{ data?: { privacy?: PrivacySettings } }>('/profile/settings/me');
                if (!mounted) return;
                setSettings(response.data?.privacy || {});
            } catch (error) {
                console.warn('Error loading online status setting:', error);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, []);

    const toggleOnlineStatus = async (value: boolean) => {
        if (saving) return;
        const previous = settings;
        const next = { ...settings, showOnlineStatus: value };
        setSettings(next);
        setSaving(true);
        try {
            await authenticatedClient.put('/profile/settings', { privacy: next });
            await updatePrivacySettingsCache(next);
        } catch (error) {
            console.warn('Error updating online status setting:', error);
            setSettings(previous);
        } finally {
            setSaving(false);
        }
    };

    return (
        <ThemedView className="flex-1">
            <Header
                options={{
                    title: t('settings.privacy.onlineStatus'),
                    leftComponents: [
                        <HeaderIconButton key="back" onPress={() => router.back()}>
                            <BackArrowIcon size={20} color={theme.colors.text} />
                        </HeaderIconButton>,
                    ],
                }}
                hideBottomBorder={true}
                disableSticky={true}
            />

            {loading ? (
                <View className="flex-1 justify-center items-center">
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <ScrollView
                    className="flex-1"
                    contentContainerClassName="px-4 pt-5 pb-6"
                    showsVerticalScrollIndicator={false}
                >
                    <View
                        className="rounded-2xl border overflow-hidden"
                        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}
                    >
                        <View className="flex-row items-center justify-between px-4 py-4">
                            <View className="flex-row items-center flex-1 pr-3">
                                <View className="mr-3 items-center justify-center">
                                    <IconComponent name="ellipse" size={20} color={theme.colors.text} />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-base font-medium" style={{ color: theme.colors.text }}>
                                        {t('settings.privacy.showOnlineStatus')}
                                    </Text>
                                    <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.textSecondary }}>
                                        {t('settings.privacy.showOnlineStatusDesc')}
                                    </Text>
                                </View>
                            </View>
                            <Toggle value={settings.showOnlineStatus ?? true} onValueChange={toggleOnlineStatus} />
                        </View>
                    </View>
                </ScrollView>
            )}
        </ThemedView>
    );
}
