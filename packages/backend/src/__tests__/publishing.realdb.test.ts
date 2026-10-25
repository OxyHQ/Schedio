import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, dropTestDatabase } from '@oxy.so/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { closeDatabase, connectToDatabase, getDb } from '../db';
import { deliveries, posts, socialAccounts, organizationPolicies } from '../db/schema';
import {
  approve,
  createDraft,
  editDraft,
  enqueue,
  listPosts,
  reorder,
} from '../publishing/postService';
import {
  dispatch,
  claimDelivery,
  MASTODON_SAFE_RETRY_MS,
  settle,
  tick,
} from '../publishing/worker';
import {
  startConnection,
  finishConnection,
  usableAccount,
  disconnect,
  listAccounts,
  mentionDestinationId,
  type ConnectionProvider,
} from '../publishing/connections';
import { encryptSocialToken, decryptSocialToken } from '../utils/tokenCipher';
import { oauthStates } from '../db/schema';
import { DraftInput } from '@schedio/contracts';
import { OxyServer } from '@oxy.so/core/server';
import { mentionForOxyService } from '@oxy.so/mention-sdk/server';
import { scheduleAuthority } from '../publishing/taskAuthority';
import type { Request } from 'express';
const ADMIN_URL = process.env.TEST_DATABASE_URL;
const scope = { userId: 'publishing-owner', organizationId: null };
let databaseUrl: string | undefined;
function migrate(databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'bun',
      [
        'run',
        'db:migrate',
        `--target-database=${new URL(databaseUrl).pathname.slice(1)}`,
        '--phase=all',
      ],
      {
        cwd: join(__dirname, '../..'),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (b: Buffer) => {
      output += b.toString();
    });
    child.stderr.on('data', (b: Buffer) => {
      output += b.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(output))));
  });
}
async function account(id: string, owner = scope.userId, organizationId: string | null = null) {
  await getDb().insert(socialAccounts).values({
    id,
    userId: owner,
    organizationId,
    platform: 'mastodon',
    platformUserId: id,
    platformUsername: id,
    accessTokenCiphertext: 'v1:test',
  });
}
async function draft(ids = ['a']) {
  return createDraft(scope, { content: 'A publication', platforms: ids });
}
async function scheduled(ids = ['a']) {
  const p = await draft(ids);
  return enqueue(scope, p.id, p.revision, new Date(Date.now() - 1000));
}
describe('publishing test gate', () => {
  it('requires a database in CI', () => {
    if (process.env.CI) expect(ADMIN_URL).toBeTruthy();
  });
});
describe.if(Boolean(ADMIN_URL))('publishing transactions and worker', () => {
  beforeAll(async () => {
    databaseUrl = await createTestDatabase({
      adminUrl: ADMIN_URL ?? '',
      driver: 'bun-sql',
      migrate,
    });
    process.env.DATABASE_URL = databaseUrl;
    await connectToDatabase();
  }, 30000);
  beforeEach(async () => {
    await getDb().delete(posts);
    await getDb().delete(socialAccounts);
    await getDb().delete(organizationPolicies);
    await account('a');
    await account('b');
  });
  afterAll(async () => {
    await closeDatabase();
    if (databaseUrl) await dropTestDatabase(databaseUrl, { driver: 'bun-sql' });
    delete process.env.DATABASE_URL;
  }, 30000);
  it('makes Mention available without OAuth or credentials, isolating organization and personal destinations', async () => {
    const first = await listAccounts(scope);
    const own = first.items.find((a) => a.platform === 'mention');
    expect(own?.id).toBe(mentionDestinationId(scope));
    const org = { userId: scope.userId, organizationId: 'org' };
    const [one, two] = await Promise.all([
      listAccounts(org),
      listAccounts({ ...org, userId: 'second-operator' }),
    ]);
    expect(one.items).toHaveLength(1);
    expect(one.items[0]?.id).toBe(two.items[0]?.id);
    expect(one.items[0]?.id).not.toBe(own?.id);
    const stored = await getDb().query.socialAccounts.findFirst({
      where: eq(socialAccounts.id, own?.id ?? ''),
    });
    expect(stored?.accessTokenCiphertext).toBeNull();
    expect(stored?.oauthClientId).toBeNull();
    await expect(disconnect(scope, own?.id ?? '')).rejects.toThrow('current Oxy account');
  });

  it('publishes with original managed requester through shared HTTP transport, and preserves effect keys on uncertain replies', async () => {
    const managed = { userId: 'org', organizationId: 'org' };
    await listAccounts(managed);
    const p = await createDraft(managed, {
      content: 'Org publication',
      platforms: [mentionDestinationId(managed)],
      organizationId: 'org',
    });
    let revoked = false;
    let wrongAccount = false;
    let uncertain = false;
    const keys: string[] = [];
    const taskBodies: Array<Record<string, unknown>> = [];
    const now = Math.floor(Date.now() / 1000);
    const token = `e30.${Buffer.from(JSON.stringify({ iat: now, exp: now + 300, authority: 'first_party' })).toString('base64url')}.fixture`;
    const api = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path.endsWith('/challenge')) return Response.json({ nonce: 'fixture' });
        if (path === '/auth/service-token/workload') {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.protocolVersion).toBe(2);
          expect(['oxy-api', 'oxy-service:6a2f851751b784a86fd0e916']).toContain(
            String(body.audience ?? 'oxy-api'),
          );
          expect(body).not.toHaveProperty('scopes');
          return Response.json({ token, expiresIn: 300 });
        }
        expect(request.headers.get('authorization')).toBe(`Bearer ${token}`);
        if (path === '/capabilities/tasks') {
          const body = (await request.json()) as Record<string, unknown>;
          taskBodies.push(body);
          expect(body.actor).toEqual({ type: 'requester', accountId: 'human' });
          expect(body.subjectToken).toBe('managed-session');
          return Response.json({
            task: { id: 'original-task', requesterAccountId: 'human', effectiveAccountId: 'org' },
          });
        }
        expect(request.headers.get('x-oxy-task-id')).toBe('original-task');
        expect(request.headers.get('x-oxy-user-id')).toBe('org');
        if (revoked) return Response.json({ error: 'revoked' }, { status: 403 });
        if (path === '/mcp/bundles/me')
          return Response.json({
            oxyUserId: wrongAccount ? 'another-account' : 'org',
            handle: 'organization',
            displayName: 'Organization',
          });
        expect(path).toBe('/publishing/v1/posts');
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        expect(await request.json()).toMatchObject({ content: { text: p.content } });
        return uncertain
          ? Response.json({ error: 'uncertain' }, { status: 503 })
          : Response.json({ success: true, post: { id: 'published-post' } });
      },
    });
    const oxy = new OxyServer({
      baseURL: api.url.origin,
      workloadCredentials: async () => ({
        AccessKeyId: 'ASIA_TEST',
        SecretAccessKey: 'fixture',
        Token: 'temporary',
      }),
    });
    try {
      const req = {
        accessToken: 'managed-session',
        oxyActor: { actorAccountId: 'human', effectiveAccountId: 'org', delegated: true },
      } as unknown as Request;
      const authority = await scheduleAuthority(req, managed, oxy);
      await enqueue(managed, p.id, p.revision, new Date(), authority);
      const persisted = await getDb().query.posts.findFirst({ where: eq(posts.id, p.id) });
      expect(persisted?.oxyTaskId).toBe('original-task');
      expect(JSON.stringify(persisted)).not.toContain('managed-session');
      expect(taskBodies[0]?.origin).toEqual({ kind: 'automation', id: `${p.id}:${p.revision}` });
      const claim = await claimDelivery();
      if (!claim) throw new Error('Expected Mention claim');
      const provider = {
        json: async () => {
          throw new Error('No external OAuth transport');
        },
        mention: (requester: Parameters<typeof mentionForOxyService>[1]['requester']) =>
          mentionForOxyService(oxy, { baseURL: api.url.origin, requester }),
      };
      wrongAccount = true;
      expect((await dispatch(claim, provider)).status).toBe('failed');
      expect(keys).toEqual([]);
      wrongAccount = false;
      revoked = true;
      expect((await dispatch(claim, provider)).status).toBe('failed');
      expect(keys).toEqual([]);
      revoked = false;
      uncertain = true;
      expect((await dispatch(claim, provider)).status).toBe('unknown');
      uncertain = false;
      expect(await dispatch(claim, provider)).toEqual({
        status: 'succeeded',
        url: 'https://mention.earth/p/published-post',
      });
      expect(keys).toEqual([claim.delivery.effectKey, claim.delivery.effectKey]);
    } finally {
      oxy.dispose();
      api.stop(true);
    }
  });

  it('requires fresh authority for Mention scheduling and revokes the old root when editing an unattempted revision', async () => {
    await listAccounts(scope);
    const p = await draft([mentionDestinationId(scope)]);
    await expect(enqueue(scope, p.id, p.revision, new Date())).rejects.toThrow(
      'current Oxy session',
    );
    const revoked: string[] = [];
    const authority = {
      create: async () => 'root-original',
      revoke: async (id: string) => {
        revoked.push(id);
      },
    };
    await enqueue(scope, p.id, p.revision, new Date(), authority);
    const updated = await editDraft(
      scope,
      p.id,
      { content: 'Updated', platforms: [mentionDestinationId(scope)], revision: p.revision },
      authority.revoke,
    );
    expect(updated.status).toBe('draft');
    expect(updated.revision).toBe(2);
    expect(revoked).toEqual(['root-original']);
    const row = await getDb().query.posts.findFirst({ where: eq(posts.id, p.id) });
    expect(row?.oxyTaskId).toBeNull();
  });
  it('deduplicates concurrent capability drafts and a lost reply without approving or publishing', async () => {
    const operation = { key: 'same-draft', actorAccountId: 'agent' };
    const input = { content: 'Review this', platforms: ['a'] };
    const [first, retry] = await Promise.all([
      createDraft(scope, input, operation),
      createDraft(scope, input, operation),
    ]);
    expect(first.id).toBe(retry.id);
    expect((await createDraft(scope, input, operation)).id).toBe(first.id);
    expect((await listPosts(scope)).items).toHaveLength(1);
    expect(first.status).toBe('draft');
    expect(first.approvedRevision).toBeNull();
    expect(first.scheduledAt).toBeNull();
    expect(first.deliveries[0].attempts).toBe(0);
    await expect(createDraft(scope, { ...input, content: 'different' }, operation)).rejects.toThrow(
      'different content',
    );
  });
  it('rejects fabricated client status/approval and destinations owned by others', async () => {
    expect(
      DraftInput.safeParse({ content: 'text', platforms: ['a'], status: 'published' }).success,
    ).toBe(false);
    await account('foreign', 'another-user');
    await expect(createDraft(scope, { content: 'text', platforms: ['foreign'] })).rejects.toThrow(
      'Choose Mention',
    );
    expect((await listPosts(scope)).items).toHaveLength(0);
  });
  it('invalidates approval for content and destination edits and refuses stale revisions', async () => {
    const org = { userId: scope.userId, organizationId: 'org' };
    await account('org-a', scope.userId, 'org');
    await account('org-b', scope.userId, 'org');
    let p = await createDraft(org, { content: 'one', platforms: ['org-a'], organizationId: 'org' });
    p = await approve(org, p.id, p.revision);
    p = await editDraft(org, p.id, { content: 'two', platforms: ['org-a'], revision: p.revision });
    expect(p.approvedRevision).toBeNull();
    p = await approve(org, p.id, p.revision);
    p = await editDraft(org, p.id, { content: 'two', platforms: ['org-b'], revision: p.revision });
    expect(p.approvedRevision).toBeNull();
    await expect(approve(org, p.id, p.revision - 1)).rejects.toThrow('current');
  });
  it('checks current review policy for already scheduled work', async () => {
    const org = { userId: scope.userId, organizationId: 'org' };
    await account('org-a', scope.userId, 'org');
    const p = await createDraft(org, {
      content: 'one',
      platforms: ['org-a'],
      organizationId: 'org',
    });
    await enqueue(org, p.id, p.revision, new Date(Date.now() - 1000));
    await getDb()
      .update(organizationPolicies)
      .set({ required: true })
      .where(eq(organizationPolicies.organizationId, 'org'));
    expect(await claimDelivery()).toBeNull();
    await expect(enqueue(org, p.id, p.revision, new Date())).rejects.toThrow('approval');
    await approve(org, p.id, p.revision);
    expect((await claimDelivery())?.post.id).toBe(p.id);
  });
  it('persists exact authorized queue order and rejects duplicates or unauthorized IDs atomically', async () => {
    const first = await scheduled();
    const second = await scheduled();
    await reorder(scope, [second.id, first.id]);
    expect((await listPosts(scope, true)).items.map((p) => p.id)).toEqual([second.id, first.id]);
    await expect(reorder(scope, [first.id, 'foreign'])).rejects.toThrow('Queue changed');
    await expect(reorder(scope, [first.id, first.id])).rejects.toThrow('Queue changed');
    expect((await listPosts(scope, true)).items.map((p) => p.id)).toEqual([second.id, first.id]);
    const third = await scheduled();
    expect((await listPosts(scope, true)).items.map((p) => p.id)).toEqual([
      second.id,
      first.id,
      third.id,
    ]);
  });
  it('does not claim a locked job; only one lease can dispatch a destination', async () => {
    const p = await scheduled();
    let unlock: () => void = () => {};
    let acquired: () => void = () => {};
    const held = new Promise<void>((r) => {
      acquired = r;
    });
    const release = new Promise<void>((r) => {
      unlock = r;
    });
    const locker = getDb().transaction(async (tx) => {
      await tx.select().from(posts).where(eq(posts.id, p.id)).for('update');
      acquired();
      await release;
    });
    await held;
    expect(await claimDelivery()).toBeNull();
    unlock();
    await locker;
    const first = await claimDelivery();
    expect(first?.post.id).toBe(p.id);
    expect(await claimDelivery()).toBeNull();
  });
  it('retries partial failures without touching successful destinations', async () => {
    const p = await scheduled(['a', 'b']);
    const successful = new Set<string>();
    let count = 0;
    while (
      await tick(async (claim) => {
        count++;
        if (claim.delivery.accountId === 'a') {
          successful.add(claim.delivery.effectKey);
          return { status: 'succeeded', url: 'https://mastodon.social/@a/1' };
        }
        return { status: 'failed', error: 'rate limited' };
      })
    ) {}
    expect(count).toBe(2);
    await enqueue(scope, p.id, p.revision, new Date());
    await tick(async (claim) => {
      expect(claim.delivery.accountId).toBe('b');
      return { status: 'succeeded', url: 'https://mastodon.social/@b/2' };
    });
    expect(successful.size).toBe(1);
    expect((await getDb().query.posts.findFirst({ where: eq(posts.id, p.id) }))?.status).toBe(
      'published',
    );
  });
  it('preserves the same provider effect key after a lost response', async () => {
    await scheduled();
    const providerEffects = new Map<string, string>();
    let calls = 0;
    const publish = async (claim: NonNullable<Awaited<ReturnType<typeof claimDelivery>>>) => {
      calls++;
      if (!providerEffects.has(claim.delivery.effectKey))
        providerEffects.set(claim.delivery.effectKey, 'https://mastodon.social/@a/3');
      if (calls === 1) return { status: 'unknown' as const, error: 'response lost' };
      return {
        status: 'succeeded' as const,
        url: providerEffects.get(claim.delivery.effectKey) ?? '',
      };
    };
    await tick(publish);
    await tick(publish);
    expect(calls).toBe(2);
    expect(providerEffects.size).toBe(1);
  });
  it('never redelivers an uncertain Mastodon effect outside its retention window', async () => {
    const p = await scheduled();
    const claim = await claimDelivery();
    expect(claim).not.toBeNull();
    await getDb()
      .update(deliveries)
      .set({
        firstAttemptAt: new Date(Date.now() - MASTODON_SAFE_RETRY_MS - 10000),
        leaseUntil: new Date(Date.now() - 1000),
      })
      .where(eq(deliveries.postId, p.id));
    let calls = 0;
    await tick(async () => {
      calls++;
      return { status: 'succeeded', url: 'https://mastodon.social/@a/4' };
    });
    expect(calls).toBe(0);
    const result = await getDb().query.deliveries.findFirst({ where: eq(deliveries.postId, p.id) });
    expect(result?.status).toBe('unknown');
    await enqueue(scope, p.id, p.revision, new Date());
    await tick(async () => {
      calls++;
      return { status: 'succeeded', url: 'https://mastodon.social/@a/4' };
    });
    expect(calls).toBe(0);
  });
  it('fences a stale worker response after lease takeover', async () => {
    await scheduled();
    const first = await claimDelivery();
    expect(first).not.toBeNull();
    if (!first) throw new Error('Expected claim');
    await getDb()
      .update(deliveries)
      .set({ leaseUntil: new Date(Date.now() - 1000) })
      .where(eq(deliveries.id, first.delivery.id));
    const second = await claimDelivery();
    if (!second) throw new Error('Expected takeover');
    expect(second?.delivery.effectKey).toBe(first?.delivery.effectKey);
    expect(second?.delivery.leaseToken).not.toBe(first?.delivery.leaseToken);
    await settle(first, { status: 'failed', error: 'stale response' });
    expect(
      (await getDb().query.deliveries.findFirst({ where: eq(deliveries.id, first.delivery.id) }))
        ?.status,
    ).toBe('sending');
    await settle(second, { status: 'succeeded', url: 'https://mastodon.social/@a/5' });
    expect(
      (await getDb().query.deliveries.findFirst({ where: eq(deliveries.id, first.delivery.id) }))
        ?.status,
    ).toBe('succeeded');
  });
  it('prevents changing dispatched content or destinations', async () => {
    const p = await scheduled();
    await claimDelivery();
    await expect(
      editDraft(scope, p.id, { content: 'changed', platforms: ['b'], revision: p.revision }),
    ).rejects.toThrow('dispatched');
  });
  it('does not label a legacy job with no deliveries as published', async () => {
    const id = randomUUID();
    await getDb()
      .insert(posts)
      .values({
        id,
        userId: scope.userId,
        content: 'legacy',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() - 1000),
      });
    expect(await claimDelivery()).toBeNull();
    expect((await getDb().query.posts.findFirst({ where: eq(posts.id, id) }))?.status).toBe(
      'failed',
    );
  });

  it('completes OAuth once, encrypts tokens, binds the owner and refreshes under a credential lock', async () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.SOCIAL_OAUTH_REDIRECT_URI = 'https://schedio.app/accounts';
    const requests: string[] = [];
    const provider: ConnectionProvider = {
      json: async (url, options) => {
        requests.push(url);
        if (url.endsWith('/api/v1/apps'))
          return {
            status: 200,
            body: { client_id: 'registered-client', client_secret: 'client-secret' },
          };
        return {
          status: 200,
          body: {
            access_token:
              options?.form?.get('grant_type') === 'refresh_token'
                ? 'rotated-access'
                : 'private-access',
            refresh_token: 'private-refresh',
            expires_in: 1,
          },
        };
      },
      identify: async () => ({ id: 'provider-user', username: 'provider-name' }),
    };
    const start = await startConnection(
      scope,
      { platform: 'mastodon', instance: 'https://mastodon.social' },
      provider,
    );
    const auth = new URL(start.authorizationUrl);
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth.searchParams.get('state')).toBe(start.state);
    await expect(
      finishConnection(
        { userId: 'other-user', organizationId: null },
        { state: start.state, code: 'code' },
        provider,
      ),
    ).rejects.toThrow('expired');
    const account = await finishConnection(scope, { state: start.state, code: 'code' }, provider);
    const stored = await getDb().query.socialAccounts.findFirst({
      where: eq(socialAccounts.id, account.id),
    });
    if (!stored) throw new Error('Expected account');
    expect(stored?.accessTokenCiphertext).not.toContain('private-access');
    expect(
      decryptSocialToken(stored.accessTokenCiphertext, { accountId: account.id, kind: 'access' }),
    ).toBe('private-access');
    expect(JSON.stringify(account)).not.toContain('private');
    await expect(
      finishConnection(scope, { state: start.state, code: 'code' }, provider),
    ).rejects.toThrow('expired');
    await getDb().transaction(async (tx) => {
      const refreshed = await usableAccount(tx, account.id, provider);
      expect(
        decryptSocialToken(refreshed.accessTokenCiphertext, {
          accountId: account.id,
          kind: 'access',
        }),
      ).toBe('rotated-access');
    });
    expect(requests.filter((url) => url.endsWith('/oauth/token'))).toHaveLength(2);
    await disconnect(scope, account.id);
    await expect(
      getDb().transaction((tx) => usableAccount(tx, account.id, provider)),
    ).rejects.toThrow('disconnected');
  });
  it('rejects expired external OAuth states and never starts Mention OAuth', async () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.SOCIAL_OAUTH_REDIRECT_URI = 'https://schedio.app/accounts';
    const provider: ConnectionProvider = {
      json: async (url) =>
        url.endsWith('/api/v1/apps')
          ? { status: 200, body: { client_id: 'client' } }
          : url.includes('.well-known')
            ? { status: 200, body: { authorization_endpoint: 'https://auth.oxy.so/authorize' } }
            : {
                status: 200,
                body: {
                  access_token: 'scoped-access',
                  refresh_token: 'scoped-refresh',
                  expires_in: 900,
                },
              },
      identify: async () => ({ id: 'another-oxy-account', username: 'another' }),
    };
    await expect(startConnection(scope, { platform: 'mention' }, provider)).rejects.toThrow();
    const start = await startConnection(
      scope,
      { platform: 'mastodon', instance: 'https://mastodon.social' },
      provider,
    );
    await getDb()
      .update(oauthStates)
      .set({ expiresAt: new Date(Date.now() - 1000) });
    await expect(
      finishConnection(scope, { state: start.state, code: 'code' }, provider),
    ).rejects.toThrow('expired');
  });
  it('paginates with cursors bound to the list and workspace', async () => {
    const first = await draft(),
      second = await draft();
    expect(first.id).not.toBe(second.id);
    const instant = new Date().toISOString().replace(/\.\d{3}Z$/, '.123456Z');
    await getDb().execute(
      sql`update posts set created_at=${instant}::timestamptz where id in (${first.id},${second.id})`,
    );
    const page = await listPosts(scope, false, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    const next = await listPosts(scope, false, { limit: 1, cursor: page.nextCursor ?? undefined });
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.id).not.toBe(page.items[0]?.id);
    expect(next.nextCursor).toBeNull();
    await expect(
      listPosts({ userId: 'another', organizationId: null }, false, {
        cursor: page.nextCursor ?? undefined,
      }),
    ).rejects.toThrow('cursor');
    await expect(listPosts(scope, true, { cursor: page.nextCursor ?? undefined })).rejects.toThrow(
      'cursor',
    );
  });
  it('rechecks policy after claiming and refuses a disconnected destination before provider writes', async () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    const org = { userId: scope.userId, organizationId: 'org' };
    await account('org-a', scope.userId, 'org');
    const p = await createDraft(org, {
      content: 'pending approval',
      platforms: ['org-a'],
      organizationId: 'org',
    });
    await enqueue(org, p.id, p.revision, new Date(Date.now() - 1000));
    const claim = await claimDelivery();
    if (!claim) throw new Error('Expected claim');
    let calls = 0;
    const provider = {
      json: async () => {
        calls++;
        return {
          status: 200,
          body: { id: 'provider-post', url: 'https://mastodon.social/@org/1' },
        };
      },
      mention: () => {
        throw new Error('Unexpected Mention call');
      },
    };
    await getDb()
      .update(organizationPolicies)
      .set({ required: true })
      .where(eq(organizationPolicies.organizationId, 'org'));
    expect((await dispatch(claim, provider)).status).toBe('failed');
    expect(calls).toBe(0);
    await approve(org, p.id, p.revision);
    await disconnect(org, 'org-a');
    expect((await dispatch(claim, provider)).status).toBe('failed');
    expect(calls).toBe(0);
  });
  it('real dispatcher uses the persisted effect key and validates the provider result URL', async () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    await getDb()
      .update(socialAccounts)
      .set({
        accessTokenCiphertext: encryptSocialToken('delegated', { accountId: 'a', kind: 'access' }),
      })
      .where(eq(socialAccounts.id, 'a'));
    await scheduled();
    const claim = await claimDelivery();
    if (!claim) throw new Error('Expected claim');
    const provider = {
      json: async (url: string, options?: Parameters<ConnectionProvider['json']>[1]) => {
        expect(url).toBe('https://mastodon.social/api/v1/statuses');
        expect(options?.token).toBe('delegated');
        expect(options?.headers?.['Idempotency-Key']).toBe(claim.delivery.effectKey);
        return { status: 200, body: { id: 'provider-id', url: 'https://mastodon.social/@a/123' } };
      },
      mention: () => {
        throw new Error('Unexpected Mention call');
      },
    };
    expect(await dispatch(claim, provider)).toEqual({
      status: 'succeeded',
      url: 'https://mastodon.social/@a/123',
    });
    const invalid = {
      ...provider,
      json: async () => ({ status: 200, body: { id: 'provider-id' } }),
    };
    expect((await dispatch(claim, invalid)).status).toBe('unknown');
  });
  it('serializes concurrent revision changes with a real lock wait', async () => {
    const p = await draft();
    let unlock: () => void = () => {};
    let acquired: (pid: number) => void = () => {};
    const held = new Promise<number>((r) => {
      acquired = r;
    });
    const release = new Promise<void>((r) => {
      unlock = r;
    });
    const blocker = getDb().transaction(async (tx) => {
      await tx.select().from(posts).where(eq(posts.id, p.id)).for('update');
      const result = await tx.execute(sql`select pg_backend_pid() as pid`);
      acquired(Number(result[0]?.pid));
      await release;
      await tx
        .update(posts)
        .set({ revision: p.revision + 1 })
        .where(eq(posts.id, p.id));
    });
    const pid = await held;
    const contender = editDraft(scope, p.id, {
      content: 'contender',
      platforms: ['a'],
      revision: p.revision,
    });
    let blocked = false;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const locks = await getDb().execute(
          sql`select 1 from pg_locks w join pg_locks h on w.transactionid=h.transactionid where h.pid=${pid} and h.granted and not w.granted`,
        );
        if (locks.length) {
          blocked = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(blocked).toBe(true);
    } finally {
      unlock();
    }
    await blocker;
    await expect(contender).rejects.toThrow('changed');
  });
});
