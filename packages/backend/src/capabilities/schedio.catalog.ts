import type { AppCapabilityCatalog, CatalogTool } from '@oxy.so/contracts';
const scope = {
  organizationId: {
    type: 'string',
    minLength: 1,
    maxLength: 200,
    description: 'Only the exact delegated organization account. Omit for a personal account.',
  },
};
const common: Pick<
  CatalogTool,
  'version' | 'resourceTypes' | 'exposure' | 'limitKeys' | 'outputSchema'
> = {
  version: '1.0.0',
  resourceTypes: ['schedio_account'],
  exposure: ['internal'],
  limitKeys: [],
  outputSchema: { type: 'object', additionalProperties: true },
};
export const SCHEDIO_CAPABILITY_CATALOG: AppCapabilityCatalog = {
  schemaVersion: '1',
  appId: 'schedio',
  version: '1.0.0',
  audience: 'oxy-schedio-api',
  internalBaseUrl: 'https://api.schedio.app',
  accountResourceType: 'schedio_account',
  events: [],
  tools: [
    {
      ...common,
      name: 'listDestinations',
      description:
        'List the delegated account’s connected Mention and Mastodon destinations for drafting.',
      capabilityPackage: 'read',
      requiredCapabilities: ['publications.read'],
      effect: 'read',
      idempotency: 'none',
      rollback: 'none',
      inputSchema: { type: 'object', properties: scope, additionalProperties: false },
      invocation: { method: 'POST', path: '/_oxy/capabilities/listDestinations' },
    },
    {
      ...common,
      name: 'createDraft',
      description:
        'Prepare a publication draft for HUMAN review in Schedio. This capability never approves, schedules or publishes. Reuse the idempotency key after a lost reply.',
      capabilityPackage: 'create',
      requiredCapabilities: ['publications.draft'],
      effect: 'write',
      idempotency: 'required',
      rollback: 'manual',
      inputSchema: {
        type: 'object',
        properties: {
          ...scope,
          content: { type: 'string', minLength: 1, maxLength: 5000 },
          platforms: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            uniqueItems: true,
            items: { type: 'string', minLength: 1, maxLength: 200 },
          },
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 200 },
        },
        required: ['content', 'platforms', 'idempotencyKey'],
        additionalProperties: false,
      },
      invocation: { method: 'POST', path: '/_oxy/capabilities/createDraft' },
    },
  ] satisfies CatalogTool[],
};
