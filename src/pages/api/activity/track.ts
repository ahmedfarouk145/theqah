// src/pages/api/activity/track.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ActivityService } from '@/server/services/activity.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const activityService = new ActivityService();

    const sessionCookie = activityService.getSessionCookie(req);
    if (!sessionCookie) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { userId, storeUid } = await activityService.getUserFromSession(sessionCookie);
    const { action, metadata } = req.body;

    if (!activityService.isValidAction(action)) {
      return res.status(400).json({ error: 'action required' });
    }

    await activityService.track({ userId, storeUid, action, metadata, req });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Activity Track API Error]:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
