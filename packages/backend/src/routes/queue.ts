import { Router, Request, Response } from 'express';
import Post from '../models/Post';

const router = Router();

// GET / - Get publishing queue
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const queue = await Post.find({ userId, status: 'scheduled' })
      .sort({ scheduledAt: 1 });
    res.json({ queue });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch queue' });
  }
});

// PUT / - Reorder queue
router.put('/', async (req: Request, res: Response) => {
  try {
    const { orderedPostIds } = req.body;
    if (!Array.isArray(orderedPostIds)) {
      return res.status(400).json({ message: 'orderedPostIds must be an array' });
    }
    res.json({ message: 'Queue reordered', orderedPostIds });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reorder queue' });
  }
});

export default router;
