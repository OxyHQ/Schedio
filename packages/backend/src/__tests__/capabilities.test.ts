import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { appCapabilityCatalogSchema } from '@oxy.so/contracts';
import { issueCapabilityTicket, verifyCapabilityTicket } from '@oxy.so/core/server';
import { SCHEDIO_CAPABILITY_CATALOG } from '../capabilities/schedio.catalog';
const execute = mock(async () => ({ draft: { id: 'draft-1', status: 'draft' } }));
mock.module('../capabilities/schedio.handlers', () => ({ executeSchedioCatalogTool: execute }));
mock.module('../capabilities/oxy-service-client.js', () => ({
  requiredOxyServiceToken: async () => 'test-service',
}));
const { default: router } = await import('../routes/capabilities');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'EdDSA' };
const originalFetch = globalThis.fetch;
let active = true;
let audits: unknown[] = [];
let server: ReturnType<ReturnType<typeof express>['listen']>;
let url: string;
function unsigned() {
  return {
    aud: 'oxy-schedio-api',
    sub: 'agent',
    runId: 'run',
    stepId: 'step',
    executionAuthorization: { kind: 'direct_request' as const, id: 'execution' },
    coordinator: { applicationId: 'alia', credentialId: 'credential' },
    requesterAccountId: 'owner',
    ownerAccountId: 'owner',
    actor: { type: 'agent' as const, accountId: 'agent' },
    resource: {
      appId: 'schedio',
      resourceType: 'schedio_account',
      resourceId: 'owner',
      effectiveAccountId: 'owner',
    },
    tool: 'createDraft',
    capabilities: ['publications.draft'],
    limits: [],
    autonomy: 'execute_on_request' as const,
  };
}
function ticket(overrides: Partial<ReturnType<typeof unsigned>> = {}) {
  return issueCapabilityTicket(
    { ...unsigned(), ...overrides },
    {
      privateKey,
      keyId: 'test-key',
      issuer: 'https://api.oxy.so',
      ttlSeconds: 60,
      jti: 'ticket-1',
    },
  );
}
const body = { content: 'Review me', platforms: ['destination'], idempotencyKey: 'operation-1' };
async function call(
  name = 'createDraft',
  authorization = `Capability ${ticket()}`,
  input: unknown = body,
) {
  return originalFetch(`${url}/${name}`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/_oxy/capabilities', router);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/_oxy/capabilities`;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const target = String(input);
    if (target.endsWith('/capabilities/.well-known/jwks.json'))
      return Response.json({ keys: [jwk] });
    if (target.endsWith('/capabilities/tickets/introspect')) {
      const sent = JSON.parse(String(init?.body));
      const claims = verifyCapabilityTicket(sent.ticket, {
        audience: 'oxy-schedio-api',
        issuer: 'https://api.oxy.so',
        resolvePublicKey: () => publicKey,
      });
      return Response.json({
        active,
        claims,
        decision: { allowed: active, reason: active ? 'authorized' : 'revoked' },
      });
    }
    if (target.endsWith('/capabilities/audit')) {
      audits.push(JSON.parse(String(init?.body)));
      return Response.json({});
    }
    throw new Error('Unexpected upstream request');
  }) as typeof fetch;
});
beforeEach(() => {
  active = true;
  audits = [];
  execute.mockClear();
});
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
describe('Schedio signed draft capabilities', () => {
  it('publishes a valid narrow catalog without approval/publish/schedule/finance tools', () => {
    expect(
      appCapabilityCatalogSchema.parse(SCHEDIO_CAPABILITY_CATALOG).tools.map((t) => t.name),
    ).toEqual(['listDestinations', 'createDraft']);
  });
  it('rejects user bearers and unauthenticated calls', async () => {
    expect((await call('createDraft', 'Bearer user-session')).status).toBe(401);
    expect((await call('createDraft', '')).status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });
  it('verifies the signature and exact audience', async () => {
    expect((await call('createDraft', `Capability ${ticket({ aud: 'wrong-app' })}`)).status).toBe(
      401,
    );
    const signed = ticket();
    expect((await call('createDraft', `Capability ${signed.slice(0, -10)}tamperedxx`)).status).toBe(
      401,
    );
    expect(execute).not.toHaveBeenCalled();
  });
  it('executes only current exact-account draft authority and audits the actor', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(execute).toHaveBeenCalledWith('createDraft', body, 'owner', 'agent');
    expect(audits).toHaveLength(1);
  });
  it('blocks revoked or missing grants despite an unexpired signed ticket', async () => {
    active = false;
    expect((await call()).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it('blocks wrong account, resource, tool and read-only capability', async () => {
    expect(
      (
        await call('createDraft', `Capability ${ticket()}`, {
          ...body,
          organizationId: 'another-org',
        })
      ).status,
    ).toBe(403);
    expect(
      (await call('createDraft', `Capability ${ticket({ capabilities: ['publications.read'] })}`))
        .status,
    ).toBe(403);
    expect(
      (await call('createDraft', `Capability ${ticket({ tool: 'listDestinations' })}`)).status,
    ).toBe(403);
    expect(
      (
        await call(
          'createDraft',
          `Capability ${ticket({ resource: { ...unsigned().resource, resourceId: 'another-account' } })}`,
        )
      ).status,
    ).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it('has no approval or delivery endpoints and refuses injected publish status', async () => {
    for (const name of ['approve', 'publish', 'schedule', 'book', 'pay'])
      expect((await call(name)).status).toBe(404);
    expect(
      (await call('createDraft', `Capability ${ticket()}`, { ...body, status: 'published' }))
        .status,
    ).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
});
