import { and, eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { getRequiredOxyUserId } from "@oxy.so/core/server";
import { getDb } from "../db";
import { postAnalytics, posts } from "../db/schema";

const router = Router();

router.get("/overview", async (req: Request, res: Response) => {
  const overview = {
    totalPosts: 0,
    totalImpressions: 0,
    totalEngagement: 0,
    topPlatform: null,
  };
  res.json({ message: "Analytics overview", overview });
});

router.get("/posts/:id", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const id = req.params.id;
    if (typeof id !== "string") return res.status(400).json({ message: "id is invalid" });
    const post = await getDb().query.posts.findFirst({
      columns: { id: true },
      where: and(eq(posts.id, id), eq(posts.userId, userId)),
    });
    if (!post) return res.status(404).json({ message: "Post not found" });

    const rows = await getDb()
      .select()
      .from(postAnalytics)
      .where(eq(postAnalytics.postId, post.id));
    if (rows.length === 0) {
      return res.status(404).json({ message: "No analytics found for this post" });
    }
    const analytics = rows.map((row) => ({
      id: row.id,
      postId: row.postId,
      platform: row.platform,
      metrics: {
        likes: row.likes,
        shares: row.shares,
        comments: row.comments,
        impressions: row.impressions,
        reach: row.reach,
        clicks: row.clicks,
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
    return res.json({ analytics });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch post analytics" });
  }
});

export default router;
