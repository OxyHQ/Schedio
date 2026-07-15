import { Router, Request, Response } from 'express';
import { getRequiredOxyUserId } from '@oxyhq/core/server';
import SocialAccount from '../models/SocialAccount';

const router = Router();

// GET / - List connected accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const accounts = await SocialAccount.find({ userId, isActive: true });
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch social accounts' });
  }
});

// POST / - Connect a new account
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const {
      platform,
      platformUserId,
      platformUsername,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      profileImageUrl,
    } = req.body ?? {};

    const account = await SocialAccount.create({
      userId,
      platform,
      platformUserId,
      platformUsername,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      profileImageUrl,
    });
    res.status(201).json({ message: 'Account connected', account });
  } catch (error) {
    res.status(500).json({ message: 'Failed to connect account' });
  }
});

// DELETE /:id - Disconnect an account
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getRequiredOxyUserId(req);
    const account = await SocialAccount.findOneAndUpdate(
      { _id: req.params.id, userId },
      { isActive: false },
      { new: true }
    );
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }
    res.json({ message: 'Account disconnected' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to disconnect account' });
  }
});

export default router;
