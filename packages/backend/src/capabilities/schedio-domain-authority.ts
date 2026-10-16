export type SchedioAuthorizationDecision = { allowed: true } | { allowed: false; reason: string };
export async function authorizeSchedioCatalogInvocation(
  toolName: string,
  input: Readonly<Record<string, unknown>>,
  effectiveAccountId: string,
): Promise<SchedioAuthorizationDecision> {
  if (!['listDestinations', 'createDraft'].includes(toolName))
    return { allowed: false, reason: 'unknown_catalog_tool' };
  if (input.organizationId !== undefined && input.organizationId !== effectiveAccountId)
    return { allowed: false, reason: 'account_scope_mismatch' };
  return { allowed: true };
}
