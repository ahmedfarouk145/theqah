// src/pages/api/_admin/zid-maintenance.ts
// Admin endpoint: clears stale idempotency entries + re-registers failed webhooks
// Usage: POST /api/_admin/zid-maintenance
// Auth: Bearer <CRON_SECRET>

import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { ZidTokenService } from '@/backend/server/services/zid-token.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Auth via CRON_SECRET
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = dbAdmin();
    const results: Record<string, unknown> = {};

    // ── Task 1: Clear stale idempotency entries (event == "") ──
    try {
        const staleSnap = await db
            .collection('webhooks_zid')
            .where('event', '==', '')
            .get();

        if (staleSnap.empty) {
            results.idempotency = { deleted: 0, message: 'No stale entries found' };
        } else {
            // Firestore batch delete (max 500 per batch)
            const batches: FirebaseFirestore.WriteBatch[] = [];
            let currentBatch = db.batch();
            let count = 0;

            for (const doc of staleSnap.docs) {
                currentBatch.delete(doc.ref);
                count++;
                if (count % 500 === 0) {
                    batches.push(currentBatch);
                    currentBatch = db.batch();
                }
            }
            batches.push(currentBatch);

            for (const batch of batches) {
                await batch.commit();
            }

            results.idempotency = { deleted: count, message: `Cleared ${count} stale entries` };
        }
        console.log(`[ZID_MAINT] Idempotency cleanup:`, results.idempotency);
    } catch (err) {
        console.error('[ZID_MAINT] Idempotency cleanup error:', err);
        results.idempotency = { error: err instanceof Error ? err.message : String(err) };
    }

    // ── Task 2: Re-register order.payment_status.update webhook for all connected stores ──
    try {
        const storesSnap = await db
            .collection('stores')
            .where('zid.connected', '==', true)
            .get();

        if (storesSnap.empty) {
            results.webhookRegistration = { stores: 0, message: 'No connected ZID stores' };
        } else {
            const tokenService = ZidTokenService.getInstance();
            const ZID_API_URL = process.env.ZID_API_URL || 'https://api.zid.sa/v1';
            const appId = process.env.ZID_CLIENT_ID || '';
            const webhookTargetUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://www.theqah.com.sa'}/api/zid/webhook`;

            const storeResults: Array<{ storeUid: string; zidStoreId: string; status: string; detail?: string }> = [];

            for (const storeDoc of storesSnap.docs) {
                const storeData = storeDoc.data();
                const storeUid = storeDoc.id;
                const zidStoreId = storeData.zid?.storeId;

                if (!zidStoreId) {
                    storeResults.push({ storeUid, zidStoreId: '', status: 'skipped', detail: 'no zidStoreId' });
                    continue;
                }

                try {
                    const tokens = await tokenService.getValidTokens(zidStoreId);
                    if (!tokens) {
                        storeResults.push({ storeUid, zidStoreId, status: 'skipped', detail: 'no valid tokens' });
                        continue;
                    }

                    const reqBody = JSON.stringify({
                        event: 'order.payment_status.update',
                        target_url: webhookTargetUrl,
                        original_id: appId,
                        conditions: {},
                    });

                    const response = await fetch(`${ZID_API_URL}/managers/webhooks`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${tokens.authorization}`,
                            'X-Manager-Token': tokens.access_token,
                            'Accept': 'application/json',
                            'Accept-Language': 'en',
                            'Content-Type': 'application/json',
                        },
                        body: reqBody,
                    });

                    const responseText = await response.text();

                    if (response.ok) {
                        storeResults.push({ storeUid, zidStoreId, status: 'registered', detail: `HTTP ${response.status}` });
                    } else if (response.status === 409 || response.status === 422) {
                        // Already registered
                        storeResults.push({ storeUid, zidStoreId, status: 'already_registered', detail: `HTTP ${response.status}` });
                    } else {
                        storeResults.push({ storeUid, zidStoreId, status: 'failed', detail: `HTTP ${response.status}: ${responseText.substring(0, 200)}` });
                    }
                } catch (storeErr) {
                    storeResults.push({
                        storeUid,
                        zidStoreId,
                        status: 'error',
                        detail: storeErr instanceof Error ? storeErr.message : String(storeErr),
                    });
                }
            }

            results.webhookRegistration = {
                stores: storesSnap.size,
                event: 'order.payment_status.update',
                targetUrl: webhookTargetUrl,
                storeResults,
            };
        }
        console.log(`[ZID_MAINT] Webhook registration:`, JSON.stringify(results.webhookRegistration));
    } catch (err) {
        console.error('[ZID_MAINT] Webhook registration error:', err);
        results.webhookRegistration = { error: err instanceof Error ? err.message : String(err) };
    }

    return res.status(200).json({ ok: true, results });
}
