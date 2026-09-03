import { and, asc, eq } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { getRequiredOxyUserId } from "@oxyhq/core/server";
import { getDb } from "../db";
import { posts } from "../db/schema";
import { toPostDto } from "../utils/postDto";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const queue = await getDb()
      .select()
      .from(posts)
      .where(and(eq(posts.userId, userId), eq(posts.status, "scheduled")))
      .orderBy(asc(posts.scheduledAt), asc(posts.id));
    res.json({ queue: queue.map(toPostDto) });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch queue" });
  }
});

router.put("/", async (req: Request, res: Response) => {
  try {
    const { orderedPostIds } = req.body ?? {};
    if (!Array.isArray(orderedPostIds) || orderedPostIds.some((id) => typeof id !== "string")) {
      return res.status(400).json({ message: "orderedPostIds must be an array of strings" });
    }
    return res.json({ message: "Queue reordered", orderedPostIds });
  } catch (error) {
    return res.status(500).json({ message: "Failed to reorder queue" });
  }
});

export default router;
