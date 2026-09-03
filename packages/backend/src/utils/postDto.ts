import { posts } from "../db/schema";

type PostRow = typeof posts.$inferSelect;

/** Keep persistence-only column names out of the public post contract. */
export function toPostDto(row: PostRow) {
  const { platformIds, ...fields } = row;
  return {
    ...fields,
    platforms: [...platformIds],
  };
}
