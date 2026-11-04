import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';

/**
 * `authorize` asks Oxy — with the caller's own bearer — what they may do in the
 * organization, and `publishingErrors` turns the answer into a status: 401 for
 * a session Oxy no longer accepts, 403 for a definitive no, 503 when Oxy could
 * not say. Only a yes is remembered.
 */
type Mode = 'admin' | 'editor' | 'viewer' | 'personal' | 'denied' | 'missing' | 'expired' | 'down';
let mode: Mode = 'admin';
let reads = 0;
let oxyApi: ReturnType<typeof Bun.serve>;
let server: ReturnType<ReturnType<typeof express>['listen']>;
let url: string;

const PERMISSIONS = {
  admin: ['account:read', 'account:update', 'account:act_as'],
  editor: ['account:read', 'account:act_as'],
  viewer: ['account:read'],
} as const;

beforeAll(async () => {
  oxyApi = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      expect(request.headers.get('authorization')).toBe('Bearer person-session');
      expect(new URL(request.url).pathname).toBe('/accounts/org');
      reads += 1;
      switch (mode) {
        case 'denied':
          return Response.json({ error: 'forbidden' }, { status: 403 });
        case 'missing':
          return Response.json({ error: 'not_found' }, { status: 404 });
        case 'expired':
          return Response.json({ error: 'unauthorized' }, { status: 401 });
        case 'down':
          return Response.json({ error: 'unavailable' }, { status: 500 });
        default:
          return Response.json({
            account: {
              accountId: 'org',
              kind: mode === 'personal' ? 'personal' : 'organization',
              relationship: 'member',
              callerAccess: {
                role: mode === 'personal' ? 'admin' : mode,
                permissions: PERMISSIONS[mode === 'personal' ? 'admin' : mode],
                status: 'active',
                source: 'direct',
              },
            },
          });
      }
    },
  });
  process.env.OXY_API_URL = oxyApi.url.origin;
  const { authorize } = await import('../publishing/authority');
  const { publishingErrors, route } = await import('../publishing/errors');
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { userId: 'person', sessionId: 'session', accessToken: 'person-session' });
    next();
  });
  const answer = route(async (req, res) => {
    res.json(await authorize(req, 'org', req.query.reviewer === 'true'));
  });
  app.get('/scope', answer);
  app.post('/scope', answer);
  app.use(publishingErrors);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/scope`;
});
beforeEach(async () => {
  mode = 'admin';
  reads = 0;
  // Each case starts with nothing remembered.
  const { oxy } = await import('../oxy');
  oxy.invalidateAppPermissions();
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  oxyApi.stop(true);
});

async function ask(options: { method?: 'GET' | 'POST'; reviewer?: boolean } = {}) {
  const response = await fetch(`${url}${options.reviewer ? '?reviewer=true' : ''}`, {
    method: options.method ?? 'GET',
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('organization access for publishing', () => {
  it('admits a member who may act as the organization', async () => {
    mode = 'editor';
    expect(await ask()).toEqual({
      status: 200,
      body: { userId: 'person', organizationId: 'org' },
    });
  });
  it('requires account:update to review, on the permission, not the role name', async () => {
    mode = 'editor';
    expect((await ask({ method: 'POST', reviewer: true })).status).toBe(403);
    mode = 'admin';
    expect((await ask({ method: 'POST', reviewer: true })).status).toBe(200);
  });
  it('refuses a member without account:act_as, and a personal account', async () => {
    mode = 'viewer';
    expect((await ask()).status).toBe(403);
    mode = 'personal';
    expect((await ask()).status).toBe(403);
  });
  it('maps Oxy 403 and 404 to 403, and 401 to 401', async () => {
    mode = 'denied';
    expect(await ask()).toEqual({
      status: 403,
      body: { error: { code: 'forbidden', message: expect.any(String) } },
    });
    mode = 'missing';
    expect((await ask()).status).toBe(403);
    mode = 'expired';
    expect(await ask()).toEqual({
      status: 401,
      body: { error: { code: 'unauthorized', message: expect.any(String) } },
    });
  });
  it('answers an outage 503 and never remembers it as a no', async () => {
    mode = 'down';
    // The SDK retries a 5xx with backoff before calling it an outage.
    expect(await ask()).toEqual({
      status: 503,
      body: { error: { code: 'service_unavailable', message: expect.any(String) } },
    });
    const outageReads = reads;
    mode = 'editor';
    expect((await ask()).status).toBe(200);
    expect(reads).toBe(outageReads + 1);
  }, 30_000);
  it('reuses a yes for a read and asks fresh before a write', async () => {
    mode = 'editor';
    expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(200);
    expect(reads).toBe(1);
    mode = 'denied';
    expect((await ask({ method: 'POST' })).status).toBe(403);
    expect(reads).toBe(2);
  });
});
