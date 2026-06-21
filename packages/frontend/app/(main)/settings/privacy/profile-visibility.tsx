import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { HeaderIconButton } from '@/components/layout/HeaderIconButton';
import { BackArrowIcon } from '@/assets/icons/back-arrow-icon';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { authenticatedClient } from '@/utils/api';
import { updatePrivacySettingsCache, type PrivacySettings } from '@/hooks/usePrivacySettings';

const IconComponent = Ionicons as typeof Ionicons;

type Visibility = NonNullable<PrivacySettings['profileVisibility']>;

const VISIBILITY_OPTIONS: { value: Visibility; labelKey: string; descKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: 'public', labelKey: 'settings.privacy.public', descKey: 'settings.privacy.publicDescription', icon: 'globe' },
    { value: 'followers_only', labelKey: 'settings.privacy.followersOnly', descKey: 'settings.privacy.followersOnlyDescription', icon: 'people' },
    { value: 'private', labelKey: 'settings.privacy.private', descKey: 'settings.privacy.privateDescription', icon: 'lock-closed' },
];

export default function ProfileVisibilityScreen() {
    const { t } = useTranslation();
    const theme = useTheme();

    const [settings, setSettings] = useState<PrivacySettings>({ profileVisibility: 'public' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const response = await authenticatedClient.get<{ data?: { privacy?: PrivacySettings } }>('/profile/settings/me');
                if (!mounted) return;
                setSettings(response.data?.privacy || { profileVisibility: 'public' });
            } catch (error) {
                console.warn('Error loading profile visibility:', error);
                if (mounted) setSettings({ profileVisibility: 'public' });
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, []);

    const selectVisibility = async (value: Visibility) => {
        if (saving || settings.profileVisibility === value) return;
        const previous = settings;
        const next = { ...settings, profileVisibility: value };
        setSettings(next);
        setSaving(true);
        try {
            await authenticatedClient.put('/profile/settings', { privacy: next });
            await updatePrivacySettingsCache(next);
        } catch (error) {
            console.warn('Error updating profile visibility:', error);
            setSettings(previous);
        } finally {
            setSaving(false);
        }
    };

    return (
        <ThemedView className="flex-1">
            <Header
                options={{
                    title: t('settings.privacy.privateProfile'),
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
                        {VISIBILITY_OPTIONS.map((option, index) => {
                            const isSelected = (settings.profileVisibility || 'public') === option.value;
                            return (
                                <React.Fragment key={option.value}>
                                    {index > 0 && (
                                        <View className="h-[1px] mx-4" style={{ backgroundColor: theme.colors.border }} />
                                    )}
                                    <TouchableOpacity
                                        className="flex-row items-center justify-between px-4 py-4"
                                        onPress={() => selectVisibility(option.value)}
                                        activeOpacity={0.7}
                                    >
                                        <View className="flex-row items-center flex-1">
                                            <View className="mr-3 items-center justify-center">
                                                <IconComponent name={option.icon} size={20} color={theme.colors.text} />
                                            </View>
                                            <View className="flex-1 pr-3">
                                                <Text className="text-base font-medium" style={{ color: theme.colors.text }}>
                                                    {t(option.labelKey)}
                                                </Text>
                                                <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.textSecondary }}>
                                                    {t(option.descKey)}
                                                </Text>
                                            </View>
                                        </View>
                                        {isSelected && (
                                            <IconComponent name="checkmark" size={20} color={theme.colors.primary} />
                                        )}
                                    </TouchableOpacity>
                                </React.Fragment>
                            );
                        })}
                    </View>
                </ScrollView>
            )}
        </ThemedView>
    );
}
