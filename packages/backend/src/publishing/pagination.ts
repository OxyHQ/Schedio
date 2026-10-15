import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PublishingError } from './errors';
export type PageQuery = { limit?: number; cursor?: string };
const Cursor = z
  .object({
    fingerprint: z.string(),
    id: z.string(),
    createdAt: z.iso.datetime().optional(),
    position: z.number().int().optional(),
  })
  .strict();
type Boundary = z.infer<typeof Cursor>;
function fingerprint(kind: string, scope: unknown) {
  return createHash('sha256')
    .update(JSON.stringify([kind, scope]))
    .digest('hex');
}
export function decodeCursor(kind: string, scope: unknown, value?: string): Boundary | null {
  if (!value) return null;
  try {
    const parsed = Cursor.parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
    if (parsed.fingerprint !== fingerprint(kind, scope)) throw new Error('Wrong list');
    return parsed;
  } catch {
    throw new PublishingError(400, 'bad_request', 'Invalid cursor for this list');
  }
}
export function encodeCursor(
  kind: string,
  scope: unknown,
  boundary: Omit<Boundary, 'fingerprint'>,
) {
  return Buffer.from(
    JSON.stringify({ fingerprint: fingerprint(kind, scope), ...boundary }),
  ).toString('base64url');
}
