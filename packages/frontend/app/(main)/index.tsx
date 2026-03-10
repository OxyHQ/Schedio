import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Header } from '@/components/layout/Header';
import { useTheme } from '@/hooks/useTheme';
import { EmptyState } from '@/components/shared/EmptyState';

export default function DashboardScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <Header options={{ title: "Dashboard" }} />
      <View style={styles.content}>
        <EmptyState
          title="Welcome to Schedio"
          subtitle="Schedule and manage your social media posts across all platforms"
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
