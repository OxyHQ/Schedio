import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { EmptyState } from '@/components/shared/EmptyState';

export default function AccountsScreen() {
  return (
    <ThemedView style={styles.container}>
      <Header options={{ title: "Accounts" }} />
      <View style={styles.content}>
        <EmptyState
          title="Social Accounts"
          subtitle="Connect your social media accounts to start scheduling posts"
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
