import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { HeaderIconButton } from '@/components/layout/HeaderIconButton';
import { BackArrowIcon } from '@/assets/icons/back-arrow-icon';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { Search } from '@/assets/icons/search-icon';

const IconComponent = Ionicons as typeof Ionicons;

const FILTERS: { id: string; labelKey: string }[] = [
    { id: 'people', labelKey: 'Who to follow' },
    { id: 'latest', labelKey: 'posts' },
    { id: 'videos', labelKey: 'Videos' },
    { id: 'saved', labelKey: 'Saved' },
];

export default function AdvancedSearchScreen() {
    const { t } = useTranslation();
    const theme = useTheme();

    const [query, setQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<string[]>([]);

    const toggleFilter = (id: string) => {
        setActiveFilters((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
    };

    const runSearch = () => {
        const trimmed = query.trim();
        if (!trimmed) return;
        router.push(`/search/${encodeURIComponent(trimmed)}`);
    };

    return (
        <ThemedView className="flex-1">
            <Header
                options={{
                    title: t('Advanced Search'),
                    leftComponents: [
                        <HeaderIconButton key="back" onPress={() => router.back()}>
                            <BackArrowIcon size={20} color={theme.colors.text} />
                        </HeaderIconButton>,
                    ],
                }}
                hideBottomBorder={true}
                disableSticky={true}
            />

            <ScrollView
                className="flex-1"
                contentContainerClassName="px-4 pt-5 pb-6"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View
                    className="flex-row items-center rounded-2xl border px-4 mb-6"
                    style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}
                >
                    <Search size={20} color={theme.colors.textSecondary} />
                    <TextInput
                        className="flex-1 text-base py-3 ml-3"
                        style={{ color: theme.colors.text }}
                        placeholder={t('Search Schedio')}
                        placeholderTextColor={theme.colors.textSecondary}
                        value={query}
                        onChangeText={setQuery}
                        onSubmitEditing={runSearch}
                        returnKeyType="search"
                        autoFocus
                    />
                </View>

                <Text className="text-[13px] font-semibold uppercase mb-3 ml-1" style={{ color: theme.colors.textSecondary }}>
                    {t('Filter by')}
                </Text>

                <View className="flex-row flex-wrap gap-2 mb-8">
                    {FILTERS.map((filter) => {
                        const isActive = activeFilters.includes(filter.id);
                        return (
                            <TouchableOpacity
                                key={filter.id}
                                className="px-4 py-2 rounded-full border"
                                style={{
                                    backgroundColor: isActive ? theme.colors.primary : theme.colors.card,
                                    borderColor: isActive ? theme.colors.primary : theme.colors.border,
                                }}
                                onPress={() => toggleFilter(filter.id)}
                                activeOpacity={0.8}
                            >
                                <Text
                                    className="text-sm font-medium"
                                    style={{ color: isActive ? '#FFFFFF' : theme.colors.text }}
                                >
                                    {t(filter.labelKey)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <TouchableOpacity
                    className="flex-row items-center justify-center rounded-full py-3.5"
                    style={{ backgroundColor: query.trim() ? theme.colors.primary : theme.colors.border }}
                    onPress={runSearch}
                    disabled={!query.trim()}
                    activeOpacity={0.85}
                >
                    <IconComponent name="search" size={18} color="#FFFFFF" />
                    <Text className="text-[15px] font-semibold ml-2 text-white">
                        {t('Search')}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </ThemedView>
    );
}
