import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { closeDatabase, connectToDatabase, getDb, type SchedioDatabaseOrTransaction } from ".";
import {
  transformBlock,
  transformPost,
  transformPostAnalytics,
  transformPublishingSchedule,
  transformRestrict,
  transformSocialAccount,
  transformUserBehavior,
  transformUserSettings,
} from "./legacyTransform";
import {
  blocks,
  postAnalytics,
  posts,
  publishingSchedules,
  restricts,
  socialAccounts,
  userBehaviors,
  userSettings,
} from "./schema";
import { validateTokenCipherConfiguration } from "../utils/tokenCipher";

const COLLECTION_NAMES = [
  "blocks",
  "posts",
  "postanalytics",
  "publishingschedules",
  "restricts",
  "socialaccounts",
  "userbehaviors",
  "usersettings",
] as const;
type CollectionName = (typeof COLLECTION_NAMES)[number];

interface CollectionManifest {
  readonly file: string;
  readonly count: number;
  readonly sha256: string;
}

interface ImportManifest {
  readonly formatVersion: 1;
  readonly sourceDatabase: string;
  readonly collections: Record<CollectionName, CollectionManifest>;
}

function argument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

function targetDatabase(databaseUrl: string): string {
  const value = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!value) throw new Error("DATABASE_URL does not name a database");
  return value;
}

export function parseManifest(value: unknown): ImportManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("manifest.json must contain an object");
  }
  const manifest = value as Record<string, unknown>;
  if (
    manifest.formatVersion !== 1 ||
    typeof manifest.sourceDatabase !== "string" ||
    manifest.sourceDatabase.length === 0
  ) {
    throw new Error("manifest.json formatVersion/sourceDatabase is invalid");
  }
  if (typeof manifest.collections !== "object" || manifest.collections === null) {
    throw new Error("manifest.json collections is invalid");
  }
  const collectionRecord = manifest.collections as Record<string, unknown>;
  const collections: Partial<Record<CollectionName, CollectionManifest>> = {};
  for (const name of COLLECTION_NAMES) {
    const raw = collectionRecord[name];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error(`manifest.json is missing collection ${name}`);
    }
    const entry = raw as Record<string, unknown>;
    if (
      entry.file !== `${name}.jsonl` ||
      !Number.isSafeInteger(entry.count) ||
      (entry.count as number) < 0 ||
      typeof entry.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(entry.sha256)
    ) {
      throw new Error(`manifest.json collection ${name} is invalid`);
    }
    collections[name] = {
      file: entry.file,
      count: entry.count as number,
      sha256: entry.sha256,
    };
  }
  if (Object.keys(collectionRecord).length !== COLLECTION_NAMES.length) {
    throw new Error("manifest.json contains an unexpected collection");
  }
  return {
    formatVersion: 1,
    sourceDatabase: manifest.sourceDatabase,
    collections: collections as Record<CollectionName, CollectionManifest>,
  };
}

export function assertDistinctDatabaseNames(sourceDatabase: string, targetDatabase: string): void {
  if (sourceDatabase === targetDatabase) {
    throw new Error("Legacy source and PostgreSQL target must have distinct database names");
  }
}

function loadJsonLines(sourceDirectory: string, entry: CollectionManifest): unknown[] {
  const path = resolve(sourceDirectory, entry.file);
  if (!path.startsWith(`${resolve(sourceDirectory)}/`)) {
    throw new Error(`manifest file escapes the source directory: ${entry.file}`);
  }
  const bytes = readFileSync(path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== entry.sha256) throw new Error(`SHA-256 mismatch for ${entry.file}`);
  const lines = bytes
    .toString("utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length !== entry.count) {
    throw new Error(`Count mismatch for ${entry.file}: expected ${entry.count}, read ${lines.length}`);
  }
  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${entry.file}:${index + 1} is invalid JSON: ${message}`);
    }
  });
}

function batches<T>(values: readonly T[], size = 250): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function rowCount<T extends PgTable>(
  db: SchedioDatabaseOrTransaction,
  table: T,
): Promise<number> {
  const rows = await db.execute(sql<{ value: number }>`select count(*)::int as value from ${table}`);
  const value = Number(rows[0]?.value);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid target row count");
  return value;
}

async function main(): Promise<void> {
  const sourceDirectory = resolve(argument("source-dir"));
  const expectedTarget = argument("target-database");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (targetDatabase(databaseUrl) !== expectedTarget) {
    throw new Error("DATABASE_URL does not match --target-database");
  }

  const manifest = parseManifest(
    JSON.parse(readFileSync(resolve(sourceDirectory, "manifest.json"), "utf8")) as unknown,
  );
  assertDistinctDatabaseNames(manifest.sourceDatabase, expectedTarget);
  const documents = Object.fromEntries(
    COLLECTION_NAMES.map((name) => [name, loadJsonLines(sourceDirectory, manifest.collections[name])]),
  ) as Record<CollectionName, unknown[]>;

  validateTokenCipherConfiguration();
  const rows = {
    blocks: documents.blocks.map(transformBlock),
    posts: documents.posts.map(transformPost),
    postanalytics: documents.postanalytics.map(transformPostAnalytics),
    publishingschedules: documents.publishingschedules.map(transformPublishingSchedule),
    restricts: documents.restricts.map(transformRestrict),
    socialaccounts: documents.socialaccounts.map(transformSocialAccount),
    userbehaviors: documents.userbehaviors.map(transformUserBehavior),
    usersettings: documents.usersettings.map(transformUserSettings),
  };

  await connectToDatabase();
  await getDb().transaction(async (tx) => {
    // Counts are a safety boundary, so keep every runtime writer out between
    // the initial empty-target check and the final reconciliation. The runbook
    // still freezes writers; this lock makes an accidental concurrent start
    // block instead of slipping a row in after the last count.
    await tx.execute(sql.raw(`
      lock table
        blocks,
        posts,
        post_analytics,
        publishing_schedules,
        restricts,
        social_accounts,
        user_behaviors,
        user_settings
      in access exclusive mode
    `));
    const targetCounts = {
      blocks: await rowCount(tx, blocks),
      posts: await rowCount(tx, posts),
      postanalytics: await rowCount(tx, postAnalytics),
      publishingschedules: await rowCount(tx, publishingSchedules),
      restricts: await rowCount(tx, restricts),
      socialaccounts: await rowCount(tx, socialAccounts),
      userbehaviors: await rowCount(tx, userBehaviors),
      usersettings: await rowCount(tx, userSettings),
    };
    const nonEmpty = Object.entries(targetCounts).filter(([, value]) => value !== 0);
    if (nonEmpty.length > 0) {
      throw new Error(`Target is not empty: ${JSON.stringify(Object.fromEntries(nonEmpty))}`);
    }

    for (const batch of batches(rows.socialaccounts)) await tx.insert(socialAccounts).values(batch);
    for (const batch of batches(rows.posts)) await tx.insert(posts).values(batch);
    for (const batch of batches(rows.postanalytics)) await tx.insert(postAnalytics).values(batch);
    for (const batch of batches(rows.publishingschedules)) {
      await tx.insert(publishingSchedules).values(batch);
    }
    for (const batch of batches(rows.blocks)) await tx.insert(blocks).values(batch);
    for (const batch of batches(rows.restricts)) await tx.insert(restricts).values(batch);
    for (const batch of batches(rows.userbehaviors)) await tx.insert(userBehaviors).values(batch);
    for (const batch of batches(rows.usersettings)) await tx.insert(userSettings).values(batch);

    const importedCounts = {
      blocks: await rowCount(tx, blocks),
      posts: await rowCount(tx, posts),
      postanalytics: await rowCount(tx, postAnalytics),
      publishingschedules: await rowCount(tx, publishingSchedules),
      restricts: await rowCount(tx, restricts),
      socialaccounts: await rowCount(tx, socialAccounts),
      userbehaviors: await rowCount(tx, userBehaviors),
      usersettings: await rowCount(tx, userSettings),
    };
    for (const name of COLLECTION_NAMES) {
      if (importedCounts[name] !== manifest.collections[name].count) {
        throw new Error(
          `Imported count mismatch for ${name}: expected ${manifest.collections[name].count}, got ${importedCounts[name]}`,
        );
      }
    }
  });

  console.info(`Imported and verified source database ${manifest.sourceDatabase}`);
}

if (require.main === module) {
  main().then(
    async () => {
      await closeDatabase();
      process.exit(0);
    },
    async (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      await closeDatabase();
      process.exit(1);
    },
  );
}
