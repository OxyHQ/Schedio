import { useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { oxyServices } from '@/lib/oxyServices';
import { usePublishingWorkspace } from '@/lib/publishing';
export function Workspace() {
  const { organizationId, select } = usePublishingWorkspace();
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let active = true;
    void oxyServices.accounts
      .list()
      .then((accounts) => {
        if (active)
          setOrganizations(
            accounts
              .filter((a) => a.kind === 'organization')
              .map((a) => ({ id: a.accountId, name: a.account.username ?? a.accountId })),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <View style={{ gap: 8, paddingVertical: 12 }}>
      <Text>Workspace</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button
          title={organizationId ? 'Personal' : 'Personal ✓'}
          onPress={() => select(undefined)}
        />
        {organizations.map((org) => (
          <Button
            key={org.id}
            title={`${org.name}${organizationId === org.id ? ' ✓' : ''}`}
            onPress={() => select(org.id)}
          />
        ))}
      </View>
    </View>
  );
}
