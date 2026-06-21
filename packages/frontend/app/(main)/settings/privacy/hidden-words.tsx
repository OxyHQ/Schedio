import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
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

export default function HiddenWordsScreen() {
    const { t } = useTranslation();
    const theme = useTheme();

    const [settings, setSettings] = useState<PrivacySettings>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState('');

    const hiddenWords = settings.hiddenWords ?? [];

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const response = await authenticatedClient.get<{ data?: { privacy?: PrivacySettings } }>('/profile/settings/me');
                if (!mounted) return;
                setSettings(response.data?.privacy || {});
            } catch (error) {
                console.warn('Error loading hidden words:', error);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, []);

    const persist = async (words: string[]) => {
        const previous = settings;
        const next = { ...settings, hiddenWords: words };
        setSettings(next);
        setSaving(true);
        try {
            await authenticatedClient.put('/profile/settings', { privacy: next });
            await updatePrivacySettingsCache(next);
        } catch (error) {
            console.warn('Error updating hidden words:', error);
            setSettings(previous);
        } finally {
            setSaving(false);
        }
    };

    const addWord = () => {
        const word = draft.trim().toLowerCase();
        if (!word || saving) return;
        if (hiddenWords.some((w) => w.toLowerCase() === word)) {
            setDraft('');
            return;
        }
        setDraft('');
        persist([...hiddenWords, word]);
    };

    const removeWord = (word: string) => {
        if (saving) return;
        persist(hiddenWords.filter((w) => w !== word));
    };

    return (
        <ThemedView className="flex-1">
            <Header
                options={{
                    title: t('settings.privacy.hiddenWords'),
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
                    <View
                        className="flex-row items-center rounded-2xl border px-4 mb-5"
                        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}
                    >
                        <TextInput
                            className="flex-1 text-base py-3"
                            style={{ color: theme.colors.text }}
                            placeholder={t('settings.privacy.hiddenWords')}
                            placeholderTextColor={theme.colors.textSecondary}
                            value={draft}
                            onChangeText={setDraft}
                            onSubmitEditing={addWord}
                            returnKeyType="done"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity
                            className="ml-2 items-center justify-center"
                            onPress={addWord}
                            disabled={!draft.trim() || saving}
                        >
                            <IconComponent
                                name="add-circle"
                                size={28}
                                color={draft.trim() ? theme.colors.primary : theme.colors.textTertiary}
                            />
                        </TouchableOpacity>
                    </View>

                    {hiddenWords.length === 0 ? (
                        <View className="items-center justify-center py-12">
                            <IconComponent name="eye-off-outline" size={40} color={theme.colors.textTertiary} />
                            <Text className="text-base mt-3" style={{ color: theme.colors.textSecondary }}>
                                {t('settings.privacy.hiddenWords')}
                            </Text>
                        </View>
                    ) : (
                        <View
                            className="rounded-2xl border overflow-hidden"
                            style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}
                        >
                            {hiddenWords.map((word, index) => (
                                <React.Fragment key={word}>
                                    {index > 0 && (
                                        <View className="h-[1px] mx-4" style={{ backgroundColor: theme.colors.border }} />
                                    )}
                                    <View className="flex-row items-center justify-between px-4 py-3.5">
                                        <Text className="text-base flex-1 pr-3" style={{ color: theme.colors.text }}>
                                            {word}
                                        </Text>
                                        <TouchableOpacity onPress={() => removeWord(word)} disabled={saving}>
                                            <IconComponent name="close-circle" size={22} color={theme.colors.textTertiary} />
                                        </TouchableOpacity>
                                    </View>
                                </React.Fragment>
                            ))}
                        </View>
                    )}
                </ScrollView>
            )}
        </ThemedView>
    );
}
