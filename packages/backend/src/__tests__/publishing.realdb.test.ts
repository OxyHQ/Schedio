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
  type ConnectionProvider,
} from '../publishing/connections';
import { encryptSocialToken, decryptSocialToken } from '../utils/tokenCipher';
import { oauthStates } from '../db/schema';
import { DraftInput } from '@schedio/contracts';
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
  it('rejects fabricated client status/approval and destinations owned by others', async () => {
    expect(
      DraftInput.safeParse({ content: 'text', platforms: ['a'], status: 'published' }).success,
    ).toBe(false);
    await account('foreign', 'another-user');
    await expect(createDraft(scope, { content: 'text', platforms: ['foreign'] })).rejects.toThrow(
      'Choose connected',
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
  it('rejects expired OAuth states and a Mention account different from the authorized workspace', async () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.SOCIAL_OAUTH_REDIRECT_URI = 'https://schedio.app/accounts';
    const provider: ConnectionProvider = {
      json: async (url) =>
        url.endsWith('/register')
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
    const start = await startConnection(scope, { platform: 'mention' }, provider);
    await expect(
      finishConnection(scope, { state: start.state, code: 'code' }, provider),
    ).rejects.toThrow('workspace');
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
