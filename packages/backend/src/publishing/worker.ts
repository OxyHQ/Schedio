import { randomUUID } from 'node:crypto';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import {
  mentionForOxyService,
  MentionServiceError,
  type MentionRequester,
  type MentionServiceClient,
} from '@oxy.so/mention-sdk/server';
import { oxyServiceClient } from '../capabilities/oxy-service-client';
import { z } from 'zod';
import { getDb } from '../db';
import { posts, deliveries, organizationPolicies } from '../db/schema';
import { decryptSocialToken } from '../utils/tokenCipher';
import { usableAccount } from './connections';
import { upstreamJson } from './network';
import { PublishingError } from './errors';
import { logger } from '../utils/logger';
export const MASTODON_SAFE_RETRY_MS = 45 * 60 * 1000;
export type ClaimedDelivery = {
  delivery: typeof deliveries.$inferSelect;
  post: typeof posts.$inferSelect;
};
export type DispatchResult =
  | { status: 'succeeded'; url: string }
  | { status: 'failed' | 'unknown'; error: string };
export async function claimDelivery(now = new Date()): Promise<ClaimedDelivery | null> {
  return getDb().transaction(async (tx) => {
    const due = await tx
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.status, 'scheduled'),
          lte(posts.scheduledAt, now),
          sql`(${posts.organizationId} is null or exists (select 1 from ${organizationPolicies} where ${organizationPolicies.organizationId} = ${posts.organizationId} and (not ${organizationPolicies.required} or ${posts.approvedRevision} = ${posts.revision})))`,
        ),
      )
      .orderBy(asc(posts.queuePosition), asc(posts.scheduledAt), asc(posts.id))
      .limit(20)
      .for('update', { skipLocked: true });
    for (const post of due) {
      if (post.organizationId) {
        const policy = await tx.query.organizationPolicies.findFirst({
          where: eq(organizationPolicies.organizationId, post.organizationId),
        });
        if (policy?.required && post.approvedRevision !== post.revision) continue;
      }
      const ds = await tx
        .select()
        .from(deliveries)
        .where(eq(deliveries.postId, post.id))
        .orderBy(asc(deliveries.id))
        .for('update');
      const candidate = ds.find(
        (d) =>
          d.status === 'pending' ||
          (d.status === 'sending' && d.leaseUntil && d.leaseUntil <= now) ||
          (d.status === 'unknown' &&
            d.attempts < 3 &&
            d.firstAttemptAt &&
            (d.platform === 'mention' ||
              now.getTime() - d.firstAttemptAt.getTime() < MASTODON_SAFE_RETRY_MS)),
      );
      if (!candidate) {
        if (ds.length > 0 && ds.every((d) => d.status === 'succeeded'))
          await tx
            .update(posts)
            .set({ status: 'published', publishedAt: now, updatedAt: now })
            .where(eq(posts.id, post.id));
        else if (!ds.some((d) => d.status === 'sending'))
          await tx
            .update(posts)
            .set({ status: 'failed', updatedAt: now })
            .where(eq(posts.id, post.id));
        continue;
      }
      if (
        candidate.status === 'sending' &&
        candidate.platform === 'mastodon' &&
        candidate.firstAttemptAt &&
        now.getTime() - candidate.firstAttemptAt.getTime() >= MASTODON_SAFE_RETRY_MS
      ) {
        await tx
          .update(deliveries)
          .set({
            status: 'unknown',
            error:
              'Delivery may have completed. The provider retry window expired; verify at the destination.',
            leaseToken: null,
            leaseUntil: null,
          })
          .where(eq(deliveries.id, candidate.id));
        continue;
      }
      const [delivery] = await tx
        .update(deliveries)
        .set({
          status: 'sending',
          attempts: candidate.attempts + 1,
          firstAttemptAt: candidate.firstAttemptAt ?? now,
          leaseToken: randomUUID(),
          leaseUntil: new Date(now.getTime() + 60000),
        })
        .where(eq(deliveries.id, candidate.id))
        .returning();
      if (delivery) return { post, delivery };
    }
    return null;
  });
}
export async function dispatch(
  claim: ClaimedDelivery,
  provider: {
    json: typeof upstreamJson;
    mention: (
      requester: MentionRequester,
    ) => Pick<MentionServiceClient, 'identity' | 'publish' | 'dispose'>;
  } = {
    json: upstreamJson,
    mention: (requester) => mentionForOxyService(oxyServiceClient(), { requester }),
  },
): Promise<DispatchResult> {
  try {
    return await getDb().transaction(async (tx) => {
      const [currentPost] = await tx
        .select()
        .from(posts)
        .where(eq(posts.id, claim.post.id))
        .for('share');
      if (currentPost?.status !== 'scheduled' || currentPost.revision !== claim.post.revision)
        return { status: 'failed', error: 'Publishing instruction changed' };
      if (currentPost.organizationId) {
        const [policy] = await tx
          .select()
          .from(organizationPolicies)
          .where(eq(organizationPolicies.organizationId, currentPost.organizationId))
          .for('share');
        if (!policy || (policy.required && currentPost.approvedRevision !== currentPost.revision))
          return { status: 'failed', error: 'Current organization approval required' };
      }
      const account = await usableAccount(tx, claim.delivery.accountId);
      if (
        account.organizationId !== currentPost.organizationId ||
        (!currentPost.organizationId && account.userId !== currentPost.userId)
      )
        return { status: 'failed', error: 'Destination no longer belongs to this workspace' };
      try {
        if (account.platform === 'mention') {
          if (!currentPost.oxyTaskId)
            return {
              status: 'failed',
              error: 'Publishing authority is missing; reschedule from your Oxy account',
            };
          const accountId = currentPost.organizationId ?? currentPost.userId;
          const client = provider.mention({ accountId, taskId: currentPost.oxyTaskId });
          try {
            const identity = await client.identity();
            if (
              identity.oxyUserId !== accountId ||
              account.platformUserId !== `${account.instance}|${accountId}`
            )
              return {
                status: 'failed',
                error: 'Mention account differs from the publishing workspace',
              };
            const result = await client.publish(
              { content: { text: claim.post.content }, visibility: 'public', status: 'published' },
              claim.delivery.effectKey,
            );
            return { status: 'succeeded', url: result.url };
          } finally {
            client.dispose();
          }
        }
        if (account.platform !== 'mastodon')
          return { status: 'failed', error: 'Unsupported destination' };
        if (!account.accessTokenCiphertext)
          return { status: 'failed', error: 'Reconnect the Mastodon destination' };
        const accessToken = decryptSocialToken(account.accessTokenCiphertext, {
          accountId: account.id,
          kind: 'access',
        });
        // Recheck immediately before dispatch; a worker may have paused after claiming.
        if (
          claim.delivery.attempts > 1 &&
          claim.delivery.firstAttemptAt &&
          Date.now() - claim.delivery.firstAttemptAt.getTime() >= MASTODON_SAFE_RETRY_MS
        )
          return {
            status: 'unknown',
            error: 'Provider retry window expired; verify at the destination',
          };
        const result = await provider.json(`${account.instance}/api/v1/statuses`, {
          method: 'POST',
          token: accessToken,
          headers: { 'Idempotency-Key': claim.delivery.effectKey },
          body: { status: claim.post.content, visibility: 'public' },
        });
        if (result.status >= 500 || result.status === 408)
          return { status: 'unknown', error: 'Provider outcome is unknown' };
        if (result.status >= 400)
          return { status: 'failed', error: `Provider refused publication (${result.status})` };
        const value = z
          .object({
            id: z.string(),
            url: z
              .url()
              .refine(
                (value) =>
                  new URL(value).protocol === 'https:' &&
                  new URL(value).origin === account.instance,
              ),
          })
          .parse(result.body);
        return { status: 'succeeded', url: value.url };
      } catch (error) {
        return dispatchError(error);
      }
    });
  } catch (error) {
    return dispatchError(error);
  }
}
function dispatchError(error: unknown): DispatchResult {
  if (error instanceof PublishingError) return { status: 'failed', error: error.message };
  if (error instanceof MentionServiceError && !error.unknownOutcome)
    return { status: 'failed', error: `Mention refused publication (${error.status})` };
  return {
    status: 'unknown',
    error: 'Provider outcome is unknown; retry preserves the original delivery key',
  };
}

export async function settle(claim: ClaimedDelivery, result: DispatchResult) {
  await getDb().transaction(async (tx) => {
    await tx.select().from(posts).where(eq(posts.id, claim.post.id)).for('update');
    await tx
      .update(deliveries)
      .set({
        status: result.status,
        url: result.status === 'succeeded' ? result.url : null,
        error: result.status === 'succeeded' ? null : result.error,
        leaseToken: null,
        leaseUntil: null,
      })
      .where(
        and(
          eq(deliveries.id, claim.delivery.id),
          eq(deliveries.leaseToken, claim.delivery.leaseToken ?? ''),
        ),
      );
    const ds = await tx.select().from(deliveries).where(eq(deliveries.postId, claim.post.id));
    const complete = ds.length > 0 && ds.every((d) => d.status === 'succeeded');
    if (complete)
      await tx
        .update(posts)
        .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(posts.id, claim.post.id));
  });
}
export async function tick(
  publish: (claim: ClaimedDelivery) => Promise<DispatchResult> = dispatch,
) {
  const claim = await claimDelivery();
  if (!claim) return false;
  await settle(claim, await publish(claim));
  return true;
}
export function startPublishingWorker() {
  let active = false,
    stopped = false;
  const timer = setInterval(() => {
    if (active || stopped) return;
    active = true;
    void tick()
      .catch(() => {
        logger.error('Publishing worker tick failed; pending leases remain recoverable');
      })
      .finally(() => {
        active = false;
      });
  }, 1000);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (active) await new Promise((resolve) => setTimeout(resolve, 20));
  };
}
