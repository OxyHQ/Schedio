import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const SELF = "packages/backend/src/__tests__/postgresOnly.test.ts";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const FORBIDDEN_DEPENDENCY = /^(@types\/)?(mongoose|mongodb|bson)(-[\w.-]+)?$/;
const FORBIDDEN_RUNTIME_TOKENS = ["mongoose", "mongodb://", "mongodb+srv://", "MONGODB_URI"];

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

export function stripComments(source: string): string {
  type Mode = "code" | "line" | "block" | "single" | "double" | "template";
  let mode: Mode = "code";
  let result = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (mode === "code") {
      if (character === "/" && next === "/") {
        mode = "line";
        index += 1;
      } else if (character === "/" && next === "*") {
        mode = "block";
        index += 1;
      } else {
        if (character === "'") mode = "single";
        if (character === '"') mode = "double";
        if (character === "`") mode = "template";
        result += character;
      }
      continue;
    }
    if (mode === "line") {
      if (character === "\n") {
        mode = "code";
        result += character;
      }
      continue;
    }
    if (mode === "block") {
      if (character === "*" && next === "/") {
        mode = "code";
        index += 1;
      } else if (character === "\n") {
        result += character;
      }
      continue;
    }
    result += character;
    if (character === "\\") {
      index += 1;
      result += source[index] ?? "";
      continue;
    }
    if (
      (mode === "single" && character === "'") ||
      (mode === "double" && character === '"') ||
      (mode === "template" && character === "`")
    ) {
      mode = "code";
    }
  }
  return result;
}

describe("PostgreSQL-only runtime", () => {
  const files = trackedFiles();

  it("enumerates enough tracked files to make the scan meaningful", () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files).toContain(SELF);
  });

  it("has no driver dependency in any manifest or the lockfile", () => {
    const manifests = files.filter((path) => path === "package.json" || path.endsWith("/package.json"));
    expect(manifests.length).toBeGreaterThanOrEqual(4);
    const offenders: string[] = [];
    for (const path of manifests) {
      const manifest = JSON.parse(read(path)) as Record<string, unknown>;
      for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const dependencies = manifest[field];
        if (typeof dependencies !== "object" || dependencies === null) continue;
        for (const name of Object.keys(dependencies)) {
          if (FORBIDDEN_DEPENDENCY.test(name)) offenders.push(`${path}:${field}.${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    const lockfile = read("bun.lock");
    expect(lockfile.length).toBeGreaterThan(1000);
    expect([...lockfile.matchAll(/"(@types\/)?(mongoose|mongodb|mongodb-memory-server)[@"]?/g)])
      .toEqual([]);
  });

  it("has no executable driver, URI, or legacy environment reference", () => {
    const sources = files.filter(
      (path) => SOURCE_EXTENSIONS.has(extname(path)) && path !== SELF,
    );
    expect(sources.length).toBeGreaterThan(200);
    const offenders: string[] = [];
    for (const path of sources) {
      const code = stripComments(read(path));
      for (const token of FORBIDDEN_RUNTIME_TOKENS) {
        if (code.includes(token)) offenders.push(`${path}:${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no legacy database configuration in deploy inputs", () => {
    const paths = files.filter(
      (path) =>
        path === ".do/app.yaml" ||
        path.endsWith("Dockerfile") ||
        /^\.github\/workflows\/.*\.ya?ml$/.test(path),
    );
    expect(paths.length).toBeGreaterThanOrEqual(3);
    const offenders = paths.flatMap((path) =>
      FORBIDDEN_RUNTIME_TOKENS.filter((token) => read(path).includes(token)).map(
        (token) => `${path}:${token}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the gate can distinguish executable code from prose", () => {
  it("keeps a real import and environment read", () => {
    expect(stripComments('import mongoose from "mongoose";')).toContain("mongoose");
    expect(stripComments("const uri = process.env.MONGODB_URI;")).toContain("MONGODB_URI");
  });

  it("removes line, block, and documentation comments", () => {
    expect(stripComments('// import mongoose from "mongoose";')).not.toContain("mongoose");
    expect(stripComments("/* MONGODB_URI */ const value = 1;")).not.toContain("MONGODB_URI");
    expect(stripComments("/** mongodb://old */\nconst value = 1;")).not.toContain("mongodb://");
  });
});
