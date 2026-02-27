// src/pages/api/zid/refresh.ts
// Refreshes Zid OAuth tokens — delegates to ZidTokenService

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/backend/server/auth/requireUser';
import { ZidTokenService } from '@/backend/server/services/zid-token.service';
import { dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const tokenService = ZidTokenService.getInstance();

  // Support both user-initiated and cron-based refresh
  const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
  const isCron = cronSecret === process.env.CRON_SECRET;

  if (isCron) {
    // Cron mode: refresh by storeId from body
    const { storeId, refreshToken } = req.body as { storeId?: string; refreshToken?: string };
    if (!storeId || !refreshToken) {
      return res.status(400).json({ error: 'Missing storeId or refreshToken' });
    }

    const result = await tokenService.refreshToken(storeId, refreshToken);
    return res.status(result.success ? 200 : 500).json(result);
  }

  // User mode: refresh for authenticated user
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = dbAdmin();
    const storeDoc = await db.collection('stores').doc(user.uid).get();
    const zidStoreId = storeDoc.data()?.zid?.storeId;

    if (!zidStoreId) {
      return res.status(400).json({ error: 'No Zid store linked' });
    }

    const tokens = await tokenService.getValidTokens(zidStoreId);
    if (!tokens) {
      return res.status(500).json({ error: 'Token refresh failed' });
    }

    return res.status(200).json({
      ok: true,
      expires_at: tokens.expires_at,
    });
  } catch (err) {
    console.error('[ZID_REFRESH] Error:', err);
    return res.status(500).json({ error: 'refresh_failed' });
  }
}
