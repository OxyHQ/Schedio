import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { HeaderIconButton } from '@/components/layout/HeaderIconButton';
import { BackArrowIcon } from '@/assets/icons/back-arrow-icon';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { useOxy } from '@oxyhq/services';
import Avatar from '@/components/Avatar';
import { authenticatedClient } from '@/utils/api';
import { updatePrivacySettingsCache, type PrivacySettings } from '@/hooks/usePrivacySettings';

const IconComponent = Ionicons as typeof Ionicons;

interface ProfileSummary {
    id: string;
    username: string;
    name?: { displayName?: string };
    avatar?: string | null;
}

export default function RestrictedScreen() {
    const { t } = useTranslation();
    const theme = useTheme();
    const { oxyServices, user } = useOxy();

    const [settings, setSettings] = useState<PrivacySettings>({});
    const [profiles, setProfiles] = useState<Record<string, ProfileSummary>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState<ProfileSummary[]>([]);
    const [searching, setSearching] = useState(false);

    const restrictedIds = useMemo(() => settings.restrictedUsers ?? [], [settings.restrictedUsers]);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const response = await authenticatedClient.get<{ data?: { privacy?: PrivacySettings } }>('/profile/settings/me');
                if (!mounted) return;
                const privacy = response.data?.privacy || {};
                setSettings(privacy);
                const ids = privacy.restrictedUsers ?? [];
                if (ids.length > 0) {
                    const resolved = await Promise.all(
                        ids.map(async (id): Promise<ProfileSummary | null> => {
                            try {
                                return await oxyServices.getUserById(id);
                            } catch (error) {
                                console.warn('Could not resolve restricted user:', id, error);
                                return null;
                            }
                        })
                    );
                    if (!mounted) return;
                    const map: Record<string, ProfileSummary> = {};
                    resolved.forEach((p) => { if (p) map[p.id] = p; });
                    setProfiles(map);
                }
            } catch (error) {
                console.warn('Error loading restricted users:', error);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [oxyServices]);

    useEffect(() => {
        const term = search.trim();
        if (!term) {
            setSearchResults([]);
            return;
        }
        let cancelled = false;
        const handle = setTimeout(async () => {
            setSearching(true);
            try {
                const response = await oxyServices.searchProfiles(term, { limit: 10 });
                if (cancelled) return;
                setSearchResults(response.data ?? []);
            } catch (error) {
                if (cancelled) return;
                console.warn('Error searching users to restrict:', error);
                setSearchResults([]);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 300);
        return () => { cancelled = true; clearTimeout(handle); };
    }, [search, oxyServices]);

    const persist = async (ids: string[]) => {
        const previous = settings;
        const next = { ...settings, restrictedUsers: ids };
        setSettings(next);
        setSaving(true);
        try {
            await authenticatedClient.put('/profile/settings', { privacy: next });
            await updatePrivacySettingsCache(next);
        } catch (error) {
            console.warn('Error updating restricted users:', error);
            setSettings(previous);
        } finally {
            setSaving(false);
        }
    };

    const restrictUser = (profile: ProfileSummary) => {
        if (saving) return;
        if (user?.id && profile.id === user.id) return;
        if (restrictedIds.includes(profile.id)) return;
        setProfiles((prev) => ({ ...prev, [profile.id]: profile }));
        setSearch('');
        setSearchResults([]);
        persist([...restrictedIds, profile.id]);
    };

    const unrestrictUser = (id: string) => {
        if (saving) return;
        persist(restrictedIds.filter((u) => u !== id));
    };

    return (
        <ThemedView className="flex-1">
            <Header
                options={{
                    title: t('settings.privacy.restrictedUsers'),
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
                    keyboardShouldPersistTaps="handled"
                >
                    <Text className="text-[13px] mb-4 ml-1" style={{ color: theme.colors.textSecondary }}>
                        {t('settings.privacy.restrictedUsersDescription')}
                    </Text>

                    <View
                        className="flex-row items-center rounded-2xl border px-4 mb-5"
                        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}
                    >
                        <IconComponent name="search" size={18} color={theme.colors.textSecondary} />
                        <TextInput
                            className="flex-1 text-base py-3 ml-3"
                            style={{ color: theme.colors.text }}
                            placeholder={t('settings.privacy.searchUsersToRestrict')}
                            placeholderTextColor={theme.colors.textSecondary}
                            value={search}
                            onChangeText={setSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {searching && <ActivityIndicator size="small" color={theme.colors.textSecondary} />}
                    </View>

                    {search.trim().length > 0 ? (
                        <View
                            className="rounded-2xl border overflow-hidden"
                            style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}
                        >
                            {searchResults.length === 0 && !searching ? (
                                <Text className="text-base px-4 py-4" style={{ color: theme.colors.textSecondary }}>
                                    {t('settings.privacy.noUsersFound')}
                                </Text>
                            ) : (
                                searchResults.map((profile, index) => (
                                    <React.Fragment key={profile.id}>
                                        {index > 0 && (
                                            <View className="h-[1px] mx-4" style={{ backgroundColor: theme.colors.border }} />
                                        )}
                                        <TouchableOpacity
                                            className="flex-row items-center px-4 py-3"
                                            activeOpacity={0.7}
                                            onPress={() => restrictUser(profile)}
                                            disabled={restrictedIds.includes(profile.id)}
                                        >
                                            <Avatar
                                                source={profile.avatar ? oxyServices.getFileDownloadUrl(profile.avatar, 'thumb') : undefined}
                                                size={40}
                                            />
                                            <View className="flex-1 ml-3">
                                                <Text className="text-[15px] font-semibold" style={{ color: theme.colors.text }} numberOfLines={1}>
                                                    {profile.name?.displayName || profile.username}
                                                </Text>
                                                <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.textSecondary }} numberOfLines={1}>
                                                    @{profile.username}
                                                </Text>
                                            </View>
                                            <IconComponent
                                                name={restrictedIds.includes(profile.id) ? 'checkmark-circle' : 'add-circle'}
                                                size={24}
                                                color={restrictedIds.includes(profile.id) ? theme.colors.textTertiary : theme.colors.primary}
                                            />
                                        </TouchableOpacity>
                                    </React.Fragment>
                                ))
                            )}
                        </View>
                    ) : restrictedIds.length === 0 ? (
                        <View className="items-center justify-center py-12">
                            <IconComponent name="people-outline" size={40} color={theme.colors.textTertiary} />
                            <Text className="text-base mt-3" style={{ color: theme.colors.textSecondary }}>
                                {t('settings.privacy.noRestrictedUsers')}
                            </Text>
                        </View>
                    ) : (
                        <View
                            className="rounded-2xl border overflow-hidden"
                            style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}
                        >
                            {restrictedIds.map((id, index) => {
                                const profile = profiles[id];
                                return (
                                    <React.Fragment key={id}>
                                        {index > 0 && (
                                            <View className="h-[1px] mx-4" style={{ backgroundColor: theme.colors.border }} />
                                        )}
                                        <View className="flex-row items-center px-4 py-3">
                                            <Avatar
                                                source={profile?.avatar ? oxyServices.getFileDownloadUrl(profile.avatar, 'thumb') : undefined}
                                                size={40}
                                            />
                                            <View className="flex-1 ml-3">
                                                <Text className="text-[15px] font-semibold" style={{ color: theme.colors.text }} numberOfLines={1}>
                                                    {profile?.name?.displayName || profile?.username || id}
                                                </Text>
                                                {profile?.username ? (
                                                    <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.textSecondary }} numberOfLines={1}>
                                                        @{profile.username}
                                                    </Text>
                                                ) : null}
                                            </View>
                                            <TouchableOpacity
                                                className="px-3 py-1.5 rounded-full border"
                                                style={{ borderColor: theme.colors.border }}
                                                onPress={() => unrestrictUser(id)}
                                                disabled={saving}
                                            >
                                                <Text className="text-[13px] font-semibold" style={{ color: theme.colors.text }}>
                                                    {t('settings.privacy.unrestrict')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </React.Fragment>
                                );
                            })}
                        </View>
                    )}
                </ScrollView>
            )}
        </ThemedView>
    );
}
