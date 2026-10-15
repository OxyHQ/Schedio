import { OxyServices, OXY_API_URL } from '@oxy.so/core';
import { getRequiredOxyUserId, type OxyAuthRequest } from '@oxy.so/core/server';
import type { Request } from 'express';
import { PublishingError } from './errors';
/** Request-local client: no cross-user cache, no copied organization membership. */
export async function authorize(req: Request, organizationId?: string | null, reviewer = false) {
  const userId = getRequiredOxyUserId(req);
  if (!organizationId) return { userId, organizationId: null };
  const token = (req as OxyAuthRequest).accessToken;
  if (!token) throw new PublishingError(403, 'forbidden', 'An Oxy user session is required');
  const oxy = new OxyServices({ baseURL: OXY_API_URL, enableCache: false });
  oxy.session.setAccessToken(token);
  const account = await oxy.accounts.get(organizationId).finally(() => oxy.dispose());
  const membership = account.callerMembership;
  const owner = account.relationship === 'owner';
  if (
    account.kind !== 'organization' ||
    (!owner &&
      (membership?.status !== 'active' || !membership.permissions.includes('account:act_as')))
  )
    throw new PublishingError(403, 'forbidden', 'Organization membership is required');
  if (reviewer && !owner && membership?.role !== 'admin' && membership?.role !== 'owner')
    throw new PublishingError(
      403,
      'forbidden',
      'An organization administrator must review this post',
    );
  return { userId, organizationId };
}
