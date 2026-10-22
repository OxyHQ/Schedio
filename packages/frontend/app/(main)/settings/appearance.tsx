import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { Header } from '@/components/layout/Header';
import { HeaderIconButton } from '@/components/layout/HeaderIconButton';
import { BackArrowIcon } from '@/assets/icons/back-arrow-icon';
import { router } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/hooks/useTheme';
import { LogoIcon } from '@/assets/logo';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@oxy.so/bloom/select';
import { toast } from '@oxy.so/bloom/toast';
import { COLOR_PRESET_REGISTRY } from '@oxy.so/bloom/theme';
import { useAccountColorSave } from '@oxy.so/services/ui/client';
import { SPACING, SPACING_CLASSES } from '@/constants/spacing';

// App icon options (visual only for now)
const APP_ICONS = [
  { id: 'default', label: 'Default', bgColor: '#1D9BF0', logoColor: '#FFFFFF' },
  { id: 'default-x', label: 'Default X', bgColor: '#000000', logoColor: '#FFFFFF' },
  { id: 'classic', label: 'Classic', bgColor: '#21C063', logoColor: '#FFFFFF' },
  { id: 'classic-x', label: 'Classic X', bgColor: '#718096', logoColor: '#FFFFFF' },
];

export default function AppearanceSettingsScreen() {
  const mySettings = useAppearanceStore((state) => state.mySettings);
  const loadMySettings = useAppearanceStore((state) => state.loadMySettings);
  const updateMySettings = useAppearanceStore((state) => state.updateMySettings);
  const theme = useTheme();
  const { t } = useTranslation();
  const { colors: allowedColors, value: colorValue, saveColor } = useAccountColorSave();
  const colors = COLOR_PRESET_REGISTRY.filter(({ name }) => allowedColors.includes(name)).map(
    ({ name, displayName }) => ({ value: name, label: displayName }),
  );

  const [selectedThemeMode, setSelectedThemeMode] = useState<'light' | 'dark' | 'system'>('system');
  const [selectedIconId, setSelectedIconId] = useState('default');
  const [autoNightMode, setAutoNightMode] = useState(false);

  useEffect(() => {
    loadMySettings();
  }, [loadMySettings]);

  // Derive the selected mode from current settings
  useEffect(() => {
    if (mySettings) {
      const mode = mySettings.appearance?.themeMode || 'system';
      setSelectedThemeMode(mode);
    }
  }, [mySettings]);

  const onSelectThemeMode = useCallback(
    async (mode: 'light' | 'dark' | 'system') => {
      setSelectedThemeMode(mode);
      await updateMySettings({
        appearance: { themeMode: mode },
      });
    },
    [updateMySettings],
  );

  return (
    <ThemedView className="flex-1">
      <Header
        options={{
          title: 'Appearance',
          leftComponents: [
            <HeaderIconButton key="back" onPress={() => router.back()}>
              <BackArrowIcon size={20} color={theme.colors.text} />
            </HeaderIconButton>,
          ],
        }}
        hideBottomBorder={true}
        disableSticky={true}
      />
      <ScrollView className={SPACING_CLASSES.screen} showsVerticalScrollIndicator={false}>
        {/* THEME MODE */}
        <Text
          className={SPACING_CLASSES.sectionTitle}
          style={{ color: theme.colors.textSecondary }}
        >
          THEME MODE
        </Text>
        <View className={`flex-row gap-${SPACING.content.gap} mb-${SPACING.content.gapLarge}`}>
          {(['light', 'dark', 'system'] as const).map((mode) => {
            const isSelected = selectedThemeMode === mode;
            const modeLabels = { light: 'Light', dark: 'Dark', system: 'System' };
            return (
              <TouchableOpacity
                key={mode}
                className={`flex-1 py-${SPACING.item.gap} px-${SPACING.item.paddingHorizontal} rounded-xl border items-center justify-center`}
                style={{
                  backgroundColor: isSelected ? theme.colors.primary : theme.colors.card,
                  borderColor: theme.colors.border,
                }}
                onPress={() => onSelectThemeMode(mode)}
                activeOpacity={0.8}
              >
                <Text
                  className="text-[15px]"
                  style={{
                    color: isSelected ? '#FFFFFF' : theme.colors.text,
                    fontWeight: isSelected ? '600' : '400',
                  }}
                >
                  {modeLabels[mode]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ACCENT COLOR: the Oxy account colour */}
        <Text
          className={`${SPACING_CLASSES.sectionTitle} ${SPACING_CLASSES.sectionGap}`}
          style={{ color: theme.colors.textSecondary }}
        >
          {t('settings.accentColor.title')}
        </Text>
        <View className={`mb-${SPACING.content.gapLarge}`}>
          <Select
            value={colorValue}
            onValueChange={(value) => {
              const next = colors.find((option) => option.value === value);
              if (next)
                saveColor(next.value).catch(() =>
                  toast.error(t('settings.accentColor.saveFailed')),
                );
            }}
          >
            <SelectTrigger label={t('settings.accentColor.title')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              items={colors}
              renderItem={(item) => (
                <SelectItem value={item.value} label={item.label}>
                  <SelectItemText>{item.label}</SelectItemText>
                </SelectItem>
              )}
            />
          </Select>
        </View>

        {/* Auto-Night Mode */}
        <View
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}
        >
          <View
            className={`flex-row items-center justify-between ${SPACING_CLASSES.listItem} pt-${SPACING.item.paddingHorizontal} pb-${SPACING.item.paddingHorizontal}`}
          >
            <Text className="text-base" style={{ color: theme.colors.text }}>
              Auto-Night Mode
            </Text>
            <Switch
              value={autoNightMode}
              onValueChange={setAutoNightMode}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.colors.border}
            />
          </View>
        </View>

        {/* APP ICON */}
        <Text
          className={`${SPACING_CLASSES.sectionTitle} ${SPACING_CLASSES.sectionGap}`}
          style={{ color: theme.colors.textSecondary }}
        >
          APP ICON
        </Text>
        <View className={`flex-row gap-${SPACING.item.paddingHorizontal} py-1`}>
          {APP_ICONS.map((appIcon) => {
            const isSelected = selectedIconId === appIcon.id;
            return (
              <TouchableOpacity
                key={appIcon.id}
                className="items-center"
                onPress={() => setSelectedIconId(appIcon.id)}
                activeOpacity={0.8}
              >
                <View
                  className="w-16 h-16 rounded-2xl items-center justify-center"
                  style={{
                    backgroundColor: appIcon.bgColor,
                    borderColor: isSelected ? theme.colors.primary : 'transparent',
                    borderWidth: isSelected ? 2.5 : 0,
                  }}
                >
                  <LogoIcon size={28} color={appIcon.logoColor} />
                </View>
                <Text
                  className="text-xs mt-1.5"
                  style={{
                    color: isSelected ? theme.colors.primary : theme.colors.textSecondary,
                    fontWeight: isSelected ? '600' : '400',
                  }}
                >
                  {appIcon.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </ThemedView>
  );
}
