import { z } from 'zod';
const id = z.string().min(1).max(200);
export const Platform = z.enum(['mention', 'mastodon']);
export const ListQuery = z
  .object({
    organizationId: id.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    cursor: z.string().max(2048).optional(),
  })
  .strict();
export const ErrorCode = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'unknown_route',
  'gone',
  'conflict',
  'validation_failed',
  'rate_limited',
  'internal_error',
  'service_unavailable',
]);
export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  }),
});
export const DraftInput = z
  .object({
    content: z.string().trim().min(1).max(50000),
    platforms: z
      .array(id)
      .min(1)
      .max(20)
      .refine((v) => new Set(v).size === v.length),
    organizationId: id.nullable().optional(),
  })
  .strict();
export const EditInput = DraftInput.omit({ organizationId: true })
  .extend({ revision: z.number().int().positive() })
  .strict();
export const ScheduleInput = z
  .object({ scheduledAt: z.iso.datetime(), revision: z.number().int().positive() })
  .strict();
export const RevisionInput = z.object({ revision: z.number().int().positive() }).strict();
export const QueueInput = z
  .object({
    orderedPostIds: z
      .array(id)
      .max(500)
      .refine((v) => new Set(v).size === v.length),
    organizationId: id.optional(),
  })
  .strict();
export const ConnectionInput = z
  .object({
    platform: z.literal('mastodon'),
    instance: z.url().optional(),
    organizationId: id.optional(),
  })
  .strict();
export const ConnectionFinish = z
  .object({ state: z.string().min(32).max(200), code: z.string().min(1).max(4096) })
  .strict();
export const ReviewPolicyInput = z.object({ required: z.boolean() }).strict();
export const Delivery = z.object({
  accountId: id,
  platform: Platform,
  status: z.enum(['pending', 'sending', 'succeeded', 'failed', 'unknown']),
  url: z.url().nullable(),
  error: z.string().nullable(),
  attempts: z.number().int(),
});
export const Post = z.object({
  id,
  userId: id,
  organizationId: id.nullable(),
  content: z.string(),
  platforms: z.array(id),
  revision: z.number().int(),
  approvedRevision: z.number().int().nullable(),
  approvedBy: id.nullable(),
  status: z.enum(['draft', 'scheduled', 'published', 'failed']),
  scheduledAt: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  queuePosition: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deliveries: z.array(Delivery),
});
export const Account = z.object({
  id,
  userId: id,
  organizationId: id.nullable(),
  platform: Platform,
  platformUserId: id,
  platformUsername: z.string(),
  instance: z.url(),
  isActive: z.boolean(),
});
export const PostList = z.object({ items: z.array(Post), nextCursor: z.string().nullable() });
export const AccountList = z.object({ items: z.array(Account), nextCursor: z.string().nullable() });
export const ConnectionStart = z.object({ authorizationUrl: z.url(), state: z.string() });
export type Post = z.infer<typeof Post>;
export type Account = z.infer<typeof Account>;
export type DraftInput = z.infer<typeof DraftInput>;
export type EditInput = z.infer<typeof EditInput>;
export const schemas = {
  ApiError,
  ListQuery,
  DraftInput,
  EditInput,
  ScheduleInput,
  RevisionInput,
  QueueInput,
  ConnectionInput,
  ConnectionFinish,
  ReviewPolicyInput,
  Post,
  PostList,
  Account,
  AccountList,
  ConnectionStart,
};
export const routes = [
  { method: 'get', path: '/api/posts', response: 'PostList', query: true },
  { method: 'post', path: '/api/posts', body: 'DraftInput', response: 'Post', status: 201 },
  { method: 'get', path: '/api/posts/{id}', response: 'Post' },
  { method: 'put', path: '/api/posts/{id}', body: 'EditInput', response: 'Post' },
  { method: 'post', path: '/api/posts/{id}/publish', body: 'RevisionInput', response: 'Post' },
  { method: 'post', path: '/api/posts/{id}/schedule', body: 'ScheduleInput', response: 'Post' },
  { method: 'post', path: '/api/posts/{id}/approve', body: 'RevisionInput', response: 'Post' },
  { method: 'get', path: '/api/queue', response: 'PostList', query: true },
  { method: 'put', path: '/api/queue', body: 'QueueInput', response: 'PostList' },
  { method: 'get', path: '/api/accounts', response: 'AccountList' },
  { method: 'delete', path: '/api/accounts/{id}', response: 'Account', status: 204 },
  { method: 'get', path: '/api/organizations/{id}/review', response: 'ReviewPolicyInput' },
  {
    method: 'post',
    path: '/api/accounts/connect',
    body: 'ConnectionInput',
    response: 'ConnectionStart',
  },
  { method: 'post', path: '/api/accounts/complete', body: 'ConnectionFinish', response: 'Account' },
  {
    method: 'put',
    path: '/api/organizations/{id}/review',
    body: 'ReviewPolicyInput',
    response: 'ReviewPolicyInput',
  },
] as const;
export function openapi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    paths[route.path] ??= {};
    const entry = paths[route.path];
    entry[route.method] = {
      ...('body' in route
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: `#/components/schemas/${route.body}` } },
              },
            },
          }
        : {}),
      parameters: [
        ...('query' in route
          ? [
              {
                in: 'query',
                name: 'limit',
                schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
              },
              { in: 'query', name: 'cursor', schema: { type: 'string' } },
              { in: 'query', name: 'organizationId', schema: { type: 'string' } },
            ]
          : []),
        ...[...route.path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
          in: 'path',
          name: m[1],
          required: true,
          schema: { type: 'string' },
        })),
      ],
      responses: {
        ['status' in route ? route.status : 200]: {
          description: 'Success',
          ...('status' in route && route.status === 204
            ? {}
            : {
                content: {
                  'application/json': {
                    schema: { $ref: `#/components/schemas/${route.response}` },
                  },
                },
              }),
        },
        default: {
          description: 'Error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
        },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Schedio publishing', version: '0.1.0' },
    paths,
    components: {
      schemas: Object.fromEntries(
        Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
      ),
    },
  };
}
