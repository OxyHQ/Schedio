import React, { useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { HeaderIconButton } from '@/components/layout/HeaderIconButton';
import { BackArrowIcon } from '@/assets/icons/back-arrow-icon';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { useOxy } from '@oxyhq/services';
import Avatar from '@/components/Avatar';
import { useProfileData } from '@/hooks/useProfileData';

const IconComponent = Ionicons as typeof Ionicons;

interface ProfileName {
    displayName?: string;
}

interface ProfileCounts {
    followers?: number;
    following?: number;
}

export default function ProfileScreen() {
    const { t } = useTranslation();
    const theme = useTheme();
    const { oxyServices } = useOxy();
    const { username: rawUsername } = useLocalSearchParams<{ username: string }>();

    const username = useMemo(() => (rawUsername || '').replace(/^@/, ''), [rawUsername]);
    const { data, loading } = useProfileData(username);

    const name = data?.name as ProfileName | string | undefined;
    const displayName = (typeof name === 'object' ? name?.displayName : undefined)
        || data?.design.displayName
        || data?.username
        || username;

    const counts = data?._count as ProfileCounts | undefined;
    const avatarUri = data?.avatar ? oxyServices.getFileDownloadUrl(data.avatar, 'full') : undefined;

    return (
        <ThemedView className="flex-1">
            <Header
                options={{
                    title: data?.username ? `@${data.username}` : (username ? `@${username}` : t('Profile')),
                    leftComponents: [
                        <HeaderIconButton key="back" onPress={() => router.back()}>
                            <BackArrowIcon size={20} color={theme.colors.text} />
                        </HeaderIconButton>,
                    ],
                }}
                hideBottomBorder={true}
                disableSticky={true}
            />

            {loading && !data ? (
                <View className="flex-1 justify-center items-center">
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : !data ? (
                <View className="flex-1 justify-center items-center px-8">
                    <IconComponent name="person-outline" size={44} color={theme.colors.textTertiary} />
                    <Text className="text-base mt-3 text-center" style={{ color: theme.colors.textSecondary }}>
                        {`${t('No results found for')} @${username}`}
                    </Text>
                </View>
            ) : (
                <ScrollView
                    className="flex-1"
                    contentContainerClassName="px-4 pt-6 pb-8"
                    showsVerticalScrollIndicator={false}
                >
                    <View className="items-center">
                        <Avatar source={avatarUri} size={96} verified={data.verified} />
                        <Text className="text-xl font-bold mt-4" style={{ color: theme.colors.text }} numberOfLines={1}>
                            {displayName}
                        </Text>
                        <Text className="text-sm mt-1" style={{ color: theme.colors.textSecondary }} numberOfLines={1}>
                            @{data.username}
                        </Text>

                        {data.bio ? (
                            <Text className="text-[15px] mt-4 text-center leading-5" style={{ color: theme.colors.text }}>
                                {data.bio}
                            </Text>
                        ) : null}

                        <View className="flex-row mt-5 gap-8">
                            <View className="items-center">
                                <Text className="text-base font-bold" style={{ color: theme.colors.text }}>
                                    {counts?.following ?? 0}
                                </Text>
                                <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.textSecondary }}>
                                    {t('Following')}
                                </Text>
                            </View>
                            <View className="items-center">
                                <Text className="text-base font-bold" style={{ color: theme.colors.text }}>
                                    {counts?.followers ?? 0}
                                </Text>
                                <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.textSecondary }}>
                                    {t('Follow')}
                                </Text>
                            </View>
                        </View>
                    </View>
                </ScrollView>
            )}
        </ThemedView>
    );
}
