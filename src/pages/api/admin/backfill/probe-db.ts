// src/pages/api/admin/backfill/probe-db.ts
//
// Admin diagnostic: count reviews in Firestore for a given storeUid
// broken down by source/status. Used to verify what the certificate
// page is actually counting and where it came from.

import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

function extractBearerToken(header: string | undefined): string {
    if (!header) return '';
    const m = header.trim().match(/^Bearer\s+(\S+)\s*$/);
    return m ? m[1] : '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const auth = extractBearerToken(req.headers.authorization);
    if (!auth || auth !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const storeUid = String(req.query.storeUid || '');
    if (!storeUid) return res.status(400).json({ error: 'storeUid required' });

    const db = dbAdmin();
    const collectionName = storeUid.startsWith('zid:') ? 'zid_reviews' : 'reviews';
    const snap = await db.collection(collectionName)
        .where('storeUid', '==', storeUid)
        .get();

    let total = 0;
    let verified = 0;
    let withSallaReviewId = 0;
    let backfillDocs = 0;
    let realtimeDocs = 0;
    const sourceCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    const samples: Array<Record<string, unknown>> = [];

    for (const doc of snap.docs) {
        total++;
        const d = doc.data() as Record<string, unknown>;
        if (d.verified === true) verified++;
        if (d.sallaReviewId) withSallaReviewId++;
        if (doc.id.startsWith('salla_backfill_')) backfillDocs++;
        else if (doc.id.startsWith('salla_')) realtimeDocs++;
        const src = String(d.source ?? 'unknown');
        sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
        const st = String(d.status ?? 'unknown');
        statusCounts[st] = (statusCounts[st] ?? 0) + 1;

        if (samples.length < 3) {
            samples.push({
                docId: doc.id,
                source: d.source,
                status: d.status,
                verified: d.verified,
                stars: d.stars,
                orderId: d.orderId,
                productId: d.productId,
                sallaReviewId: d.sallaReviewId,
                hasContent: typeof d.text === 'string' && (d.text as string).length > 0,
                publishedAt: d.publishedAt,
            });
        }
    }

    return res.status(200).json({
        storeUid,
        collection: collectionName,
        total,
        verified,
        withSallaReviewId,
        docsByPrefix: { backfill: backfillDocs, realtime: realtimeDocs },
        sourceCounts,
        statusCounts,
        samples,
    });
}
