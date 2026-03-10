import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { EmptyState } from '@/components/shared/EmptyState';

export default function AnalyticsScreen() {
  return (
    <ThemedView style={styles.container}>
      <Header options={{ title: "Analytics" }} />
      <View style={styles.content}>
        <EmptyState
          title="Analytics"
          subtitle="Track the performance of your posts across all platforms"
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
