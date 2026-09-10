import { createDatabase, type OxyDatabase } from "@oxy.so/db";
import type postgres from "postgres";
import * as schema from "./schema";

export type SchedioDatabase = OxyDatabase<typeof schema>;
export type SchedioTransaction = Parameters<Parameters<SchedioDatabase["transaction"]>[0]>[0];
export type SchedioDatabaseOrTransaction = SchedioDatabase | SchedioTransaction;

let handle: { db: SchedioDatabase; client: postgres.Sql } | null = null;
let reachability: Promise<void> | null = null;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required");
  }
  return value;
}

export function getDb(): SchedioDatabase {
  if (!handle) {
    throw new Error("PostgreSQL is not connected — call connectToDatabase() during startup");
  }
  return handle.db;
}

export function connectToDatabase(): Promise<void> {
  if (!handle) {
    handle = createDatabase({ databaseUrl: databaseUrl(), schema });
  }
  reachability ??= handle.client`select 1`.then(
    () => undefined,
    (error: unknown) => {
      reachability = null;
      throw error;
    },
  );
  return reachability;
}

export function isDatabaseConnected(): boolean {
  return handle !== null && reachability !== null;
}

export async function closeDatabase(): Promise<void> {
  reachability = null;
  if (!handle) return;
  await handle.client.end();
  handle = null;
}

export { schema };
