// src/pages/api/cron/sync-zid-reviews.ts
// Cron job: syncs reviews from ALL connected Zid stores
// Delegates to ZidReviewSyncService per store

import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { ZidTokenService } from '@/backend/server/services/zid-token.service';
import { ZidReviewSyncService } from '@/backend/server/services/zid-review-sync.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Verify cron authorization
    const authHeader = req.headers.authorization;
    console.log(`[ZID_CRON] ▶ Incoming ${req.method}, auth=${authHeader ? 'present' : 'MISSING'}`);
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        console.warn(`[ZID_CRON] ❌ Unauthorized: header mismatch`);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[ZID_CRON] Starting Zid review sync...');
    const startTime = Date.now();

    try {
        const db = dbAdmin();

        // Find all connected Zid stores. Phase 3 of the Zid/Salla split:
        // post-cutover Zid stores live in `zid_stores`, while pre-cutover
        // Zid stores still live in legacy `stores`. We query both and
        // dedupe by doc.id so a lazy-migrated store isn't synced twice.
        const [legacySnap, zidSnap] = await Promise.all([
            db.collection('stores').where('zid.connected', '==', true).get(),
            db.collection('zid_stores').where('zid.connected', '==', true).get(),
        ]);

        // zid_stores first so it wins on conflict — its data is fresher.
        const docsByUid = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        for (const doc of [...zidSnap.docs, ...legacySnap.docs]) {
            if (!docsByUid.has(doc.id)) docsByUid.set(doc.id, doc);
        }

        if (docsByUid.size === 0) {
            console.log('[ZID_CRON] No connected Zid stores found');
            return res.status(200).json({ ok: true, stores: 0, message: 'No connected stores' });
        }

        const tokenService = ZidTokenService.getInstance();
        const syncService = new ZidReviewSyncService();

        const results: Array<{ storeUid: string; synced: number; skipped: number; errors: number }> = [];
        let totalSynced = 0;
        let totalErrors = 0;

        for (const storeDoc of docsByUid.values()) {
            const storeData = storeDoc.data();
            const storeUid = storeDoc.id;
            const zidStoreId = storeData.zid?.storeId;

            if (!zidStoreId) {
                console.log(`[ZID_CRON] Store ${storeUid} has no zidStoreId, skipping`);
                continue;
            }

            try {
                // Get valid tokens
                const tokens = await tokenService.getValidTokens(zidStoreId);
                if (!tokens) {
                    console.warn(`[ZID_CRON] No valid tokens for store ${storeUid}, skipping`);
                    totalErrors++;
                    continue;
                }

                // Sync reviews for this store
                const result = await syncService.syncReviewsForStore(
                    storeUid,
                    zidStoreId,
                    tokens,
                    {
                        sinceDays: 7,
                        subscriptionStart: storeData.subscription?.startedAt,
                    }
                );

                results.push({
                    storeUid,
                    synced: result.synced,
                    skipped: result.skipped,
                    errors: result.errors,
                });

                totalSynced += result.synced;
                totalErrors += result.errors;

            } catch (storeErr) {
                console.error(`[ZID_CRON] Error syncing store ${storeUid}:`, storeErr);
                totalErrors++;
            }
        }

        const elapsed = Date.now() - startTime;
        console.log(`[ZID_CRON] ✅ Done in ${elapsed}ms — ${docsByUid.size} stores, ${totalSynced} reviews synced, ${totalErrors} errors`);

        // Log sync run
        await db.collection('sync_logs').add({
            platform: 'zid',
            type: 'cron_review_sync',
            stores: docsByUid.size,
            totalSynced,
            totalErrors,
            results,
            durationMs: elapsed,
            timestamp: Date.now(),
        });

        return res.status(200).json({
            ok: true,
            stores: docsByUid.size,
            totalSynced,
            totalErrors,
            durationMs: elapsed,
        });
    } catch (err) {
        console.error('[ZID_CRON] Fatal error:', err);
        return res.status(500).json({ error: 'cron_failed' });
    }
}
