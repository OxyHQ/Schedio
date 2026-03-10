import { Router, Request, Response } from 'express';
import PostAnalytics from '../models/PostAnalytics';

const router = Router();

// GET /overview - Get analytics overview
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const overview = {
      totalPosts: 0,
      totalImpressions: 0,
      totalEngagement: 0,
      topPlatform: null,
    };
    res.json({ message: 'Analytics overview', overview });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch analytics overview' });
  }
});

// GET /posts/:id - Get analytics for a specific post
router.get('/posts/:id', async (req: Request, res: Response) => {
  try {
    const analytics = await PostAnalytics.find({ postId: req.params.id });
    if (!analytics.length) {
      return res.status(404).json({ message: 'No analytics found for this post' });
    }
    res.json({ analytics });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch post analytics' });
  }
});

export default router;
