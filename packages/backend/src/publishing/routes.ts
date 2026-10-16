import { Router, type Request } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  DraftInput,
  QueueInput,
  RevisionInput,
  ScheduleInput,
  ReviewPolicyInput,
} from '@schedio/contracts';
import { getDb } from '../db';
import { posts, organizationPolicies, oauthStates } from '../db/schema';
import { createHash } from 'node:crypto';
import { authorize } from './authority';
import { ListQuery } from '@schedio/contracts';
import { PublishingError, publishingErrors, route } from './errors';
import {
  approve,
  createDraft,
  editDraft,
  enqueue,
  listPosts,
  postDto,
  reorder,
} from './postService';
import { disconnect, finishConnection, listAccounts, startConnection } from './connections';
const router = Router();
const scopeQuery = z.object({ organizationId: z.string().min(1).max(200).optional() }).strict();
const param = (req: Request) => z.string().min(1).parse(req.params.id);
async function readScope(req: Request) {
  return authorize(req, scopeQuery.parse(req.query).organizationId);
}
async function postScope(req: Request, reviewer = false) {
  const row = await getDb().query.posts.findFirst({ where: eq(posts.id, param(req)) });
  if (!row) throw new PublishingError(404, 'not_found', 'Post not found');
  const scope = await authorize(req, row.organizationId, reviewer);
  if (!row.organizationId && row.userId !== scope.userId)
    throw new PublishingError(404, 'not_found', 'Post not found');
  return { scope, row };
}
router.get(
  '/posts',
  route(async (req, res) => {
    const query = ListQuery.parse(req.query);
    res.json(await listPosts(await authorize(req, query.organizationId), false, query));
  }),
);
router.post(
  '/posts',
  route(async (req, res) => {
    const input = DraftInput.parse(req.body);
    res.status(201).json(await createDraft(await authorize(req, input.organizationId), input));
  }),
);
router.get(
  '/posts/:id',
  route(async (req, res) => {
    const { row } = await postScope(req);
    res.json(await postDto(row));
  }),
);
router.put(
  '/posts/:id',
  route(async (req, res) => {
    const { scope } = await postScope(req);
    res.json(await editDraft(scope, param(req), req.body));
  }),
);
router.post(
  '/posts/:id/approve',
  route(async (req, res) => {
    const { revision } = RevisionInput.parse(req.body);
    const { scope } = await postScope(req, true);
    res.json(await approve(scope, param(req), revision));
  }),
);
router.post(
  '/posts/:id/publish',
  route(async (req, res) => {
    const { revision } = RevisionInput.parse(req.body);
    const { scope } = await postScope(req);
    res.json(await enqueue(scope, param(req), revision, new Date()));
  }),
);
router.post(
  '/posts/:id/schedule',
  route(async (req, res) => {
    const { revision, scheduledAt } = ScheduleInput.parse(req.body);
    if (new Date(scheduledAt) <= new Date())
      throw new PublishingError(422, 'validation_failed', 'Choose a future publishing time');
    const { scope } = await postScope(req);
    res.json(await enqueue(scope, param(req), revision, new Date(scheduledAt)));
  }),
);
router.get(
  '/queue',
  route(async (req, res) => {
    const query = ListQuery.parse(req.query);
    res.json(await listPosts(await authorize(req, query.organizationId), true, query));
  }),
);
router.put(
  '/queue',
  route(async (req, res) => {
    const input = QueueInput.parse(req.body);
    res.json(await reorder(await authorize(req, input.organizationId), input.orderedPostIds));
  }),
);
router.get(
  '/accounts',
  route(async (req, res) => {
    res.json(await listAccounts(await readScope(req)));
  }),
);
router.post(
  '/accounts/connect',
  route(async (req, res) => {
    const organizationId = z.string().optional().parse(req.body?.organizationId);
    res.json(await startConnection(await authorize(req, organizationId), req.body));
  }),
);
router.post(
  '/accounts/complete',
  route(async (req, res) => {
    const state = z.string().parse(req.body?.state);
    const saved = await getDb().query.oauthStates.findFirst({
      where: eq(oauthStates.stateHash, createHash('sha256').update(state).digest('hex')),
    });
    res.json(await finishConnection(await authorize(req, saved?.organizationId), req.body));
  }),
);
router.delete(
  '/accounts/:id',
  route(async (req, res) => {
    await disconnect(await readScope(req), param(req));
    res.status(204).end();
  }),
);
router.get(
  '/organizations/:id/review',
  route(async (req, res) => {
    await authorize(req, param(req));
    const policy = await getDb().query.organizationPolicies.findFirst({
      where: eq(organizationPolicies.organizationId, param(req)),
    });
    res.json({ required: policy?.required ?? false });
  }),
);
router.put(
  '/organizations/:id/review',
  route(async (req, res) => {
    await authorize(req, param(req), true);
    const input = ReviewPolicyInput.parse(req.body);
    await getDb()
      .insert(organizationPolicies)
      .values({ organizationId: param(req), ...input })
      .onConflictDoUpdate({ target: organizationPolicies.organizationId, set: input });
    res.json(input);
  }),
);
router.use(publishingErrors);
export default router;
