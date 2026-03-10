import { Router, Request, Response } from 'express';
import SocialAccount from '../models/SocialAccount';

const router = Router();

// GET / - List connected accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const accounts = await SocialAccount.find({ userId, isActive: true });
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch social accounts' });
  }
});

// POST / - Connect a new account
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const account = await SocialAccount.create({ ...req.body, userId });
    res.status(201).json({ message: 'Account connected', account });
  } catch (error) {
    res.status(500).json({ message: 'Failed to connect account' });
  }
});

// DELETE /:id - Disconnect an account
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const account = await SocialAccount.findByIdAndUpdate(
      req.params.id,
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
