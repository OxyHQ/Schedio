import { useEffect, useState } from 'react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { Account, Post } from '@schedio/sdk';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { Workspace } from '@/components/publishing/Workspace';
import { publishingError, schedio, usePublishingWorkspace } from '@/lib/publishing';
export default function ComposeScreen() {
  const { organizationId, select } = usePublishingWorkspace();
  const params = useLocalSearchParams<{ id?: string }>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [content, setContent] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [post, setPost] = useState<Post | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (params.id) return;
    let active = true;
    setPost(null);
    setPlatforms([]);
    setContent('');
    void schedio
      .listAccounts(organizationId)
      .then((result) => {
        if (active) setAccounts(result.items);
      })
      .catch((e) => setMessage(publishingError(e)));
    return () => {
      active = false;
    };
  }, [organizationId, params.id]);
  useEffect(() => {
    if (!params.id) return;
    let active = true;
    setPost(null);
    setContent('');
    setPlatforms([]);
    setAccounts([]);
    setMessage('');
    void schedio
      .getPost(params.id)
      .then(async (p) => {
        const destinations = await schedio.listAccounts(p.organizationId ?? undefined);
        if (active) {
          select(p.organizationId ?? undefined);
          setAccounts(destinations.items);
          setPost(p);
          setContent(p.content);
          setPlatforms(p.platforms);
        }
      })
      .catch((e) => {
        if (active) setMessage(publishingError(e));
      });
    return () => {
      active = false;
    };
  }, [params.id, select]);
  async function save(action: 'draft' | 'publish' | 'schedule') {
    if (params.id && !post) return;
    setBusy(true);
    setMessage('');
    try {
      const saved = post
        ? await schedio.editDraft(post.id, { content, platforms, revision: post.revision })
        : await schedio.createDraft({
            content,
            platforms,
            ...(organizationId ? { organizationId } : {}),
          });
      setPost(saved);
      if (action === 'publish') {
        setPost(await schedio.publish(saved.id, saved.revision));
        setMessage('Queued for publishing. Check each destination in Queue.');
      } else if (action === 'schedule') {
        setPost(
          await schedio.schedule(saved.id, saved.revision, new Date(scheduledAt).toISOString()),
        );
        setMessage('Post scheduled.');
      } else setMessage('Draft saved for review. Content or destination edits clear approval.');
    } catch (e) {
      setMessage(publishingError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ThemedView style={{ flex: 1 }}>
      <Header options={{ title: 'Compose' }} />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 16,
          maxWidth: 760,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {params.id ? (
          <Text>
            Reviewing {post?.organizationId ? `organization ${post.organizationId}` : 'personal'}{' '}
            draft
          </Text>
        ) : (
          <Workspace />
        )}
        <TextInput
          accessibilityLabel="Post content"
          multiline
          value={content}
          onChangeText={setContent}
          placeholder="Write your post"
          style={{ borderWidth: 1, minHeight: 160, padding: 12 }}
        />
        <Text>Destinations</Text>
        {accounts.length === 0 && (
          <Text>Load your Mention destination or connect Mastodon in Accounts.</Text>
        )}
        {accounts.map((a) => (
          <Button
            key={a.id}
            title={`${platforms.includes(a.id) ? '✓ ' : ''}${a.platform}: @${a.platformUsername}`}
            onPress={() =>
              setPlatforms((current) =>
                current.includes(a.id) ? current.filter((id) => id !== a.id) : [...current, a.id],
              )
            }
          />
        ))}
        <View style={{ gap: 10 }}>
          <Button
            title="Save draft for review"
            disabled={busy || (!!params.id && !post)}
            onPress={() => void save('draft')}
          />
          <Button
            title="Publish now"
            disabled={busy || (!!params.id && !post)}
            onPress={() => void save('publish')}
          />
          <TextInput
            accessibilityLabel="Scheduled date and time"
            value={scheduledAt}
            onChangeText={setScheduledAt}
            placeholder="2026-10-20T14:30:00+03:00"
            style={{ borderWidth: 1, padding: 12 }}
          />
          <Text>Include a timezone. The queue shows your local time.</Text>
          <Button
            title="Schedule"
            disabled={busy || (!!params.id && !post)}
            onPress={() => void save('schedule')}
          />
        </View>
        {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
      </ScrollView>
    </ThemedView>
  );
}
