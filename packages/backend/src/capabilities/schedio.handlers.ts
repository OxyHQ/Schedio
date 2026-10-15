import { createDraft } from '../publishing/postService';
import { listAccounts } from '../publishing/connections';
import { PublishingError } from '../publishing/errors';
export async function executeSchedioCatalogTool(
  name: string,
  input: Readonly<Record<string, unknown>>,
  effectiveAccountId: string,
  actorAccountId: string,
): Promise<Record<string, unknown>> {
  const scope = {
    userId: effectiveAccountId,
    organizationId: input.organizationId === effectiveAccountId ? effectiveAccountId : null,
  };
  if (input.organizationId !== undefined && input.organizationId !== effectiveAccountId)
    throw new PublishingError(403, 'forbidden', 'Account scope mismatch');
  if (name === 'listDestinations') return listAccounts(scope);
  if (name === 'createDraft') {
    if (typeof input.idempotencyKey !== 'string')
      throw new PublishingError(422, 'validation_failed', 'Idempotency key required');
    const draft = await createDraft(
      scope,
      { content: input.content, platforms: input.platforms },
      { key: input.idempotencyKey, actorAccountId },
    );
    return {
      draft,
      reviewUrl: `https://schedio.app/compose?id=${encodeURIComponent(draft.id)}`,
      requiresHumanReview: true,
    };
  }
  throw new PublishingError(403, 'forbidden', 'This capability cannot publish or approve');
}
