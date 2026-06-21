import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
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
import { profilesApi } from '@/utils/api';

const IconComponent = Ionicons as typeof Ionicons;

interface SearchedProfile {
    id: string;
    username: string;
    name?: { displayName?: string };
    avatar?: string | null;
    verified?: boolean;
}

interface SearchResponse {
    data?: SearchedProfile[];
}

export default function SearchResultsScreen() {
    const { t } = useTranslation();
    const theme = useTheme();
    const { oxyServices } = useOxy();
    const { query } = useLocalSearchParams<{ query: string }>();

    const decodedQuery = useMemo(() => (query ? decodeURIComponent(query) : ''), [query]);

    const [results, setResults] = useState<SearchedProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [errored, setErrored] = useState(false);

    useEffect(() => {
        if (!decodedQuery.trim()) {
            setResults([]);
            return;
        }

        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setErrored(false);
            try {
                const response: SearchResponse = await profilesApi.search(decodedQuery);
                if (cancelled) return;
                setResults(Array.isArray(response?.data) ? response.data : []);
            } catch (error) {
                if (cancelled) return;
                console.warn('Search error:', error);
                setErrored(true);
                setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [decodedQuery]);

    return (
        <ThemedView className="flex-1">
            <Header
                options={{
                    title: decodedQuery || t('Search'),
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
                <FlatList
                    data={results}
                    keyExtractor={(item) => item.id}
                    contentContainerClassName="px-4 pt-4 pb-6"
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                        <View className="items-center justify-center py-16">
                            <IconComponent name="search" size={40} color={theme.colors.textTertiary} />
                            <Text className="text-base mt-3 text-center" style={{ color: theme.colors.textSecondary }}>
                                {errored ? t('error.data.fetch_failed') : `${t('No results found for')} "${decodedQuery}"`}
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            className="flex-row items-center py-3"
                            activeOpacity={0.7}
                            onPress={() => router.push({ pathname: '/@[username]', params: { username: item.username } })}
                        >
                            <Avatar
                                source={item.avatar ? oxyServices.getFileDownloadUrl(item.avatar, 'thumb') : undefined}
                                size={44}
                                verified={item.verified}
                            />
                            <View className="flex-1 ml-3">
                                <Text className="text-[15px] font-semibold" style={{ color: theme.colors.text }} numberOfLines={1}>
                                    {item.name?.displayName || item.username}
                                </Text>
                                <Text className="text-[13px] mt-0.5" style={{ color: theme.colors.textSecondary }} numberOfLines={1}>
                                    @{item.username}
                                </Text>
                            </View>
                            <IconComponent name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                        </TouchableOpacity>
                    )}
                />
            )}
        </ThemedView>
    );
}
