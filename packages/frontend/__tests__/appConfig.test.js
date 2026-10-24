/**
 * WHICH LINKS THE BUILT APP CLAIMS.
 *
 * The dev-only link hosts (`localhost` and a LAN address on :3000/:3001) were
 * gated on `IS_DEV = !IS_TESTFLIGHT || !IS_PRODUCTION`, which is true for every
 * build, so every release build shipped them inside the `autoVerify` filter,
 * where an http host can never verify. They now ship only with
 * `APP_VARIANT=development`, and this asserts what each build claims.
 *
 * Plain JS under `bun test`: the frontend has no other test runner, and
 * app.config.js is CommonJS that reads the env when CALLED.
 */
const { describe, expect, it } = require('bun:test');
const createConfig = require('../app.config.js');

const ENV_KEYS = ['EXPO_PUBLIC_ENV', 'APP_VARIANT', 'EAS_BUILD_PLATFORM'];

function loadAppConfig(env) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return createConfig({}).expo;
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

/** Anything that names this machine or a private network rather than a public host. */
const LOCAL_HOST = /localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.|0\.0\.0\.0|\.local\b|:300[01]/;

/** Every build the stores receive: `EXPO_PUBLIC_ENV` set to these, or nothing. */
const PRODUCTION_BUILDS = [
  {},
  { EXPO_PUBLIC_ENV: 'production' },
  { EXPO_PUBLIC_ENV: 'testflight' },
  { EXPO_PUBLIC_ENV: 'development' },
  { EXPO_PUBLIC_ENV: 'production', EAS_BUILD_PLATFORM: 'android' },
  { EXPO_PUBLIC_ENV: 'production', EAS_BUILD_PLATFORM: 'ios' },
];

for (const env of PRODUCTION_BUILDS) {
  describe(`production app config (${JSON.stringify(env)})`, () => {
    const config = loadAppConfig(env);

    it('names no localhost or other development host anywhere', () => {
      expect(JSON.stringify(config)).not.toMatch(LOCAL_HOST);
    });

    it('has only https entries, and no `false` holes, in its link filters', () => {
      for (const filter of config.android.intentFilters) {
        for (const entry of filter.data) expect(entry).toMatchObject({ scheme: 'https' });
      }
    });
  });
}

describe('development variant', () => {
  const config = loadAppConfig({ APP_VARIANT: 'development' });

  it('opens the local servers from its own filter, outside the verified one', () => {
    const local = config.android.intentFilters.filter((filter) =>
      LOCAL_HOST.test(JSON.stringify(filter)),
    );
    expect(local).toHaveLength(1);
    expect(local[0].autoVerify).toBeUndefined();
    for (const entry of local[0].data) expect(entry).toMatchObject({ scheme: 'http' });
    const verified = config.android.intentFilters.filter((filter) => filter.autoVerify);
    expect(JSON.stringify(verified)).not.toMatch(LOCAL_HOST);
  });
});
