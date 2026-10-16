import { readFile } from 'node:fs/promises';
import { MentionPublishingClient } from '@oxy.so/mention-sdk';

const manifest = JSON.parse(
  await readFile(new URL('../docs/publishing-sdk-provenance.json', import.meta.url), 'utf8'),
) as { packages: Record<string, { version: string; integrity: string }> };
const lock = await readFile(new URL('../bun.lock', import.meta.url), 'utf8');
for (const [name, pkg] of Object.entries(manifest.packages)) {
  if (!lock.includes(`${name}@${pkg.version}`) || !lock.includes(pkg.integrity))
    throw new Error(`Published package or registry integrity mismatch: ${name}`);
}
if (typeof MentionPublishingClient !== 'function') throw new Error('Mention SDK export missing');
console.log('Verified published Mention packages, SDK export and registry lockfile digests');
