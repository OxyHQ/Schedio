import { afterAll, beforeAll, beforeEach, expect, it } from 'bun:test';
import { OxyServer } from '@oxy.so/core/server';
import type { Request } from 'express';
import { scheduleAuthority } from '../publishing/taskAuthority';

let api: ReturnType<typeof Bun.serve>;
let oxy: OxyServer;
let membershipActive = true;
let mismatchedRoot = false;
const paths: string[] = [];
const personalToken = `e30.${Buffer.from(JSON.stringify({ sub: 'human', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url')}.fixture`;
const req = {
  accessToken: personalToken,
  oxyActor: { actorAccountId: 'human', effectiveAccountId: 'human', delegated: false },
} as unknown as Request;
const scope = { userId: 'human', organizationId: 'organization' };
beforeAll(() => {
  const now = Math.floor(Date.now() / 1000);
  const workload = `e30.${Buffer.from(JSON.stringify({ iat: now, exp: now + 300, authority: 'first_party' })).toString('base64url')}.fixture`;
  api = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path === '/accounts/organization/switch') {
        expect(request.headers.get('authorization')).toBe(`Bearer ${personalToken}`);
        return membershipActive
          ? Response.json({
              accessToken: 'managed-session',
              user: { id: 'organization', username: 'organization' },
            })
          : Response.json({ error: 'membership_revoked' }, { status: 403 });
      }
      if (path.endsWith('/challenge')) return Response.json({ nonce: 'fixture' });
      if (path === '/auth/service-token/workload') {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.protocolVersion).toBe(2);
        expect(body).not.toHaveProperty('scopes');
        return Response.json({ token: workload, expiresIn: 300 });
      }
      expect(request.headers.get('authorization')).toBe(`Bearer ${workload}`);
      if (request.method === 'DELETE') return Response.json({});
      expect(path).toBe('/capabilities/tasks');
      const body = (await request.json()) as Record<string, unknown>;
      expect(body.subjectToken).toBe('managed-session');
      expect(body.actor).toEqual({ type: 'requester', accountId: 'human' });
      expect(body.effectiveAccountId).toBe('organization');
      return Response.json({
        task: {
          id: 'publishing-task',
          requesterAccountId: 'human',
          effectiveAccountId: mismatchedRoot ? 'another-account' : 'organization',
        },
      });
    },
  });
  oxy = new OxyServer({
    baseURL: api.url.origin,
    workloadCredentials: async () => ({
      AccessKeyId: 'ASIA_TEST',
      SecretAccessKey: 'fixture',
      Token: 'temporary',
    }),
  });
});
beforeEach(() => {
  paths.length = 0;
  membershipActive = true;
  mismatchedRoot = false;
});
afterAll(() => {
  oxy.dispose();
  api.stop(true);
});
it('exchanges the selected organization through the canonical SDK and preserves the original operator', async () => {
  const authority = await scheduleAuthority(req, scope, oxy);
  expect(await authority.create('post', 1, new Date())).toBe('publishing-task');
  expect(paths[0]).toBe('/accounts/organization/switch');
  expect((req as unknown as { accessToken: string }).accessToken).toBe(personalToken);
});
it('revoked organization membership prevents a publishing task without substituting the owner', async () => {
  membershipActive = false;
  await expect(scheduleAuthority(req, scope, oxy)).rejects.toThrow();
  expect(paths).toEqual(['/accounts/organization/switch']);
});
it('a different effective root is revoked before scheduling', async () => {
  mismatchedRoot = true;
  const authority = await scheduleAuthority(req, scope, oxy);
  await expect(authority.create('post', 1, new Date())).rejects.toThrow('verified session');
  expect(paths.at(-1)).toBe('/capabilities/tasks/publishing-task');
});
