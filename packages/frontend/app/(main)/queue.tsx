import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { EmptyState } from '@/components/shared/EmptyState';

export default function QueueScreen() {
  return (
    <ThemedView style={styles.container}>
      <Header options={{ title: "Queue" }} />
      <View style={styles.content}>
        <EmptyState
          title="Your Queue"
          subtitle="View and manage your scheduled posts in a calendar view"
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
