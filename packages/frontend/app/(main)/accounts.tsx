import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Account } from '@schedio/sdk';
import { ThemedView } from '@/components/ThemedView';
import { Header } from '@/components/layout/Header';
import { Workspace } from '@/components/publishing/Workspace';
import { publishingError, schedio, usePublishingWorkspace } from '@/lib/publishing';
export default function AccountsScreen() {
  const { organizationId, select } = usePublishingWorkspace();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [instance, setInstance] = useState('https://mastodon.social');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const params = useLocalSearchParams<{ state?: string; code?: string; error?: string }>();
  const consumed = useRef('');
  const router = useRouter();
  const reload = useCallback(async () => {
    setAccounts((await schedio.listAccounts(organizationId)).items);
    if (organizationId) setReview((await schedio.reviewPolicy(organizationId)).required);
  }, [organizationId]);
  useEffect(() => {
    void reload().catch((e) => setMessage(publishingError(e)));
  }, [reload]);
  useEffect(() => {
    if (params.error) {
      setMessage('Authorization was cancelled.');
      return;
    }
    if (!params.state || !params.code || consumed.current === params.state) return;
    consumed.current = params.state;
    setBusy(true);
    void schedio
      .completeConnection(params.state, params.code)
      .then((account) => {
        select(account.organizationId ?? undefined);
        setMessage('Account connected.');
        router.replace('/accounts');
        if ((account.organizationId ?? undefined) === organizationId) return reload();
      })
      .catch((e) => setMessage(publishingError(e)))
      .finally(() => setBusy(false));
  }, [params.state, params.code, params.error, reload, router, organizationId, select]);
  async function connect() {
    setBusy(true);
    setMessage('');
    try {
      const result = await schedio.startConnection('mastodon', instance, organizationId);
      await Linking.openURL(result.authorizationUrl);
    } catch (e) {
      setMessage(publishingError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ThemedView style={{ flex: 1 }}>
      <Header options={{ title: 'Accounts' }} />
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
        <Text>
          Mention is available for this workspace. You can also connect a Mastodon account.
        </Text>
        <TextInput
          accessibilityLabel="Mastodon server"
          value={instance}
          onChangeText={setInstance}
          autoCapitalize="none"
          style={{ borderWidth: 1, padding: 12 }}
        />
        <Button title="Connect Mastodon" disabled={busy} onPress={() => void connect()} />
        {accounts.map((account) => (
          <View key={account.id} style={{ padding: 12, borderWidth: 1, gap: 8 }}>
            <Text>
              {account.platform === 'mention'
                ? 'Mention'
                : `Mastodon: @${account.platformUsername}`}
            </Text>
            {account.platform === 'mastodon' && (
              <Button
                title="Disconnect"
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  void schedio
                    .disconnect(account.id, organizationId)
                    .then(reload)
                    .catch((e) => setMessage(publishingError(e)))
                    .finally(() => setBusy(false));
                }}
              />
            )}
          </View>
        ))}
        {organizationId && (
          <View style={{ gap: 8 }}>
            <Text>
              Organization review: {review ? 'required' : 'optional'}. Only an administrator can
              change this.
            </Text>
            <Button
              disabled={busy}
              title={review ? 'Make review optional' : 'Require review before publishing'}
              onPress={() => {
                setBusy(true);
                void schedio
                  .setReviewPolicy(organizationId, !review)
                  .then((result) => setReview(result.required))
                  .catch((e) => setMessage(publishingError(e)))
                  .finally(() => setBusy(false));
              }}
            />
          </View>
        )}
        {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
      </ScrollView>
    </ThemedView>
  );
}
