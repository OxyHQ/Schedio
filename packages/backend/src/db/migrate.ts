import { join } from "node:path";
import {
  MIGRATION_RUNS,
  type MigrationRun,
  readTargetDatabase,
  runMigrations,
} from "@oxyhq/db/migrate";

const PACKAGE_ROOT = join(__dirname, "..", "..");

function readPhase(argv: readonly string[]): MigrationRun {
  const flag = argv.find((argument) => argument.startsWith("--phase="));
  if (!flag) {
    throw new Error(`--phase is required. Use one of: ${MIGRATION_RUNS.join(", ")}.`);
  }
  const value = flag.slice("--phase=".length);
  if (!(MIGRATION_RUNS as readonly string[]).includes(value)) {
    throw new Error(`Unrecognised migration phase: ${value}`);
  }
  return value as MigrationRun;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const run = readPhase(argv);
  const expectedDatabase = readTargetDatabase(argv);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  await runMigrations({
    databaseUrl,
    migrationsFolder: join(PACKAGE_ROOT, "drizzle"),
    extensions: [],
    run,
    expectedDatabase,
    dryRun: argv.includes("--dry-run"),
    logger: {
      info: (message) => console.info(message),
      debug: (message) => console.debug(message),
    },
  });
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
