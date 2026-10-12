import { afterEach, beforeEach, describe, expect, it, type Mock, mock, spyOn } from 'bun:test';

const publisher = {
  observeHttp: mock((_req: unknown, _res: unknown, next: () => void) => next()),
  installFetch: mock(),
  observeSocket: mock(),
  stop: mock(async () => {}),
};
const create = mock((_options: unknown) => publisher);
mock.module('@oxy.so/core/server', () => ({ createEcosystemTraffic: create }));

// mock.module is not hoisted, so the module under test is loaded only after the
// mock above is registered. `require` rather than `import()`: this package is
// CommonJS, and under node16 resolution tsc demands an explicit extension on a
// dynamic import.
const {
  ecosystemActivityMiddleware,
  observeEcosystemSocket,
  startEcosystemActivity,
  stopEcosystemActivity,
} = require('../ecosystemActivity') as typeof import('../ecosystemActivity');

const STUBBED_ENV = [
  'OXY_ECOSYSTEM_ACTIVITY_ENABLED',
  'OXY_SERVICE_API_KEY',
  'OXY_SERVICE_API_SECRET',
] as const;
let originalEnv: Record<string, string | undefined> = {};

function stubEnv(name: (typeof STUBBED_ENV)[number], value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('ecosystem activity lifecycle', () => {
  let warn: Mock<typeof console.warn>;
  beforeEach(() => {
    originalEnv = Object.fromEntries(STUBBED_ENV.map((name) => [name, process.env[name]]));
    stubEnv('OXY_ECOSYSTEM_ACTIVITY_ENABLED', 'true');
    stubEnv('OXY_SERVICE_API_KEY', 'test-key');
    stubEnv('OXY_SERVICE_API_SECRET', 'test-secret');
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    mock.clearAllMocks();
  });
  afterEach(async () => {
    await stopEcosystemActivity();
    for (const name of STUBBED_ENV) stubEnv(name, originalEnv[name]);
    warn.mockRestore();
  });

  it('does not start or publish when explicitly disabled', () => {
    stubEnv('OXY_ECOSYSTEM_ACTIVITY_ENABLED', 'false');
    startEcosystemActivity(() => true);
    expect(create).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    const next = mock();
    ecosystemActivityMiddleware({} as never, {} as never, next);
    observeEcosystemSocket({} as never);
    expect(next).toHaveBeenCalledTimes(1);
    expect(publisher.observeSocket).not.toHaveBeenCalled();
  });

  it('makes missing activation visible without starting a publisher', () => {
    stubEnv('OXY_ECOSYSTEM_ACTIVITY_ENABLED', undefined);
    startEcosystemActivity(() => true);
    expect(create).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('rejects a misspelled activation instead of silently losing coverage', () => {
    stubEnv('OXY_ECOSYSTEM_ACTIVITY_ENABLED', 'tru');
    expect(() => startEcosystemActivity(() => true)).toThrow('must be true or false');
  });

  it('fails boot when the shared collector rejects its configuration', () => {
    create.mockImplementationOnce(() => {
      throw new Error('Invalid infrastructure region');
    });
    expect(() => startEcosystemActivity(() => true)).toThrow('Invalid infrastructure region');
    expect(publisher.installFetch).not.toHaveBeenCalled();
  });

  it('installs once and supplies live readiness without retaining request bodies', async () => {
    let ready = false;
    startEcosystemActivity(() => ready);
    startEcosystemActivity(() => ready);
    expect(create).toHaveBeenCalledTimes(1);
    expect(publisher.installFetch).toHaveBeenCalledTimes(1);
    const socket = {} as never;
    observeEcosystemSocket(socket);
    expect(publisher.observeSocket).toHaveBeenCalledWith(socket);
    const options = create.mock.calls[0]?.[0] as unknown as { service: string; ready(): boolean };
    expect(options.service).toBe('schedio');
    expect(options.ready()).toBe(false);
    ready = true;
    expect(options.ready()).toBe(true);
    const next = mock();
    ecosystemActivityMiddleware({} as never, {} as never, next);
    expect(publisher.observeHttp).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    await stopEcosystemActivity();
    await stopEcosystemActivity();
    expect(publisher.stop).toHaveBeenCalledTimes(1);
  });
});
