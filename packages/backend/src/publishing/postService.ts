import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, lt, or, inArray, isNull, sql, getTableColumns } from 'drizzle-orm';
import { getDb, type SchedioTransaction } from '../db';
import { posts, deliveries, socialAccounts, organizationPolicies } from '../db/schema';
import { Post, DraftInput, EditInput } from '@schedio/contracts';
import { PublishingError } from './errors';
import { revokePublishingTask, type ScheduleAuthority } from './taskAuthority';
import { decodeCursor, encodeCursor, type PageQuery } from './pagination';
export type Scope = { userId: string; organizationId: string | null };
export function owns(scope: Scope) {
  return scope.organizationId
    ? eq(posts.organizationId, scope.organizationId)
    : and(eq(posts.userId, scope.userId), isNull(posts.organizationId));
}
export async function postDto(row: typeof posts.$inferSelect) {
  const results = await getDb().select().from(deliveries).where(eq(deliveries.postId, row.id));
  return Post.parse({
    ...row,
    platforms: row.platformIds,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deliveries: results.map((r) => ({
      accountId: r.accountId,
      platform: r.platform,
      status: r.status,
      url: r.url,
      error: r.error,
      attempts: r.attempts,
    })),
  });
}
export async function lockedPost(tx: SchedioTransaction, id: string, scope: Scope) {
  const [p] = await tx
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), owns(scope)))
    .for('update');
  if (!p) throw new PublishingError(404, 'not_found', 'Post not found');
  return p;
}
export async function listPosts(scope: Scope, queue = false, page: PageQuery = {}) {
  const kind = queue ? 'queue' : 'posts',
    limit = page.limit ?? 50;
  const cursor = decodeCursor(kind, scope, page.cursor);
  if (cursor && (!cursor.createdAt || (queue && cursor.position === undefined)))
    throw new PublishingError(400, 'bad_request', 'Invalid list cursor');
  const after = cursor
    ? queue
      ? or(
          gt(posts.queuePosition, cursor.position ?? 0),
          and(eq(posts.queuePosition, cursor.position ?? 0), gt(posts.id, cursor.id)),
        )
      : or(
          sql`${posts.createdAt} < ${cursor.createdAt}::timestamptz`,
          and(sql`${posts.createdAt} = ${cursor.createdAt}::timestamptz`, lt(posts.id, cursor.id)),
        )
    : undefined;
  const rows = await getDb()
    .select({
      ...getTableColumns(posts),
      cursorCreatedAt: sql<string>`to_char(${posts.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(posts)
    .where(and(owns(scope), queue ? eq(posts.status, 'scheduled') : undefined, after))
    .orderBy(
      queue ? asc(posts.queuePosition) : desc(posts.createdAt),
      queue ? asc(posts.id) : desc(posts.id),
    )
    .limit(limit + 1);
  const visible = rows.slice(0, limit),
    last = visible.at(-1);
  return {
    items: await Promise.all(visible.map(postDto)),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(kind, scope, {
            id: last.id,
            createdAt: last.cursorCreatedAt,
            position: queue ? last.queuePosition : undefined,
          })
        : null,
  };
}

async function targets(tx: SchedioTransaction, scope: Scope, ids: string[]) {
  const rows = await tx
    .select()
    .from(socialAccounts)
    .where(
      and(
        inArray(socialAccounts.id, ids),
        eq(socialAccounts.isActive, true),
        scope.organizationId
          ? eq(socialAccounts.organizationId, scope.organizationId)
          : and(eq(socialAccounts.userId, scope.userId), isNull(socialAccounts.organizationId)),
      ),
    )
    .for('share');
  if (
    rows.length !== ids.length ||
    rows.some((a) => a.platform !== 'mention' && a.platform !== 'mastodon')
  )
    throw new PublishingError(
      422,
      'validation_failed',
      'Choose Mention or connected Mastodon destinations in this workspace',
    );
  return rows;
}
async function createDeliveries(
  tx: SchedioTransaction,
  postId: string,
  accounts: Awaited<ReturnType<typeof targets>>,
) {
  await tx.insert(deliveries).values(
    accounts.map((a) => ({
      id: randomUUID(),
      postId,
      accountId: a.id,
      platform: a.platform as 'mention' | 'mastodon',
      effectKey: `mcp:${createHash('sha256').update(randomUUID()).digest('hex')}`,
    })),
  );
}
export async function createDraft(
  scope: Scope,
  raw: unknown,
  operation?: { key: string; actorAccountId: string },
) {
  const input = DraftInput.parse(raw);
  const operationId = operation
    ? `draft:${createHash('sha256')
        .update(
          JSON.stringify([
            scope.organizationId ?? scope.userId,
            operation.actorAccountId,
            operation.key,
          ]),
        )
        .digest('hex')}`
    : undefined;
  const row = await getDb().transaction(async (tx) => {
    if (operationId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${operationId},0))`);
      const previous = await tx.query.posts.findFirst({
        where: and(eq(posts.id, operationId), owns(scope)),
      });
      if (previous) {
        if (
          previous.content !== input.content ||
          JSON.stringify(previous.platformIds) !== JSON.stringify(input.platforms)
        )
          throw new PublishingError(
            409,
            'conflict',
            'This draft operation already has different content',
          );
        return previous;
      }
    }
    if (scope.organizationId)
      await tx
        .insert(organizationPolicies)
        .values({ organizationId: scope.organizationId, required: false })
        .onConflictDoNothing();
    const accounts = await targets(tx, scope, input.platforms);
    const [p] = await tx
      .insert(posts)
      .values({
        id: operationId ?? randomUUID(),
        userId: scope.userId,
        organizationId: scope.organizationId,
        content: input.content,
        platformIds: input.platforms,
      })
      .returning();
    if (!p) throw new Error('Missing post');
    await createDeliveries(tx, p.id, accounts);
    return p;
  });
  return postDto(row);
}
export async function editDraft(
  scope: Scope,
  id: string,
  raw: unknown,
  revoke = revokePublishingTask,
) {
  const input = EditInput.parse(raw);
  const row = await getDb().transaction(async (tx) => {
    const p = await lockedPost(tx, id, scope);
    if (p.revision !== input.revision)
      throw new PublishingError(409, 'conflict', 'This post has changed');
    const sent = await tx.select().from(deliveries).where(eq(deliveries.postId, id));
    if (sent.some((d) => d.attempts > 0))
      throw new PublishingError(
        409,
        'conflict',
        'A dispatched post cannot be edited; create a new draft',
      );
    const accounts = await targets(tx, scope, input.platforms);
    if (p.oxyTaskId) await revoke(p.oxyTaskId);
    const [updated] = await tx
      .update(posts)
      .set({
        content: input.content,
        platformIds: input.platforms,
        revision: p.revision + 1,
        approvedRevision: null,
        approvedBy: null,
        status: 'draft',
        oxyTaskId: null,
        scheduledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, id))
      .returning();
    await tx.delete(deliveries).where(eq(deliveries.postId, id));
    await createDeliveries(tx, id, accounts);
    if (!updated) throw new Error('Missing post');
    return updated;
  });
  return postDto(row);
}
export async function approve(scope: Scope, id: string, revision: number) {
  const row = await getDb().transaction(async (tx) => {
    const p = await lockedPost(tx, id, scope);
    if (!p.organizationId || p.revision !== revision)
      throw new PublishingError(
        409,
        'conflict',
        'Approval requires the current organization draft',
      );
    const [updated] = await tx
      .update(posts)
      .set({ approvedRevision: revision, approvedBy: scope.userId, updatedAt: new Date() })
      .where(eq(posts.id, id))
      .returning();
    if (!updated) throw new Error('Missing post');
    return updated;
  });
  return postDto(row);
}
export async function enqueue(
  scope: Scope,
  id: string,
  revision: number,
  when: Date,
  authority?: ScheduleAuthority,
) {
  let createdTaskId: string | undefined;
  let row: typeof posts.$inferSelect;
  try {
    row = await getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${scope.organizationId ?? scope.userId},0))`,
      );
      const p = await lockedPost(tx, id, scope);
      if (p.revision !== revision)
        throw new PublishingError(409, 'conflict', 'This post has changed');
      if (p.organizationId) {
        const policy = await tx.query.organizationPolicies.findFirst({
          where: eq(organizationPolicies.organizationId, p.organizationId),
        });
        if (policy?.required && p.approvedRevision !== p.revision)
          throw new PublishingError(
            409,
            'conflict',
            'Current content and destinations require approval',
          );
      }
      const ds = await tx.select().from(deliveries).where(eq(deliveries.postId, id));
      if (ds.length === 0)
        throw new PublishingError(
          409,
          'conflict',
          'Choose current connected destinations before publishing',
        );
      if (ds.every((d) => d.status === 'succeeded')) return p;
      let queuePosition = p.queuePosition;
      if (p.status !== 'scheduled') {
        const queued = await tx
          .select({ id: posts.id, position: posts.queuePosition })
          .from(posts)
          .where(and(owns(scope), eq(posts.status, 'scheduled')))
          .limit(500);
        if (queued.length >= 500)
          throw new PublishingError(
            409,
            'conflict',
            'This workspace already has 500 scheduled posts',
          );
        queuePosition = queued.reduce((max, row) => Math.max(max, row.position), -1) + 1;
      }
      if (ds.some((d) => d.status === 'sending' && d.leaseUntil && d.leaseUntil > new Date()))
        throw new PublishingError(409, 'conflict', 'Publishing is already in progress');
      let oxyTaskId = p.oxyTaskId;
      if (ds.some((d) => d.platform === 'mention' && d.status !== 'succeeded')) {
        if (!authority)
          throw new PublishingError(
            403,
            'forbidden',
            'A current Oxy session is required to schedule Mention',
          );
        createdTaskId = await authority.create(p.id, p.revision, when);
        if (p.oxyTaskId) await authority.revoke(p.oxyTaskId);
        oxyTaskId = createdTaskId;
      }
      await tx
        .update(deliveries)
        .set({ status: 'pending', error: null })
        .where(and(eq(deliveries.postId, id), inArray(deliveries.status, ['failed'])));
      const [updated] = await tx
        .update(posts)
        .set({
          status: 'scheduled',
          scheduledAt: when,
          queuePosition,
          oxyTaskId,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, id))
        .returning();
      if (!updated) throw new Error('Missing post');
      return updated;
    });
  } catch (error) {
    if (createdTaskId && authority) await authority.revoke(createdTaskId);
    throw error;
  }
  return postDto(row);
}
export async function reorder(scope: Scope, ids: string[]) {
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${scope.organizationId ?? scope.userId},0))`,
    );
    const rows = await tx
      .select()
      .from(posts)
      .where(and(owns(scope), eq(posts.status, 'scheduled')))
      .orderBy(asc(posts.id))
      .for('update');
    if (rows.length !== ids.length || rows.some((p) => !ids.includes(p.id)))
      throw new PublishingError(409, 'conflict', 'Queue changed; reload before reordering');
    for (const [i, id] of ids.entries())
      await tx
        .update(posts)
        .set({ queuePosition: i, updatedAt: new Date() })
        .where(eq(posts.id, id));
  });
  return listPosts(scope, true, { limit: 500 });
}
