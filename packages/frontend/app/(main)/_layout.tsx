import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { ThemedView } from '@/components/ThemedView';

export default function MainLayout() {
  const theme = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
  }), [theme.colors.background]);

  return (
    <ThemedView style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="compose" />
        <Stack.Screen name="queue" />
        <Stack.Screen name="analytics" />
        <Stack.Screen name="accounts" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/appearance" />
        <Stack.Screen name="settings/language" />
        <Stack.Screen name="settings/privacy/index" />
        <Stack.Screen name="settings/privacy/profile-visibility" />
        <Stack.Screen name="settings/privacy/tags-allos" />
        <Stack.Screen name="settings/privacy/online-status" />
        <Stack.Screen name="settings/privacy/restricted" />
        <Stack.Screen name="settings/privacy/blocked" />
        <Stack.Screen name="settings/privacy/hidden-words" />
        <Stack.Screen name="settings/privacy/hide-counts" />
        <Stack.Screen name="settings/profile-customization" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="search/[query]" />
        <Stack.Screen name="search/advanced" />
        <Stack.Screen name="@[username]" />
      </Stack>
    </ThemedView>
  );
}
