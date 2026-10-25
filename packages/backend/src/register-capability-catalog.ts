import { appCapabilityCatalogSchema } from '@oxy.so/contracts';

import { SCHEDIO_CAPABILITY_CATALOG } from './capabilities/schedio.catalog.js';
import { oxyAuthorityTransport } from './capabilities/oxy-service-client.js';

const OXY_API_URL = (process.env.OXY_API_URL ?? 'https://api.oxy.so').replace(/\/$/, '');

async function main(): Promise<void> {
  const catalog = appCapabilityCatalogSchema.parse(SCHEDIO_CAPABILITY_CATALOG);
  const transport = oxyAuthorityTransport();
  const response = await transport
    .fetch(`${OXY_API_URL}/capabilities/catalogs/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ catalog, deployedAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(15_000),
    })
    .finally(() => transport.dispose());
  if (!response.ok) {
    throw new Error(`Schedio capability catalog registration failed (${response.status})`);
  }
  const body = (await response.json()) as { registration?: { digest?: string } };
  const digest = body.registration?.digest;
  if (typeof digest !== 'string' || digest.length === 0) {
    throw new Error('Schedio capability catalog registration returned no digest');
  }
  process.stdout.write(`Registered Schedio capability catalog ${catalog.version} (${digest})\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
