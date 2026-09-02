import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabase, dropTestDatabase } from "@oxyhq/db/testing";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(__dirname, "..", "..");
const ADMIN_URL = process.env.TEST_DATABASE_URL;
const COLLECTIONS = [
  "blocks",
  "posts",
  "postanalytics",
  "publishingschedules",
  "restricts",
  "socialaccounts",
  "userbehaviors",
  "usersettings",
] as const;
let testDatabaseUrl: string | undefined;
let sourceDirectory: string | undefined;

function databaseName(databaseUrl: string): string {
  const value = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!value) throw new Error("Test database URL does not name a database");
  return value;
}

function command(args: readonly string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", [...args], {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Command exited ${String(code)}:\n${output}`));
    });
  });
}

function fixture(id: string, fields: Record<string, unknown>): string {
  return `${JSON.stringify({
    _id: { $oid: id },
    ...fields,
    createdAt: { $date: "2026-08-31T10:00:00.000Z" },
    updatedAt: { $date: "2026-09-01T10:00:00.000Z" },
  })}\n`;
}

describe.runIf(Boolean(ADMIN_URL))("legacy import transaction", () => {
  beforeAll(async () => {
    if (!ADMIN_URL) throw new Error("TEST_DATABASE_URL is required");
    testDatabaseUrl = await createTestDatabase({
      adminUrl: ADMIN_URL,
      migrate: async (databaseUrl) => {
        await command(
          [
            "run",
            "db:migrate",
            `--target-database=${databaseName(databaseUrl)}`,
            "--phase=all",
          ],
          { DATABASE_URL: databaseUrl },
        );
      },
    });
    sourceDirectory = await mkdtemp(join(tmpdir(), "schedio-import-"));
    const postId = "507f1f77bcf86cd799439011";
    const files: Record<(typeof COLLECTIONS)[number], string> = {
      blocks: "",
      posts: fixture(postId, {
        userId: "oxy-user",
        content: "scheduled post",
        media: [],
        platforms: [{ $oid: "507f191e810c19729de860ea" }],
        status: "scheduled",
        hashtags: ["launch"],
        retryCount: { $numberInt: "0" },
      }),
      postanalytics: fixture("507f191e810c19729de860eb", {
        postId: { $oid: postId },
        platform: "mastodon",
        metrics: { likes: { $numberInt: "4" } },
      }),
      publishingschedules: "",
      restricts: "",
      socialaccounts: fixture("507f191e810c19729de860ea", {
        userId: "oxy-user",
        platform: "mastodon",
        platformUserId: "remote-user",
        platformUsername: "nate",
        accessToken: "source-access-token",
        refreshToken: "source-refresh-token",
      }),
      userbehaviors: "",
      usersettings: fixture("507f191e810c19729de860ec", {
        oxyUserId: "oxy-user",
        privacy: { allowallos: false },
      }),
    };
    await Promise.all(
      COLLECTIONS.map((name) => writeFile(join(sourceDirectory as string, `${name}.jsonl`), files[name])),
    );
    await command(
      [
        "run",
        "db:build-import-manifest",
        `--source-dir=${sourceDirectory}`,
        "--source-database=schedio-test-source",
      ],
      {},
    );
  }, 30_000);

  afterAll(async () => {
    if (testDatabaseUrl) await dropTestDatabase(testDatabaseUrl);
    if (sourceDirectory) await rm(sourceDirectory, { recursive: true, force: true });
  }, 30_000);

  it("imports once, verifies ids/counts, and encrypts tokens", async () => {
    if (!testDatabaseUrl || !sourceDirectory) throw new Error("Test setup is incomplete");
    const environment = {
      DATABASE_URL: testDatabaseUrl,
      SOCIAL_TOKEN_ENCRYPTION_KEY: "ef".repeat(32),
    };
    const args = [
      "run",
      "db:import-legacy",
      `--source-dir=${sourceDirectory}`,
      `--target-database=${databaseName(testDatabaseUrl)}`,
    ];
    await expect(command(args, environment)).resolves.toContain("schedio-test-source");

    const client = postgres(testDatabaseUrl);
    const postRows = await client<{ id: string }[]>`select id from posts`;
    const accountRows = await client<{ accessTokenCiphertext: string }[]>`
      select access_token_ciphertext as "accessTokenCiphertext" from social_accounts
    `;
    expect(postRows).toEqual([{ id: "507f1f77bcf86cd799439011" }]);
    expect(accountRows[0]?.accessTokenCiphertext.startsWith("v1:")).toBe(true);
    expect(accountRows[0]?.accessTokenCiphertext).not.toContain("source-access-token");
    await client.end();

    await expect(command(args, environment)).rejects.toThrow("Target is not empty");
  }, 30_000);
});
