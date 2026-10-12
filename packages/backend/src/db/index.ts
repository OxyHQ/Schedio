import { type BunSqlClient, createDatabase, type OxyBunSqlDatabase } from '@oxy.so/db';
import * as schema from './schema';

export type SchedioDatabase = OxyBunSqlDatabase<typeof schema>;
export type SchedioTransaction = Parameters<Parameters<SchedioDatabase['transaction']>[0]>[0];
export type SchedioDatabaseOrTransaction = SchedioDatabase | SchedioTransaction;

let handle: { db: SchedioDatabase; client: BunSqlClient } | null = null;

/**
 * The backend runs on Bun, so it uses Bun's built-in client (`Bun.SQL`).
 *
 * These are the postgres.js defaults the backend ran on before, under Bun's
 * option names. Bun's own defaults already match them, except `maxLifetime`:
 * Bun never recycles a connection unless told, so this uses postgres.js's own
 * default, a random 30 to 60 minutes. TLS stays with the URL's `sslmode`, which
 * both clients read the same way (measured).
 *
 * One difference cannot be configured away: postgres.js opens connections as
 * load needs them, and Bun 1.4.3 opens all `max` of them on the first query and
 * keeps them with `idleTimeout: 0`. A task holds 10 connections from its first
 * request, which is the ceiling it could already reach.
 */
const CLIENT_OPTIONS = {
  max: 10,
  idleTimeout: 0,
  maxLifetime: 60 * (30 + Math.random() * 30),
  connectionTimeout: 30,
  prepare: true,
};
let reachability: Promise<void> | null = null;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_URL is required');
  }
  return value;
}

export function getDb(): SchedioDatabase {
  if (!handle) {
    throw new Error('PostgreSQL is not connected — call connectToDatabase() during startup');
  }
  return handle.db;
}

export function connectToDatabase(): Promise<void> {
  if (!handle) {
    handle = createDatabase({
      databaseUrl: databaseUrl(),
      schema,
      driver: 'bun-sql',
      client: CLIENT_OPTIONS,
    });
  }
  // Bun.SQL's query is a thenable, not a Promise; the callers want a Promise.
  reachability ??= Promise.resolve(handle.client`select 1`).then(
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
  await handle.client.close();
  handle = null;
}

export { schema };
