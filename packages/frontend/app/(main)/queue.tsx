import { useCallback, useEffect, useState } from 'react';
import { Button, Linking, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Post } from '@schedio/sdk';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { Workspace } from '@/components/publishing/Workspace';
import { publishingError, schedio, usePublishingWorkspace } from '@/lib/publishing';
export default function QueueScreen() {
  const { organizationId } = usePublishingWorkspace();
  const [posts, setPosts] = useState<Post[]>([]);
  const [order, setOrder] = useState<Post[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const reload = useCallback(async () => {
    const [all, queue] = await Promise.all([
      (async () => {
        const items: Post[] = [];
        for await (const post of schedio.iteratePosts(organizationId)) items.push(post);
        return { items };
      })(),
      schedio.queue(organizationId),
    ]);
    setPosts(all.items);
    setOrder(queue.items);
  }, [organizationId]);
  useEffect(() => {
    void reload().catch((e) => setMessage(publishingError(e)));
    const timer = setInterval(() => void reload().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [reload]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setMessage('');
    try {
      await work();
      await reload();
    } catch (e) {
      setMessage(publishingError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ThemedView style={{ flex: 1 }}>
      <Header options={{ title: 'Queue' }} />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 16,
          maxWidth: 760,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <Workspace />
        <Text>Scheduled order</Text>
        {order.length === 0 && <Text>No scheduled posts.</Text>}
        {order.map((post, index) => (
          <View key={post.id} style={{ gap: 8, padding: 12, borderWidth: 1 }}>
            <Text>{post.content}</Text>
            <Text>{post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : ''}</Text>
            <Button
              title="Move earlier"
              disabled={busy || index === 0}
              onPress={() =>
                void action(() => {
                  const ids = order.map((p) => p.id);
                  [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                  return schedio.reorder(ids, organizationId);
                })
              }
            />
          </View>
        ))}
        <Text>Drafts and delivery results</Text>
        {posts.map((post) => (
          <View key={post.id} style={{ gap: 8, padding: 12, borderWidth: 1 }}>
            <Text>{post.content}</Text>
            <Text>
              {post.status} · Revision {post.revision} ·{' '}
              {post.approvedRevision === post.revision ? 'Approved' : 'Unapproved'}
            </Text>
            {post.deliveries.map((d) => (
              <View key={d.accountId}>
                <Text>
                  {d.platform}: {d.status}
                  {d.error ? ` — ${d.error}` : ''}
                </Text>
                {d.url && (
                  <Button
                    title="Open published post"
                    onPress={() => void Linking.openURL(d.url ?? '')}
                  />
                )}
              </View>
            ))}
            {post.deliveries.every((d) => d.attempts === 0) && (
              <Button
                title="Edit draft"
                disabled={busy}
                onPress={() => router.push({ pathname: '/compose', params: { id: post.id } })}
              />
            )}{' '}
            {organizationId && post.approvedRevision !== post.revision && (
              <Button
                title="Approve this revision"
                disabled={busy}
                onPress={() => void action(() => schedio.approve(post.id, post.revision))}
              />
            )}{' '}
            {post.status !== 'published' && (
              <Button
                title={post.status === 'failed' ? 'Retry unfinished destinations' : 'Publish now'}
                disabled={busy}
                onPress={() => void action(() => schedio.publish(post.id, post.revision))}
              />
            )}
          </View>
        ))}
        {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
      </ScrollView>
    </ThemedView>
  );
}
