import { expect, test } from 'bun:test';
import { PrivacyRequestEpoch } from '../privacy-request-epoch';

test('late HTTP privacy from another account cannot replace the current account after a switch', async () => {
  let account: string | null = 'alice';
  let release: () => void = () => {};
  let reached: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const api = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === '/alice') {
        reached();
        await held;
      }
      return Response.json({
        blockedUsers: [path === '/alice' ? 'alice-private-block' : 'bob-private-block'],
      });
    },
  });
  const boundary = new PrivacyRequestEpoch(() => account);
  const load = (id: string) =>
    boundary.load(id, async () => (await fetch(new URL(`/${id}`, api.url))).json());
  try {
    const alice = load('alice');
    await started;
    account = 'bob';
    boundary.invalidate();
    expect(await load('bob')).toEqual({ blockedUsers: ['bob-private-block'] });
    release();
    expect(await alice).toBeUndefined();
    let wrongAccountCalls = 0;
    expect(
      await boundary.load('alice', async () => {
        wrongAccountCalls++;
        return {};
      }),
    ).toBeUndefined();
    expect(wrongAccountCalls).toBe(0);
  } finally {
    release();
    api.stop(true);
  }
});

test('logout and reauthentication to the same account reject the old session reply', async () => {
  let account: string | null = 'alice';
  const boundary = new PrivacyRequestEpoch(() => account);
  let release: (value: { hiddenWords: string[] }) => void = () => {};
  const old = boundary.load(
    'alice',
    () =>
      new Promise<{ hiddenWords: string[] }>((resolve) => {
        release = resolve;
      }),
  );
  account = null;
  boundary.invalidate();
  account = 'alice';
  boundary.invalidate();
  release({ hiddenWords: ['old-session-private-word'] });
  expect(await old).toBeUndefined();
  expect(await boundary.load('alice', async () => ({ hiddenWords: ['current'] }))).toEqual({
    hiddenWords: ['current'],
  });
});
