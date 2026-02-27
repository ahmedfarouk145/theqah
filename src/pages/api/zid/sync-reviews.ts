// src/pages/api/zid/sync-reviews.ts
// Manual trigger endpoint for syncing reviews from a specific Zid store
// Delegates to ZidReviewSyncService

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/backend/server/auth/requireUser';
import { ZidTokenService } from '@/backend/server/services/zid-token.service';
import { ZidReviewSyncService } from '@/backend/server/services/zid-review-sync.service';
import { dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).end();

    let user;
    try {
        user = await requireUser(req);
    } catch {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const db = dbAdmin();
        const storeDoc = await db.collection('stores').doc(user.uid).get();
        const storeData = storeDoc.data();
        const zidStoreId = storeData?.zid?.storeId;

        if (!zidStoreId || !storeData?.zid?.connected) {
            return res.status(400).json({ error: 'Zid not connected' });
        }

        // Get valid tokens
        const tokenService = ZidTokenService.getInstance();
        const tokens = await tokenService.getValidTokens(zidStoreId);
        if (!tokens) {
            return res.status(401).json({ error: 'Invalid or expired tokens' });
        }

        // Sync reviews
        const syncService = new ZidReviewSyncService();
        const result = await syncService.syncReviewsForStore(
            user.uid,
            zidStoreId,
            tokens,
            {
                sinceDays: 30,
                subscriptionStart: storeData.subscription?.startedAt,
            }
        );

        console.log(`[ZID_SYNC] Manual sync for ${user.uid}: ${JSON.stringify(result)}`);
        return res.status(200).json({ ok: true, ...result });
    } catch (err) {
        console.error('[ZID_SYNC] Error:', err);
        return res.status(500).json({ error: 'sync_failed' });
    }
}
