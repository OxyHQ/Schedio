import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { EmptyState } from '@/components/shared/EmptyState';

export default function ComposeScreen() {
  return (
    <ThemedView style={styles.container}>
      <Header options={{ title: "Compose" }} />
      <View style={styles.content}>
        <EmptyState
          title="Create a Post"
          subtitle="Compose and schedule posts for your connected social accounts"
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
