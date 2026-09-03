import { uuidv7 } from "@oxyhq/db";
import { and, desc, eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { getRequiredOxyUserId } from "@oxyhq/core/server";
import { getDb } from "../db";
import { POST_STATUSES, posts, type PostStatus } from "../db/schema";
import { toPostDto } from "../utils/postDto";

const router = Router();

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be an array of strings`);
  }
  return [...value];
}

function optionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    throw new Error(`${field} must be a date`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date`);
  return parsed;
}

function postStatus(value: unknown): PostStatus {
  if (value === undefined) return "draft";
  if (typeof value !== "string" || !(POST_STATUSES as readonly string[]).includes(value)) {
    throw new Error("status is invalid");
  }
  return value as PostStatus;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const rows = await getDb()
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt), desc(posts.id));
    res.json({ posts: rows.map(toPostDto) });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch posts" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const input = (req.body ?? {}) as Record<string, unknown>;
    if (typeof input.content !== "string" || input.content.trim().length === 0) {
      return res.status(400).json({ message: "content is required" });
    }
    const rows = await getDb()
      .insert(posts)
      .values({
        id: uuidv7(),
        userId,
        content: input.content,
        media: stringArray(input.media, "media"),
        platformIds: stringArray(input.platforms, "platforms"),
        status: postStatus(input.status),
        scheduledAt: optionalDate(input.scheduledAt, "scheduledAt"),
        hashtags: stringArray(input.hashtags, "hashtags"),
      })
      .returning();
    const post = rows[0];
    if (!post) throw new Error("Post insert returned no row");
    return res.status(201).json({ message: "Post created", post: toPostDto(post) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create post" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const id = req.params.id;
    if (typeof id !== "string") return res.status(400).json({ message: "id is invalid" });
    const post = await getDb().query.posts.findFirst({
      where: and(eq(posts.id, id), eq(posts.userId, userId)),
    });
    if (!post) return res.status(404).json({ message: "Post not found" });
    return res.json({ post: toPostDto(post) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch post" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const id = req.params.id;
    if (typeof id !== "string") return res.status(400).json({ message: "id is invalid" });
    const input = (req.body ?? {}) as Record<string, unknown>;
    const patch: Partial<typeof posts.$inferInsert> = { updatedAt: new Date() };
    if (typeof input.content === "string") patch.content = input.content;
    if (input.media !== undefined) patch.media = stringArray(input.media, "media");
    if (input.platforms !== undefined) {
      patch.platformIds = stringArray(input.platforms, "platforms");
    }
    if (input.status !== undefined) patch.status = postStatus(input.status);
    if (input.scheduledAt !== undefined) {
      patch.scheduledAt = optionalDate(input.scheduledAt, "scheduledAt") ?? null;
    }
    if (input.hashtags !== undefined) patch.hashtags = stringArray(input.hashtags, "hashtags");

    const rows = await getDb()
      .update(posts)
      .set(patch)
      .where(and(eq(posts.id, id), eq(posts.userId, userId)))
      .returning();
    const post = rows[0];
    if (!post) return res.status(404).json({ message: "Post not found" });
    return res.json({ message: "Post updated", post: toPostDto(post) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update post" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const id = req.params.id;
    if (typeof id !== "string") return res.status(400).json({ message: "id is invalid" });
    const rows = await getDb()
      .delete(posts)
      .where(and(eq(posts.id, id), eq(posts.userId, userId)))
      .returning();
    const post = rows[0];
    if (!post) return res.status(404).json({ message: "Post not found" });
    return res.json({ message: "Post deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete post" });
  }
});

router.post("/:id/publish", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const id = req.params.id;
    if (typeof id !== "string") return res.status(400).json({ message: "id is invalid" });
    const rows = await getDb()
      .update(posts)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(posts.id, id), eq(posts.userId, userId)))
      .returning();
    const post = rows[0];
    if (!post) return res.status(404).json({ message: "Post not found" });
    return res.json({ message: "Post published", post: toPostDto(post) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to publish post" });
  }
});

export default router;
