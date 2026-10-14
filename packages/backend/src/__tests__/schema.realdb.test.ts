import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createTestDatabase, dropTestDatabase } from '@oxy.so/db/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { closeDatabase, connectToDatabase, getDb } from '../db';
import {
  postAnalytics,
  posts,
  publishingSchedules,
  userBehaviors,
  userSettings,
} from '../db/schema';

const PACKAGE_ROOT = join(__dirname, '..', '..');
const ADMIN_URL = process.env.TEST_DATABASE_URL;
let testDatabaseUrl: string | undefined;

function databaseName(databaseUrl: string): string {
  const value = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!value) throw new Error('Test database URL does not name a database');
  return value;
}

function migrate(databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'bun',
      ['run', 'db:migrate', `--target-database=${databaseName(databaseUrl)}`, '--phase=all'],
      {
        cwd: PACKAGE_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Migration exited ${String(code)}:\n${output}`));
    });
  });
}

describe('real PostgreSQL schema', () => {
  it('cannot be silently skipped in CI', () => {
    if (process.env.CI) expect(ADMIN_URL).toBeTruthy();
  });
});

describe.if(Boolean(ADMIN_URL))('real PostgreSQL schema constraints', () => {
  beforeAll(async () => {
    if (!ADMIN_URL) throw new Error('TEST_DATABASE_URL is required');
    testDatabaseUrl = await createTestDatabase({ adminUrl: ADMIN_URL, driver: 'bun-sql', migrate });
    process.env.DATABASE_URL = testDatabaseUrl;
    await connectToDatabase();
  }, 30_000);

  afterAll(async () => {
    await closeDatabase();
    if (testDatabaseUrl) await dropTestDatabase(testDatabaseUrl, { driver: 'bun-sql' });
    delete process.env.DATABASE_URL;
  }, 30_000);

  it('runs on Bun.SQL, not postgres.js', () => {
    // A Bun.SQL instance is a plain function, so `instanceof SQL` cannot tell;
    // `beginDistributed` exists on Bun.SQL and not on a postgres.js `Sql`.
    expect(typeof Reflect.get(getDb().$client, 'beginDistributed')).toBe('function');
  });

  it('preserves source ids and cascades analytics with their post', async () => {
    const db = getDb();
    const postId = '507f1f77bcf86cd799439011';
    await db.insert(posts).values({ id: postId, userId: 'user-1', content: 'hello' });
    await db.insert(postAnalytics).values({
      id: '507f191e810c19729de860ea',
      postId,
      platform: 'mastodon',
    });
    await db.delete(posts).where(eq(posts.id, postId));
    const remaining = await db
      .select({ id: postAnalytics.id })
      .from(postAnalytics)
      .where(eq(postAnalytics.postId, postId));
    expect(remaining).toEqual([]);
  });

  it('enforces closed values and encrypted token envelopes', async () => {
    const db = getDb();
    // Drizzle queries are thenables, not Promises, and bun:test's `rejects`
    // only accepts a real Promise.
    await expect(
      Promise.resolve(
        db.execute(
          sql`insert into posts (id, user_id, content, status) values ('bad', 'u', 'x', 'other')`,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      Promise.resolve(
        db.execute(sql`
        insert into social_accounts (
          id, user_id, platform, platform_user_id, platform_username, access_token_ciphertext
        ) values ('account', 'u', 'mastodon', 'remote', 'name', 'plaintext')
      `),
      ),
    ).rejects.toThrow();
  });

  it('stores jsonb columns as the JSON they are, asked of the server', async () => {
    // A prepared Bun.SQL statement JSON-encodes the text drizzle's jsonb()
    // already stringified, so the row lands as a jsonb STRING; drizzle's reader
    // parses it back, so only the server can tell (see CLIENT_OPTIONS in db/index.ts).
    const db = getDb();
    const slots = [
      { dayOfWeek: 1, time: '09:00' },
      { dayOfWeek: 5, time: '17:30' },
    ];
    const preferences = { topics: ['bun', 'postgres'], digest: { weekly: true } };
    await db
      .insert(publishingSchedules)
      .values({ id: 'schedule-jsonb', userId: 'user-jsonb', name: 'weekdays', slots });
    await db
      .insert(userBehaviors)
      .values({ id: 'behavior-jsonb', oxyUserId: 'oxy-jsonb', preferences });

    const [stored] = await db.$client<
      { slots_type: string; first_time: string; preferences_type: string; weekly: boolean }[]
    >`
      select
        jsonb_typeof(s.slots) as slots_type,
        s.slots->0->>'time' as first_time,
        jsonb_typeof(b.preferences) as preferences_type,
        b.preferences @> '{"digest":{"weekly":true}}'::jsonb as weekly
      from publishing_schedules s, user_behaviors b
      where s.id = 'schedule-jsonb' and b.id = 'behavior-jsonb'
    `;
    expect(stored).toEqual({
      slots_type: 'array',
      first_time: '09:00',
      preferences_type: 'object',
      weekly: true,
    });

    await db
      .update(userBehaviors)
      .set({ preferences: { reset: true } })
      .where(eq(userBehaviors.id, 'behavior-jsonb'));
    const [updated] = await db.$client<{ type: string }[]>`
      select jsonb_typeof(preferences) as type from user_behaviors where id = 'behavior-jsonb'
    `;
    expect(updated?.type).toBe('object');
  });

  it('keeps one settings row per Oxy account', async () => {
    const db = getDb();
    await db.insert(userSettings).values({ id: 'settings-1', oxyUserId: 'oxy-user' });
    await expect(
      Promise.resolve(db.insert(userSettings).values({ id: 'settings-2', oxyUserId: 'oxy-user' })),
    ).rejects.toThrow();
  });
});
