import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AliaChatSheet, type AliaChatSheetRef } from '@alia.onl/sdk';
import { AliaAvatarIcon } from '@alia.onl/sdk/avatar';
import { Button } from '@oxy.so/bloom/button';
import { useAuth } from '@oxy.so/services/ui/client';

/**
 * The "Ask Alia" button and the chat sheet it opens.
 *
 * The button is always visible; pressing it signed out opens the Oxy sign-in
 * dialog rather than a sheet that could not call Alia. The sheet itself is
 * mounted only once the session can use the private API.
 */
export function AskAlia() {
  const { t } = useTranslation();
  const { canUsePrivateApi, signIn } = useAuth();
  const chatRef = useRef<AliaChatSheetRef>(null);

  const welcomeSuggestions = useMemo(
    () => [
      { id: 'plan', text: t('alia.suggestion.plan') },
      { id: 'write', text: t('alia.suggestion.write') },
      { id: 'times', text: t('alia.suggestion.times') },
    ],
    [t],
  );

  const handleAskAlia = useCallback(() => {
    if (canUsePrivateApi) chatRef.current?.present();
    else void signIn();
  }, [canUsePrivateApi, signIn]);

  return (
    <>
      <Button size="sm" appearance="outline" leadingIcon={AliaAvatarIcon} onPress={handleAskAlia}>
        {t('alia.ask')}
      </Button>
      {canUsePrivateApi && (
        <AliaChatSheet
          ref={chatRef}
          clientContext={t('alia.clientContext')}
          welcomeSuggestions={welcomeSuggestions}
        />
      )}
    </>
  );
}
