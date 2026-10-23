import {
  Account,
  AccountList,
  ConnectionStart,
  Post,
  PostList,
  ReviewPolicyInput,
  type DraftInput,
  type EditInput,
} from '@schedio/contracts';
export type { Post, Account, DraftInput, EditInput } from '@schedio/contracts';
/** The injected transport carries the caller's Oxy session directly to Schedio. */
export class SchedioClient {
  constructor(
    private readonly request: (
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      body?: unknown,
    ) => Promise<unknown>,
  ) {}
  private scope(organizationId?: string) {
    return organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
  }
  async listAccounts(organizationId?: string) {
    return AccountList.parse(
      await this.request('GET', `/api/accounts${this.scope(organizationId)}`),
    );
  }
  async listPosts(organizationId?: string, page: { limit?: number; cursor?: string } = {}) {
    const params = new URLSearchParams({ limit: String(page.limit ?? 50) });
    if (organizationId) params.set('organizationId', organizationId);
    if (page.cursor) params.set('cursor', page.cursor);
    return PostList.parse(await this.request('GET', `/api/posts?${params}`));
  }
  async *iteratePosts(organizationId?: string) {
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const result = await this.listPosts(organizationId, { cursor });
      yield* result.items;
      cursor = result.nextCursor ?? undefined;
      if (cursor) {
        if (seen.has(cursor)) throw new Error('Schedio repeated a cursor');
        seen.add(cursor);
      }
    } while (cursor);
  }

  async getPost(id: string) {
    return Post.parse(await this.request('GET', `/api/posts/${encodeURIComponent(id)}`));
  }
  async createDraft(input: DraftInput) {
    return Post.parse(await this.request('POST', '/api/posts', input));
  }
  async editDraft(id: string, input: EditInput) {
    return Post.parse(await this.request('PUT', `/api/posts/${encodeURIComponent(id)}`, input));
  }
  async approve(id: string, revision: number) {
    return Post.parse(
      await this.request('POST', `/api/posts/${encodeURIComponent(id)}/approve`, { revision }),
    );
  }
  async publish(id: string, revision: number) {
    return Post.parse(
      await this.request('POST', `/api/posts/${encodeURIComponent(id)}/publish`, { revision }),
    );
  }
  async schedule(id: string, revision: number, scheduledAt: string) {
    return Post.parse(
      await this.request('POST', `/api/posts/${encodeURIComponent(id)}/schedule`, {
        revision,
        scheduledAt,
      }),
    );
  }
  async queue(organizationId?: string) {
    return PostList.parse(
      await this.request(
        'GET',
        `/api/queue${this.scope(organizationId)}${organizationId ? '&' : '?'}limit=500`,
      ),
    );
  }
  async reorder(orderedPostIds: string[], organizationId?: string) {
    return PostList.parse(
      await this.request('PUT', '/api/queue', {
        orderedPostIds,
        ...(organizationId ? { organizationId } : {}),
      }),
    );
  }
  async startConnection(platform: 'mastodon', instance?: string, organizationId?: string) {
    return ConnectionStart.parse(
      await this.request('POST', '/api/accounts/connect', {
        platform,
        ...(instance ? { instance } : {}),
        ...(organizationId ? { organizationId } : {}),
      }),
    );
  }
  async completeConnection(state: string, code: string) {
    return Account.parse(await this.request('POST', '/api/accounts/complete', { state, code }));
  }
  async disconnect(id: string, organizationId?: string) {
    await this.request(
      'DELETE',
      `/api/accounts/${encodeURIComponent(id)}${this.scope(organizationId)}`,
    );
  }
  async reviewPolicy(organizationId: string) {
    return ReviewPolicyInput.parse(
      await this.request('GET', `/api/organizations/${encodeURIComponent(organizationId)}/review`),
    );
  }
  async setReviewPolicy(organizationId: string, required: boolean) {
    return ReviewPolicyInput.parse(
      await this.request('PUT', `/api/organizations/${encodeURIComponent(organizationId)}/review`, {
        required,
      }),
    );
  }
}
