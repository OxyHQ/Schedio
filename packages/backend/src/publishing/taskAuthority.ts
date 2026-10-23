import { OxyServices } from '@oxy.so/core';
import type { OxyAuthRequest, OxyServer } from '@oxy.so/core/server';
import type { Request } from 'express';
import { oxyServiceClient } from '../capabilities/oxy-service-client';
import type { Scope } from './postService';
import { PublishingError } from './errors';

export interface ScheduleAuthority {
  create(postId: string, revision: number, when: Date): Promise<string>;
  revoke(taskId: string): Promise<void>;
}
/** Called only after current workspace membership/review has been checked. */
export async function scheduleAuthority(
  req: Request,
  scope: Scope,
  oxy: Pick<OxyServer, 'agency' | 'baseURL'> = oxyServiceClient(),
): Promise<ScheduleAuthority> {
  const session = req as OxyAuthRequest;
  const actor = session.oxyActor;
  if (!session.accessToken || !actor || actor.effectiveAccountId !== scope.userId)
    throw new PublishingError(403, 'forbidden', 'A verified Oxy session is required');
  const effectiveAccountId = scope.organizationId ?? scope.userId;
  let requesterToken = session.accessToken;
  if (effectiveAccountId !== actor.effectiveAccountId) {
    // Canonical managed-account exchange; only the request-local client changes.
    const local = new OxyServices({ baseURL: oxy.baseURL, enableCache: false });
    local.session.setAccessToken(requesterToken);
    try {
      requesterToken = (await local.accounts.actAs(effectiveAccountId)).accessToken;
    } finally {
      local.dispose();
    }
  }
  return {
    async create(postId, revision, when) {
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      if (when >= expiresAt)
        throw new PublishingError(
          422,
          'validation_failed',
          'Choose a publishing time within one year',
        );
      const task = await oxy.agency.createTask(
        {
          origin: { kind: 'automation', id: `${postId}:${revision}` },
          actor: { type: 'requester', accountId: actor.actorAccountId },
          effectiveAccountId,
          expiresAt: expiresAt.toISOString(),
        },
        { requesterToken },
      );
      if (
        task.requesterAccountId !== actor.actorAccountId ||
        task.effectiveAccountId !== effectiveAccountId
      ) {
        await oxy.agency.revokeTask(task.id);
        throw new PublishingError(
          403,
          'forbidden',
          'Publishing account did not match the verified session',
        );
      }
      return task.id;
    },
    revoke: async (taskId) => {
      await oxy.agency.revokeTask(taskId);
    },
  };
}
export async function revokePublishingTask(taskId: string): Promise<void> {
  await oxyServiceClient().agency.revokeTask(taskId);
}
