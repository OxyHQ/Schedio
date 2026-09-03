import { describe, expect, it } from "vitest";
import { assertDistinctDatabaseNames, parseManifest } from "../db/importLegacyJsonl";

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

function manifest(): Record<string, unknown> {
  return {
    formatVersion: 1,
    sourceDatabase: "schedio-production",
    collections: Object.fromEntries(
      COLLECTIONS.map((name) => [
        name,
        { file: `${name}.jsonl`, count: 0, sha256: "ab".repeat(32) },
      ]),
    ),
  };
}

describe("legacy import manifest", () => {
  it("accepts only the exact filename for each closed collection", () => {
    expect(parseManifest(manifest()).sourceDatabase).toBe("schedio-production");

    const altered = manifest() as {
      collections: Record<string, { file: string }>;
    };
    altered.collections.posts.file = "../posts.jsonl";
    expect(() => parseManifest(altered)).toThrow("manifest.json collection posts is invalid");
  });

  it("rejects additional collections", () => {
    const altered = manifest() as { collections: Record<string, unknown> };
    altered.collections.unreviewed = {
      file: "unreviewed.jsonl",
      count: 0,
      sha256: "ab".repeat(32),
    };
    expect(() => parseManifest(altered)).toThrow("unexpected collection");
  });

  it("requires a named source that differs from the PostgreSQL target", () => {
    const unnamed = manifest();
    unnamed.sourceDatabase = "";
    expect(() => parseManifest(unnamed)).toThrow("formatVersion/sourceDatabase is invalid");
    expect(() =>
      assertDistinctDatabaseNames("schedio-production", "schedio-production"),
    ).toThrow("must have distinct database names");
    expect(() =>
      assertDistinctDatabaseNames("schedio-production", "schedio-postgres"),
    ).not.toThrow();
  });
});
