// src/pages/api/admin/reconcile-plan-active.ts
//
// Reconciles `plan.active` flags against Salla's *current* subscription
// list. Fixes stale-active flags left behind when a merchant cancels
// (subscription.expired webhook missed or never sent).
//
// Usage:
//   POST /api/admin/reconcile-plan-active
//   Authorization: Bearer <CRON_SECRET>
//   Body: { activeSallaStoreIds: ["1623177406", "438731147", ...] }
//
//   ?dryRun=1   — only return what WOULD change, don't write
//
// activeSallaStoreIds = the merchant ids currently shown as Active in
// Salla Partner Console → Subscriptions. Anything in our DB with
// plan.active=true that ISN'T in this list gets flipped to false.
//
// We don't touch Zid stores here — they have a separate webhook lifecycle.

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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST only' });
    }

    const body = (req.body ?? {}) as { activeSallaStoreIds?: unknown };
    const rawList = Array.isArray(body.activeSallaStoreIds) ? body.activeSallaStoreIds : null;
    if (!rawList) {
        return res.status(400).json({
            error: 'activeSallaStoreIds (array of merchant id strings) required in body',
        });
    }
    // Normalize to string set — handles numeric ids in the input list.
    const activeSet = new Set(rawList.map((v) => String(v).trim()).filter(Boolean));

    const dryRun = req.query.dryRun === '1';

    const db = dbAdmin();

    // Find all Salla stores currently flagged active.
    // We deliberately scan only the legacy `stores` collection — Salla
    // stores live there, not in `zid_stores`.
    const snap = await db.collection('stores')
        .where('plan.active', '==', true)
        .get();

    type StoreFields = {
        salla?: { storeId?: string | number; connected?: boolean };
        plan?: { active?: boolean };
    };

    const toDeactivate: Array<{ storeUid: string; sallaStoreId: string | null }> = [];
    const kept: Array<{ storeUid: string; sallaStoreId: string }> = [];
    const skipped: Array<{ storeUid: string; reason: string }> = [];

    for (const doc of snap.docs) {
        const storeUid = doc.id;
        const data = doc.data() as StoreFields;

        // Only act on Salla stores.
        if (!storeUid.startsWith('salla:') && !data.salla?.storeId) {
            skipped.push({ storeUid, reason: 'not_a_salla_store' });
            continue;
        }

        const sallaStoreId = data.salla?.storeId
            ? String(data.salla.storeId)
            : storeUid.startsWith('salla:')
                ? storeUid.slice('salla:'.length)
                : null;

        if (!sallaStoreId) {
            skipped.push({ storeUid, reason: 'no_salla_storeId_resolvable' });
            continue;
        }

        if (activeSet.has(sallaStoreId)) {
            kept.push({ storeUid, sallaStoreId });
        } else {
            toDeactivate.push({ storeUid, sallaStoreId });
        }
    }

    let updated = 0;
    if (!dryRun) {
        // Use a single batched commit per chunk — Firestore batch limit
        // is 500 ops, so we chunk defensively. Each store gets two
        // field updates: plan.active = false + deactivatedAt.
        const CHUNK = 400;
        for (let i = 0; i < toDeactivate.length; i += CHUNK) {
            const slice = toDeactivate.slice(i, i + CHUNK);
            const batch = db.batch();
            for (const item of slice) {
                batch.update(db.collection('stores').doc(item.storeUid), {
                    'plan.active': false,
                    'plan.deactivatedAt': Date.now(),
                    'plan.deactivatedBy': 'reconcile-plan-active',
                });
            }
            await batch.commit();
            updated += slice.length;
        }
    }

    return res.status(200).json({
        ok: true,
        dryRun,
        scanned: snap.size,
        keptActive: kept.length,
        wouldDeactivate: toDeactivate.length,
        updated,
        skipped,
        details: {
            toDeactivate: toDeactivate.slice(0, 100),
            kept: kept.slice(0, 100),
        },
    });
}
