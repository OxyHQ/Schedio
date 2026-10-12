import { StyleSheet, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { EmptyState } from '@/components/shared/EmptyState';

export default function DashboardScreen() {
  return (
    <ThemedView style={styles.container}>
      <Header options={{ title: 'Dashboard' }} />
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
