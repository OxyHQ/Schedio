import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(
  await readFile(new URL('../vendor/manifest.json', import.meta.url), 'utf8'),
) as { artifacts: { file: string; sha256: string }[] };
const lock = await readFile(new URL('../bun.lock', import.meta.url), 'utf8');
for (const artifact of manifest.artifacts) {
  const data = await readFile(new URL(`../vendor/${artifact.file}`, import.meta.url));
  if (createHash('sha256').update(data).digest('hex') !== artifact.sha256)
    throw new Error(`Artifact changed: ${artifact.file}`);
  if (!lock.includes(`sha512-${createHash('sha512').update(data).digest('base64')}`))
    throw new Error(`Lockfile integrity mismatch: ${artifact.file}`);
}
console.log(
  `Verified ${manifest.artifacts.length} Mention publishing artifacts and lockfile digests`,
);
