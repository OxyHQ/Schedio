import { spawn } from "node:child_process";
import { join } from "node:path";
import { createTestDatabase, dropTestDatabase } from "@oxyhq/db/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, connectToDatabase, getDb } from "../db";
import { postAnalytics, posts, socialAccounts, userSettings } from "../db/schema";

const PACKAGE_ROOT = join(__dirname, "..", "..");
const ADMIN_URL = process.env.TEST_DATABASE_URL;
let testDatabaseUrl: string | undefined;

function databaseName(databaseUrl: string): string {
  const value = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!value) throw new Error("Test database URL does not name a database");
  return value;
}

function migrate(databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "bun",
      ["run", "db:migrate", `--target-database=${databaseName(databaseUrl)}`, "--phase=all"],
      {
        cwd: PACKAGE_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Migration exited ${String(code)}:\n${output}`));
    });
  });
}

describe("real PostgreSQL schema", () => {
  it("cannot be silently skipped in CI", () => {
    if (process.env.CI) expect(ADMIN_URL).toBeTruthy();
  });
});

describe.runIf(Boolean(ADMIN_URL))("real PostgreSQL schema constraints", () => {
  beforeAll(async () => {
    if (!ADMIN_URL) throw new Error("TEST_DATABASE_URL is required");
    testDatabaseUrl = await createTestDatabase({ adminUrl: ADMIN_URL, migrate });
    process.env.DATABASE_URL = testDatabaseUrl;
    await connectToDatabase();
  }, 30_000);

  afterAll(async () => {
    await closeDatabase();
    if (testDatabaseUrl) await dropTestDatabase(testDatabaseUrl);
    delete process.env.DATABASE_URL;
  }, 30_000);

  it("preserves source ids and cascades analytics with their post", async () => {
    const db = getDb();
    const postId = "507f1f77bcf86cd799439011";
    await db.insert(posts).values({ id: postId, userId: "user-1", content: "hello" });
    await db.insert(postAnalytics).values({
      id: "507f191e810c19729de860ea",
      postId,
      platform: "mastodon",
    });
    await db.delete(posts).where(eq(posts.id, postId));
    const remaining = await db
      .select({ id: postAnalytics.id })
      .from(postAnalytics)
      .where(eq(postAnalytics.postId, postId));
    expect(remaining).toEqual([]);
  });

  it("enforces closed values and encrypted token envelopes", async () => {
    const db = getDb();
    await expect(
      db.execute(sql`insert into posts (id, user_id, content, status) values ('bad', 'u', 'x', 'other')`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`
        insert into social_accounts (
          id, user_id, platform, platform_user_id, platform_username, access_token_ciphertext
        ) values ('account', 'u', 'mastodon', 'remote', 'name', 'plaintext')
      `),
    ).rejects.toThrow();
  });

  it("keeps one settings row per Oxy account", async () => {
    const db = getDb();
    await db.insert(userSettings).values({ id: "settings-1", oxyUserId: "oxy-user" });
    await expect(
      db.insert(userSettings).values({ id: "settings-2", oxyUserId: "oxy-user" }),
    ).rejects.toThrow();
  });
});
