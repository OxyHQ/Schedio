import { getRequiredOxyUserId, OxyAccessError, type OxyAuthRequest } from '@oxy.so/core/server';
import type { Request } from 'express';
import { oxy } from '../oxy';

/**
 * The caller's scope for one publishing request: themselves, or an
 * organization they may act as. Read live from Oxy with the caller's own
 * bearer (`accountAccessFor`), so inherited memberships, grants and revokes
 * all count, and nothing is copied locally. A write asks fresh; a read may
 * reuse an answer for 30 s. Only answers are cached: an Oxy outage is
 * `ACCESS_UNAVAILABLE` (503), never a remembered "no".
 *
 * `reviewer` additionally requires `account:update` — the organization's
 * administrators (owner, admin), not its editors.
 */
export async function authorize(req: Request, organizationId?: string | null, reviewer = false) {
  const userId = getRequiredOxyUserId(req);
  if (!organizationId) return { userId, organizationId: null };
  const access = await oxy.accountAccessFor(req as OxyAuthRequest, organizationId, {
    fresh: req.method !== 'GET',
  });
  if (access.kind !== 'organization' || !access.has('account:act_as'))
    throw new OxyAccessError('ACCESS_DENIED', 'Organization membership is required', {
      permission: 'account:act_as',
    });
  if (reviewer && !access.has('account:update'))
    throw new OxyAccessError(
      'ACCESS_DENIED',
      'An organization administrator must review this post',
      { permission: 'account:update' },
    );
  return { userId, organizationId };
}
