import { registerCapabilityCatalog } from '@oxy.so/mcp';

import { SCHEDIO_CAPABILITY_CATALOG } from './capabilities/schedio.catalog';
import { oxy } from './oxy';

async function main(): Promise<void> {
  const transport = oxy.createServiceClient({ baseURL: oxy.baseURL, audience: 'oxy-api' });
  try {
    const binding = await registerCapabilityCatalog(SCHEDIO_CAPABILITY_CATALOG, {
      transport,
      oxyApiUrl: oxy.baseURL,
      timeoutMs: 15_000,
    });
    process.stdout.write(
      `Registered Schedio capability catalog ${binding.version} (${binding.digest})\n`,
    );
  } finally {
    transport.dispose();
    oxy.dispose();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
