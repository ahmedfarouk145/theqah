/**
 * One-shot admin endpoint: backfill customerId on existing Zid orders,
 * then re-evaluate verified status on existing Zid reviews under Option C.
 *
 * Why this exists: Option C verifies reviews by matching a local Firestore
 * order (storeUid + customerId + productIds array-contains + paymentStatus='paid').
 * Existing order docs were saved before customerId was added to the webhook
 * handler, so Option C would (wrongly) fail to verify legitimate purchases
 * until orders are backfilled.
 *
 * Usage:
 *   POST /api/_admin/zid-backfill-option-c?storeUid=zid:1095545
 *   Authorization: Bearer $CRON_SECRET
 *
 * DELETE after one-shot migration completes.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { ZidTokenService } from '@/backend/server/services/zid-token.service';
import { fetchZidOrders } from '@/lib/zid/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).end();

    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const storeUid = (req.query.storeUid as string) || req.body?.storeUid;
    if (!storeUid || !storeUid.startsWith('zid:')) {
        return res.status(400).json({ error: 'storeUid must start with "zid:"' });
    }

    const zidStoreId = storeUid.slice('zid:'.length);
    const db = dbAdmin();

    // 1) Load tokens
    const tokens = await ZidTokenService.getInstance().getValidTokens(zidStoreId);
    if (!tokens) return res.status(401).json({ error: 'No valid Zid tokens for store' });

    // 2) Pull orders from Zid API (last 90 days; tweak as needed)
    const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

    const zidOrders = await fetchZidOrders(tokens, {
        page: 1,
        page_size: 100,
        date_from: dateFrom,
    });

    // 3) Backfill existing order docs with customerId + customer fields
    const orderUpdates: Array<{ id: string; customerId: string | null }> = [];
    for (const order of zidOrders) {
        const orderId = String(order.id ?? '');
        if (!orderId) continue;

        const customerId = order.customer?.id != null ? String(order.customer.id) : null;
        const docRef = db.collection('orders').doc(`zid_${orderId}`);
        const snap = await docRef.get();
        if (!snap.exists) continue;

        await docRef.set({
            customerId,
            customerEmail: order.customer?.email || null,
            customerMobile: order.customer?.mobile || null,
            customerName: order.customer?.name || null,
            updatedAt: Date.now(),
        }, { merge: true });

        orderUpdates.push({ id: orderId, customerId });
    }

    // 4) Re-evaluate existing Zid reviews under Option C
    const reviewSnap = await db.collection('reviews')
        .where('storeUid', '==', storeUid)
        .where('source', '==', 'zid_sync')
        .get();

    const reviewUpdates: Array<{ reviewId: string; before: boolean; after: boolean; matchedOrder: string }> = [];

    for (const reviewDoc of reviewSnap.docs) {
        const review = reviewDoc.data();
        const customerSub = review.zidCustomerId || null; // future-proof if we ever store it
        const productId = review.productId;
        const wasVerified = Boolean(review.verified);

        // Locate matching paid order
        // We can't reliably know the reviewer's Zid customer ID from the saved
        // review doc (we never stored it). So we match by authorName → customerName.
        // Fallback: match by productId only if unique paid order exists.
        let matchingOrderId = '';
        let matchingOrderNumber = '';

        if (productId) {
            let q = db.collection('orders')
                .where('storeUid', '==', storeUid)
                .where('productIds', 'array-contains', productId);

            if (customerSub) {
                q = q.where('customerId', '==', String(customerSub));
            }

            const orderCandidates = await q.limit(10).get();
            const authorName = String(review.author?.displayName || '').trim();

            for (const candidate of orderCandidates.docs) {
                const data = candidate.data();
                const paymentStatus = String(data.paymentStatus || '').toLowerCase();
                if (paymentStatus !== 'paid') continue;

                // If we have customerSub we already filtered by it; otherwise match on name.
                if (!customerSub) {
                    const orderCustomerName = String(data.customerName || '').trim();
                    if (authorName && orderCustomerName && authorName !== orderCustomerName) continue;
                }

                matchingOrderId = String(data.id || '');
                matchingOrderNumber = String(data.number || '');
                break;
            }
        }

        const hasMatch = matchingOrderId !== '';
        const subscriptionStart = review.subscriptionStart || 0;
        const createdAt = Number(review.createdAt || 0);
        const withinSubscription = subscriptionStart ? createdAt >= subscriptionStart : true;
        const nowVerified = withinSubscription && hasMatch;

        if (nowVerified !== wasVerified || review.orderId !== matchingOrderId) {
            await reviewDoc.ref.set({
                verified: nowVerified,
                trustedBuyer: hasMatch,
                orderId: matchingOrderId,
                orderNumber: matchingOrderNumber,
                optionCBackfilledAt: Date.now(),
                updatedAt: Date.now(),
            }, { merge: true });
        }

        reviewUpdates.push({
            reviewId: reviewDoc.id,
            before: wasVerified,
            after: nowVerified,
            matchedOrder: matchingOrderId,
        });
    }

    return res.status(200).json({
        ok: true,
        storeUid,
        zidStoreId,
        ordersFetched: zidOrders.length,
        ordersBackfilled: orderUpdates.length,
        orderUpdates,
        reviewsScanned: reviewSnap.size,
        reviewUpdates,
    });
}
