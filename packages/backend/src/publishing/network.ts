import { readResponseJson, safeFetch } from '@oxy.so/core/server';
import { PublishingError } from './errors';
export function instanceOrigin(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new PublishingError(422, 'validation_failed', 'Use an HTTPS Mastodon server origin');
  return url.origin;
}
/** Core pins DNS to a validated public IP. No credential-bearing redirect may be followed. */
export async function upstreamJson(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    form?: URLSearchParams;
    token?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const result = await safeFetch(url, {
    method: options.method ?? 'GET',
    maxRedirects: 0,
    signal: AbortSignal.timeout(20000),
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...options.headers,
    },
    body: options.form?.toString() ?? (options.body ? JSON.stringify(options.body) : undefined),
  });
  const body = await readResponseJson(result.response, {
    maxBytes: 1024 * 1024,
    timeoutMs: 20000,
  });
  if (body.kind !== 'ok') throw new Error(`Provider response unreadable (${body.kind})`);
  return { status: result.status, body: body.value };
}
