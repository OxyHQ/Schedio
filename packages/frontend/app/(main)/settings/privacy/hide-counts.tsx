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

type CountField = 'hideLikeCounts' | 'hideShareCounts' | 'hideReplyCounts' | 'hideSaveCounts';

const COUNT_FIELDS: { field: CountField; labelKey: string; descKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { field: 'hideLikeCounts', labelKey: 'settings.privacy.hideLikeCounts', descKey: 'settings.privacy.hideLikeCountsDesc', icon: 'heart-outline' },
    { field: 'hideShareCounts', labelKey: 'settings.privacy.hideShareCounts', descKey: 'settings.privacy.hideShareCountsDesc', icon: 'repeat-outline' },
    { field: 'hideReplyCounts', labelKey: 'settings.privacy.hideReplyCounts', descKey: 'settings.privacy.hideReplyCountsDesc', icon: 'chatbubble-outline' },
    { field: 'hideSaveCounts', labelKey: 'settings.privacy.hideSaveCounts', descKey: 'settings.privacy.hideSaveCountsDesc', icon: 'bookmark-outline' },
];

export default function HideCountsScreen() {
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
                console.warn('Error loading count settings:', error);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, []);

    const allHidden = COUNT_FIELDS.every((c) => settings[c.field] === true);

    const persist = async (next: PrivacySettings, previous: PrivacySettings) => {
        setSettings(next);
        setSaving(true);
        try {
            await authenticatedClient.put('/profile/settings', { privacy: next });
            await updatePrivacySettingsCache(next);
        } catch (error) {
            console.warn('Error updating count settings:', error);
            setSettings(previous);
        } finally {
            setSaving(false);
        }
    };

    const toggleAll = (value: boolean) => {
        if (saving) return;
        const next: PrivacySettings = { ...settings };
        COUNT_FIELDS.forEach((c) => { next[c.field] = value; });
        persist(next, settings);
    };

    const toggleField = (field: CountField, value: boolean) => {
        if (saving) return;
        persist({ ...settings, [field]: value }, settings);
    };

    return (
        <ThemedView className="flex-1">
            <Header
                options={{
                    title: t('settings.privacy.hideLikeShareCounts'),
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
                        className="rounded-2xl border overflow-hidden mb-6"
                        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}
                    >
                        <View className="flex-row items-center justify-between px-4 py-4">
                            <View className="flex-row items-center flex-1 pr-3">
                                <View className="mr-3 items-center justify-center">
                                    <IconComponent name="eye-off" size={20} color={theme.colors.text} />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-base font-medium" style={{ color: theme.colors.text }}>
                                        {t('settings.privacy.hideAllCounts')}
                                    </Text>
                                    <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.textSecondary }}>
                                        {t('settings.privacy.hideAllCountsDesc')}
                                    </Text>
                                </View>
                            </View>
                            <Toggle value={allHidden} onValueChange={toggleAll} />
                        </View>
                    </View>

                    <Text className="text-[13px] font-semibold uppercase mb-2 ml-1" style={{ color: theme.colors.textSecondary }}>
                        {t('settings.privacy.individualSettings')}
                    </Text>

                    <View
                        className="rounded-2xl border overflow-hidden"
                        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}
                    >
                        {COUNT_FIELDS.map((count, index) => (
                            <React.Fragment key={count.field}>
                                {index > 0 && (
                                    <View className="h-[1px] mx-4" style={{ backgroundColor: theme.colors.border }} />
                                )}
                                <View className="flex-row items-center justify-between px-4 py-4">
                                    <View className="flex-row items-center flex-1 pr-3">
                                        <View className="mr-3 items-center justify-center">
                                            <IconComponent name={count.icon} size={20} color={theme.colors.text} />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-base font-medium" style={{ color: theme.colors.text }}>
                                                {t(count.labelKey)}
                                            </Text>
                                            <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.textSecondary }}>
                                                {t(count.descKey)}
                                            </Text>
                                        </View>
                                    </View>
                                    <Toggle
                                        value={settings[count.field] ?? false}
                                        onValueChange={(v) => toggleField(count.field, v)}
                                    />
                                </View>
                            </React.Fragment>
                        ))}
                    </View>
                </ScrollView>
            )}
        </ThemedView>
    );
}
