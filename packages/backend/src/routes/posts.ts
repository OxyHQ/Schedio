import { Router, Request, Response } from 'express';
import { getRequiredOxyUserId } from '@oxyhq/core/server';
import Post from '../models/Post';

const router = Router();

// GET / - List posts
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const posts = await Post.find({ userId }).sort({ createdAt: -1 });
    res.json({ posts });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch posts' });
  }
});

// POST / - Create post
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const { content, media, platforms, status, scheduledAt, hashtags } = req.body ?? {};

    const post = await Post.create({
      userId,
      content,
      media,
      platforms,
      status,
      scheduledAt,
      hashtags,
    });
    res.status(201).json({ message: 'Post created', post });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create post' });
  }
});

// GET /:id - Get single post
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const post = await Post.findOne({ _id: req.params.id, userId });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.json({ post });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch post' });
  }
});

// PUT /:id - Update post
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const { content, media, platforms, status, scheduledAt, hashtags } = req.body ?? {};

    const post = await Post.findOneAndUpdate(
      { _id: req.params.id, userId },
      { content, media, platforms, status, scheduledAt, hashtags },
      { new: true }
    );
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.json({ message: 'Post updated', post });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update post' });
  }
});

// DELETE /:id - Delete post
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const post = await Post.findOneAndDelete({ _id: req.params.id, userId });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete post' });
  }
});

// POST /:id/publish - Publish post
router.post('/:id/publish', async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const post = await Post.findOneAndUpdate(
      { _id: req.params.id, userId },
      { status: 'published', publishedAt: new Date() },
      { new: true }
    );
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.json({ message: 'Post published', post });
  } catch (error) {
    res.status(500).json({ message: 'Failed to publish post' });
  }
});

export default router;
