#!/usr/bin/env bun
/**
 * Every bun this repository runs is the bun the root `packageManager` pins.
 *
 * `packageManager: "bun@x.y.z"` is the one pin. CI's setup-bun reads it through
 * `bun-version-file: package.json`, but a Dockerfile `FROM` cannot read JSON, so
 * the image tag is a literal. A bump that misses it builds the image with a
 * different bun from the one that wrote bun.lock and that CI tested with: the
 * image's `--frozen-lockfile` then either fails in the deploy or, worse, passes
 * on a bun nobody tested.
 *
 * Checked:
 *  - every tracked Dockerfile's `FROM oven/bun:<tag>` stage (an untagged image
 *    is `latest`, which is never the pin), and at least one such stage exists;
 *  - every literal `bun-version:` left in a workflow.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const tracked = (...patterns) =>
  execFileSync('git', ['ls-files', '--', ...patterns], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

const pinned = /^bun@(\d+\.\d+\.\d+)$/.exec(
  String(JSON.parse(read('package.json')).packageManager ?? ''),
)?.[1];
if (!pinned) {
  console.error('::error::root package.json must pin `packageManager` as bun@<x.y.z>.');
  process.exit(1);
}

const errors = [];

let stages = 0;
for (const path of tracked('**/Dockerfile', '**/Dockerfile.*', 'Dockerfile', 'Dockerfile.*')) {
  for (const raw of read(path).split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    const m = /^FROM\s+(?:--\S+\s+)*oven\/bun(?::(\S+))?/i.exec(line);
    if (!m) continue;
    stages += 1;
    const tag = m[1] ?? 'latest';
    if (tag.split('-')[0] !== pinned) {
      errors.push(`${path} builds on oven/bun:${tag}, but package.json pins bun@${pinned}.`);
    }
  }
}
if (stages === 0) {
  errors.push(
    'found no `FROM oven/bun` stage in any Dockerfile; the image pin check measured nothing.',
  );
}

let literals = 0;
for (const path of tracked('.github/workflows/*.yml', '.github/workflows/*.yaml')) {
  for (const [, version] of read(path).matchAll(/^\s*bun-version:\s*["']?([^"'\s#]+)/gm)) {
    literals += 1;
    if (version !== pinned) {
      errors.push(`${path} sets bun-version ${version}, but package.json pins bun@${pinned}.`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}

console.log(
  `bun pin is consistent: ${stages} oven/bun stage(s) and ${literals} literal workflow ` +
    `bun-version(s) agree with bun@${pinned}.`,
);
