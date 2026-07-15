import { Router, Request, Response } from 'express';
import { getRequiredOxyUserId } from '@oxyhq/core/server';
import PostAnalytics from '../models/PostAnalytics';
import Post from '../models/Post';

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
    const userId = getRequiredOxyUserId(req);

    // Ensure the post belongs to the requesting user before exposing analytics
    const post = await Post.findOne({ _id: req.params.id, userId }).select('_id');
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

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
