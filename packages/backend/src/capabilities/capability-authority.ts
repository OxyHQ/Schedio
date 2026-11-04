import type { auditResultSchema, CapabilityTicketClaims } from '@oxy.so/contracts';
import {
  CapabilityTicketError,
  createLiveCapabilityTicketVerifier,
  createOxyJwksKeyResolver,
} from '@oxy.so/core/server';
import type { z } from 'zod';

import { oxy } from '../oxy';
import { SCHEDIO_CAPABILITY_CATALOG } from './schedio.catalog';

type AuditResult = z.infer<typeof auditResultSchema>;

const resolvePublicKey = createOxyJwksKeyResolver({
  jwksUrl: `${oxy.baseURL}/capabilities/.well-known/jwks.json`,
});

/**
 * - `invalid`: the ticket is not one Oxy signed for this catalogue (401).
 * - `unavailable`: Oxy could not be asked whether it still stands behind it (503).
 * - `revoked`: Oxy answered, and does not (403).
 */
export type CapabilityTicketVerdict =
  | { outcome: 'valid'; claims: CapabilityTicketClaims }
  | { outcome: 'invalid'; code: string }
  | { outcome: 'unavailable' }
  | { outcome: 'revoked' };

/**
 * Signature, issuer, audience, expiry and catalogue binding locally, then
 * Oxy's LIVE decision: a ticket Oxy no longer stands behind (revoked task or
 * grant, a denied policy decision, or claims that differ from the signed ones)
 * is refused however valid its signature.
 */
export async function verifySchedioCapabilityTicket(
  ticket: string,
): Promise<CapabilityTicketVerdict> {
  const oxyAnswer: { state: 'not_asked' | 'asking' | 'answered' } = { state: 'not_asked' };
  const verify = createLiveCapabilityTicketVerifier({
    issuer: oxy.baseURL,
    audience: SCHEDIO_CAPABILITY_CATALOG.audience,
    resolvePublicKey,
    introspect: async (token, request) => {
      oxyAnswer.state = 'asking';
      const result = await oxy.agency.introspectCapabilityTicket(token, request);
      oxyAnswer.state = 'answered';
      return result.decision?.allowed === true ? result : { ...result, active: false };
    },
  });
  try {
    return { outcome: 'valid', claims: await verify(ticket) };
  } catch (error) {
    if (error instanceof CapabilityTicketError) return { outcome: 'invalid', code: error.code };
    switch (oxyAnswer.state) {
      case 'not_asked':
        return { outcome: 'invalid', code: 'invalid_claims' };
      case 'asking':
        return { outcome: 'unavailable' };
      case 'answered':
        return { outcome: 'revoked' };
    }
  }
}

export async function auditSchedioCapabilityTicket(input: {
  ticket: string;
  result: AuditResult;
  rollbackSupported: boolean;
  idempotencyKeyHash?: string;
}): Promise<void> {
  await oxy.serviceRequest(
    'POST',
    '/capabilities/audit',
    {
      ticket: input.ticket,
      result: input.result,
      rollback: { supported: input.rollbackSupported, attempted: false },
      ...(input.idempotencyKeyHash ? { idempotencyKeyHash: input.idempotencyKeyHash } : {}),
    },
    { retry: false, timeout: 10_000 },
  );
}
