import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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

function argument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

function main(): void {
  const sourceDirectory = resolve(argument("source-dir"));
  const sourceDatabase = argument("source-database");
  const collections = Object.fromEntries(
    COLLECTION_NAMES.map((name) => {
      const file = `${name}.jsonl`;
      const bytes = readFileSync(resolve(sourceDirectory, file));
      const count = bytes
        .toString("utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0).length;
      return [
        name,
        {
          file,
          count,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      ];
    }),
  );
  writeFileSync(
    resolve(sourceDirectory, "manifest.json"),
    `${JSON.stringify({ formatVersion: 1, sourceDatabase, collections }, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.info(`Wrote manifest for ${sourceDatabase}`);
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
