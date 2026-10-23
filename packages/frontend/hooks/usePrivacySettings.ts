import { useState, useEffect, useMemo } from 'react';
import { useOxy } from '@oxy.so/services/ui/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authenticatedClient } from '@/utils/api';
import { errorStatus } from '@/utils/errors';
import { PrivacyRequestEpoch } from '@/lib/privacy-request-epoch';

export interface PrivacySettings {
  profileVisibility?: 'public' | 'private' | 'followers_only';
  showContactInfo?: boolean;
  allowTags?: boolean;
  allowAllos?: boolean;
  showOnlineStatus?: boolean;
  hideLikeCounts?: boolean;
  hideShareCounts?: boolean;
  hideReplyCounts?: boolean;
  hideSaveCounts?: boolean;
  hiddenWords?: string[];
  restrictedUsers?: string[];
  blockedUsers?: string[];
}

const DEFAULT_SETTINGS: PrivacySettings = {
  profileVisibility: 'public',
  hideLikeCounts: false,
  hideShareCounts: false,
  hideReplyCounts: false,
  hideSaveCounts: false,
};

/** State belongs to both the verified viewer and requested profile, never global storage. */
export function usePrivacySettings(userId?: string | null): PrivacySettings | null {
  const { user, oxyServices } = useOxy();
  const accountId = user?.id ?? null;
  const requests = useMemo(
    () => new PrivacyRequestEpoch(() => oxyServices.session.userId),
    [oxyServices],
  );
  const [epoch, setEpoch] = useState(0);
  const [state, setState] = useState<{
    accountId: string;
    targetId: string;
    epoch: number;
    settings: PrivacySettings;
  } | null>(null);
  useEffect(() => {
    // Retire the old unscoped cache without ever reading its contents.
    void AsyncStorage.removeItem('@allo_privacy_settings').catch(() => undefined);
  }, []);
  useEffect(
    () =>
      oxyServices.session.onChange(() => {
        setEpoch(requests.invalidate());
        setState(null);
      }),
    [oxyServices, requests],
  );
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState(null);
    if (!accountId || !userId)
      return () => {
        active = false;
        controller.abort();
      };
    void requests
      .load(accountId, async () => {
        try {
          const response = await authenticatedClient.get<{ privacy?: PrivacySettings }>(
            `/profile/settings/${encodeURIComponent(userId)}`,
            { signal: controller.signal },
          );
          return response.privacy ?? DEFAULT_SETTINGS;
        } catch (error) {
          if (errorStatus(error) === 404) return DEFAULT_SETTINGS;
          throw error;
        }
      })
      .then((settings) => {
        if (active && settings) setState({ accountId, targetId: userId, epoch, settings });
      })
      .catch(() => {
        if (active) setState(null);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [accountId, userId, epoch, requests]);
  return state?.accountId === accountId && state.targetId === userId && state.epoch === epoch
    ? state.settings
    : null;
}

export function useCurrentUserPrivacySettings(): PrivacySettings | null {
  const { user } = useOxy();
  return usePrivacySettings(user?.id);
}
