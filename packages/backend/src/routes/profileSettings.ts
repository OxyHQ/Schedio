import { uuidv7 } from "@oxy.so/db";
import { and, desc, eq } from "drizzle-orm";
import { Router, Request, Response } from 'express';
import { requireOxyAuth, getRequiredOxyUserId } from '@oxy.so/core/server';
import { getDb } from "../db";
import { blocks, restricts, userBehaviors } from "../db/schema";
import {
  ensureUserSettings,
  extractPublicProfileData,
  settingsPatchFromBody,
  updateUserSettings,
} from '../utils/userSettings';
import { sendErrorResponse, sendSuccessResponse, validateRequired } from '../utils/apiHelpers';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Profile Settings API
 * All routes require authentication
 */

// Apply auth middleware to all routes
router.use(requireOxyAuth);

/**
 * GET /api/profile/settings/me
 * Get current user's settings
 */
router.get('/settings/me', async (req: Request, res: Response) => {
  try {
    const oxyUserId = getRequiredOxyUserId(req);
    const doc = await ensureUserSettings(oxyUserId);
    return sendSuccessResponse(res, 200, doc);
  } catch (err) {
    logger.error('[ProfileSettings] Error fetching my settings:', err);
    return sendErrorResponse(res, 500, 'Internal Server Error', 'Failed to fetch settings');
  }
});

/**
 * GET /api/profile/settings/:userId
 * Get settings by oxy user id
 */
router.get('/settings/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const validationError = validateRequired(userId, 'userId');
    if (validationError) {
      return sendErrorResponse(res, 400, 'Bad Request', validationError);
    }
    if (typeof userId !== 'string') {
      return sendErrorResponse(res, 400, 'Bad Request', 'userId must be a single value');
    }

    const requesterId = getRequiredOxyUserId(req);
    const doc = await ensureUserSettings(userId);

    // Only the owner may read their full settings (privacy lists, hidden words,
    // security flags). Everyone else gets just the public profile design data.
    if (requesterId === userId) {
      return sendSuccessResponse(res, 200, doc);
    }
    return sendSuccessResponse(res, 200, extractPublicProfileData(doc, userId));
  } catch (err) {
    logger.error('[ProfileSettings] Error fetching user settings:', err);
    return sendErrorResponse(res, 500, 'Internal Server Error', 'Failed to fetch settings');
  }
});

/**
 * PUT /api/profile/settings
 * Update current user's settings
 */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const oxyUserId = getRequiredOxyUserId(req);
    const doc = await updateUserSettings(oxyUserId, settingsPatchFromBody(req.body));

    return sendSuccessResponse(res, 200, doc);
  } catch (err) {
    logger.error('[ProfileSettings] Error updating settings:', err);
    return sendErrorResponse(res, 500, 'Internal Server Error', 'Failed to update settings');
  }
});

/**
 * DELETE /api/profile/settings/behavior
 * Reset user behavior/preferences
 */
router.delete('/settings/behavior', async (req: Request, res: Response) => {
  try {
    const oxyUserId = getRequiredOxyUserId(req);
    const rows = await getDb()
      .delete(userBehaviors)
      .where(eq(userBehaviors.oxyUserId, oxyUserId))
      .returning({ id: userBehaviors.id });

    return sendSuccessResponse(
      res,
      200,
      { success: true },
      rows.length > 0
        ? 'Personalization data reset successfully'
        : 'No personalization data to reset'
    );
  } catch (err) {
    logger.error('[ProfileSettings] Error resetting user behavior:', err);
    return sendErrorResponse(res, 500, 'Internal Server Error', 'Failed to reset personalization data');
  }
});

/**
 * Block management endpoints
 */

router.get('/blocks', async (req: Request, res: Response) => {
  try {
    const oxyUserId = getRequiredOxyUserId(req);
    const rows = await getDb()
      .select({ blockedId: blocks.blockedId })
      .from(blocks)
      .where(eq(blocks.userId, oxyUserId))
      .orderBy(desc(blocks.createdAt), desc(blocks.id));

    return sendSuccessResponse(res, 200, {
      blockedUsers: rows.map((row) => row.blockedId),
    });
  } catch (err) {
    logger.error('[ProfileSettings] Error fetching blocked users:', err);
    return sendErrorResponse(res, 500, 'Internal Server Error', 'Failed to fetch blocked users');
  }
});

router.post('/blocks', async (req: Request, res: Response) => {
  try {
    const oxyUserId = getRequiredOxyUserId(req);
    const { blockedId } = req.body;
    
    const validationError = validateRequired(blockedId, 'blockedId');
    if (validationError || typeof blockedId !== 'string') {
      return sendErrorResponse(res, 400, 'Bad Request', 'Missing or invalid blockedId');
    }

    if (oxyUserId === blockedId) {
      return sendErrorResponse(res, 400, 'Bad Request', 'Cannot block yourself');
    }

    const inserted = await getDb()
      .insert(blocks)
      .values({ id: uuidv7(), userId: oxyUserId, blockedId })
      .onConflictDoNothing({ target: [blocks.userId, blocks.blockedId] })
      .returning({ id: blocks.id });
    return inserted.length === 0
      ? sendSuccessResponse(res, 200, { success: true }, 'User already blocked')
      : sendSuccessResponse(res, 201, { success: true }, 'User blocked successfully');
  } catch (err: unknown) {
    logger.error('[ProfileSettings] Error blocking user:', err);
    return sendErrorResponse(res, 500, 'Internal Server Error', 'Failed to block user');
  }
});

router.delete('/blocks/:blockedId', async (req: Request, res: Response) => {
  try {
    const oxyUserId = getRequiredOxyUserId(req);
    const { blockedId } = req.params;
    
    const validationError = validateRequired(blockedId, 'blockedId');
    if (validationError || typeof blockedId !== "string") {
      return sendErrorResponse(res, 400, 'Bad Request', validationError);
    }

    const rows = await getDb()
      .delete(blocks)
      .where(and(eq(blocks.userId, oxyUserId), eq(blocks.blockedId, blockedId)))
      .returning({ id: blocks.id });

    if (rows.length === 0) {
      return sendErrorResponse(res, 404, 'Not Found', 'Block not found');
    }

    return sendSuccessResponse(res, 200, { success: true }, 'User unblocked successfully');
  } catch (err) {
    logger.error('[ProfileSettings] Error unblocking user:', err);
    return sendErrorResponse(res, 500, 'Internal Server Error', 'Failed to unblock user');
  }
});

/**
 * Restricted users management endpoints
 */

router.get('/restricts', async (req: Request, res: Response) => {
  try {
    const oxyUserId = getRequiredOxyUserId(req);
    const rows = await getDb()
      .select({ restrictedId: restricts.restrictedId })
      .from(restricts)
      .where(eq(restricts.userId, oxyUserId))
      .orderBy(desc(restricts.createdAt), desc(restricts.id));

    return sendSuccessResponse(res, 200, {
      restrictedUsers: rows.map((row) => row.restrictedId),
    });
  } catch (err) {
    logger.error('[ProfileSettings] Error fetching restricted users:', err);
    return sendErrorResponse(res, 500, 'Internal Server Error', 'Failed to fetch restricted users');
  }
});

router.post('/restricts', async (req: Request, res: Response) => {
  try {
    const oxyUserId = getRequiredOxyUserId(req);
    const { restrictedId } = req.body;
    
    const validationError = validateRequired(restrictedId, 'restrictedId');
    if (validationError || typeof restrictedId !== 'string') {
      return sendErrorResponse(res, 400, 'Bad Request', 'Missing or invalid restrictedId');
    }

    if (oxyUserId === restrictedId) {
      return sendErrorResponse(res, 400, 'Bad Request', 'Cannot restrict yourself');
    }

    const inserted = await getDb()
      .insert(restricts)
      .values({ id: uuidv7(), userId: oxyUserId, restrictedId })
      .onConflictDoNothing({ target: [restricts.userId, restricts.restrictedId] })
      .returning({ id: restricts.id });
    return inserted.length === 0
      ? sendSuccessResponse(res, 200, { success: true }, 'User already restricted')
      : sendSuccessResponse(res, 201, { success: true }, 'User restricted successfully');
  } catch (err: unknown) {
    logger.error('[ProfileSettings] Error restricting user:', err);
    return sendErrorResponse(res, 500, 'Internal Server Error', 'Failed to restrict user');
  }
});

router.delete('/restricts/:restrictedId', async (req: Request, res: Response) => {
  try {
    const oxyUserId = getRequiredOxyUserId(req);
    const { restrictedId } = req.params;
    
    const validationError = validateRequired(restrictedId, 'restrictedId');
    if (validationError || typeof restrictedId !== "string") {
      return sendErrorResponse(res, 400, 'Bad Request', validationError);
    }

    const rows = await getDb()
      .delete(restricts)
      .where(and(eq(restricts.userId, oxyUserId), eq(restricts.restrictedId, restrictedId)))
      .returning({ id: restricts.id });

    if (rows.length === 0) {
      return sendErrorResponse(res, 404, 'Not Found', 'Restrict not found');
    }

    return sendSuccessResponse(res, 200, { success: true }, 'User unrestricted successfully');
  } catch (err) {
    logger.error('[ProfileSettings] Error unrestricting user:', err);
    return sendErrorResponse(res, 500, 'Internal Server Error', 'Failed to unrestrict user');
  }
});

export default router;
