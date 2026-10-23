import type { posts } from '../db/schema';

type PostRow = typeof posts.$inferSelect;

/** Keep persistence-only column names out of the public post contract. */
export function toPostDto(row: PostRow) {
  const { platformIds, oxyTaskId: _oxyTaskId, ...fields } = row;
  return {
    ...fields,
    platforms: [...platformIds],
  };
}
