import { describe, expect, it } from 'bun:test';
import { instanceOrigin, upstreamJson } from '../publishing/network';
describe('provider network boundary', () => {
  it('only accepts canonical HTTPS origins without credentials, paths or custom ports', () => {
    expect(instanceOrigin('https://mastodon.social')).toBe('https://mastodon.social');
    for (const value of [
      'http://example.com',
      'https://user:pass@example.com',
      'https://example.com/a',
      'https://example.com?token=x',
      'https://example.com:8443',
      'https://example.com#x',
    ])
      expect(() => instanceOrigin(value)).toThrow();
  });
  it('uses the shared DNS-pinned network guard to refuse private endpoints', async () => {
    for (const url of [
      'https://127.0.0.1/api/v1/apps',
      'https://169.254.169.254/latest/meta-data/',
      'https://[::1]/oauth/token',
    ])
      await expect(
        upstreamJson(url, {
          method: 'POST',
          token: 'must-not-leak',
          body: { secret: 'must-not-leak' },
        }),
      ).rejects.toThrow();
  });
});
