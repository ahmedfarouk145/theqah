// src/pages/api/admin/subscription.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { fetchAppSubscriptions } from '@/lib/sallaClient';
import { mapSallaPlanToInternal } from '@/config/plans';
import { extractSubscriptionExpiresAt, extractSubscriptionStartedAt } from '@/server/utils/subscription-dates';
import { verifyAdmin } from '@/utils/verifyAdmin';

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    await verifyAdmin(req);

    const storeUid = typeof req.query.storeUid === 'string' ? req.query.storeUid.trim() : '';
    const force = req.query.force === '1' || req.query.force === 'true';
    if (!storeUid) return res.status(400).json({ ok: false, error: 'missing_storeUid' });

    const db = dbAdmin();
    const ref = db.collection('stores').doc(storeUid);
    const snap = await ref.get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur = (snap.exists ? (snap.data()?.subscription as any) : {}) || {};
    const lastSynced = typeof cur.syncedAt === 'number' ? cur.syncedAt : 0;
    const isFresh = !force && lastSynced > 0 && Date.now() - lastSynced < TTL_MS;

    const reply = (payload: Record<string, unknown>, cached = false) => {
      res.setHeader('Cache-Control', 'private, max-age=60, must-revalidate');
      return res.status(200).json({ ok: true, ...payload, cached });
    };

    if (!storeUid.startsWith('salla:')) return reply({ subscription: cur ?? null }, true);
    if (isFresh) return reply({ subscription: cur ?? null }, true);

    const raw: unknown = await fetchAppSubscriptions(storeUid);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr = Array.isArray((raw as any)?.data) ? (raw as any).data : Array.isArray(raw) ? raw : [];
    const first = arr.length ? arr[0] : null;
    const planName: string | null = first?.plan_name ?? first?.name ?? null;
    const planType: string | null = first?.plan_type ?? null;
    const nextPlanId = mapSallaPlanToInternal(planName, planType as 'monthly' | 'annual' | null) ?? null;

    const samePlan = (cur?.planId ?? null) === nextPlanId;
    const sameSnapshot = JSON.stringify(cur?.raw ?? null) === JSON.stringify(raw ?? null);
    const firstRecord =
      first && typeof first === 'object'
        ? (first as Record<string, unknown>)
        : null;
    const startedAt = extractSubscriptionStartedAt(firstRecord);
    const expiresAt = extractSubscriptionExpiresAt(firstRecord);
    const now = Date.now();
    const isExpired = typeof expiresAt === 'number' && expiresAt <= now;

    if (!samePlan || !sameSnapshot || startedAt !== null || expiresAt !== null) {
      const updates: Record<string, unknown> = {
        updatedAt: now,
        'subscription.raw': raw,
        'subscription.syncedAt': now,
      };

      if (nextPlanId) {
        updates['subscription.planId'] = nextPlanId;
        updates['plan.code'] = nextPlanId;
      }
      if (startedAt !== null) {
        updates['subscription.startedAt'] = startedAt;
      }
      if (expiresAt !== null) {
        updates['subscription.expiresAt'] = expiresAt;
      }

      if (isExpired) {
        updates['subscription.expiredAt'] = typeof cur?.expiredAt === 'number' ? cur.expiredAt : expiresAt;
        updates['plan.active'] = false;
        updates['plan.expiredAt'] = expiresAt;
      } else if (nextPlanId) {
        updates['plan.active'] = true;
      }

      if (snap.exists) {
        await ref.update(updates);
      } else {
        await ref.set(updates, { merge: true });
      }
    } else {
      const heartbeatUpdate = {
        updatedAt: now,
        'subscription.syncedAt': now,
      };
      if (snap.exists) {
        await ref.update(heartbeatUpdate);
      } else {
        await ref.set(heartbeatUpdate, { merge: true });
      }
    }

    return reply({
      subscription: {
        ...cur,
        raw,
        planId: nextPlanId,
        syncedAt: now,
        ...(startedAt !== null ? { startedAt } : {}),
        ...(expiresAt !== null ? { expiresAt } : {}),
      },
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.message.startsWith('permission-denied')) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'ليس لديك صلاحية' });
    }
    if (err.message.startsWith('unauthenticated')) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'غير مصرح' });
    }

    const storeUid = typeof req.query.storeUid === 'string' ? req.query.storeUid.trim() : '';
    const db = dbAdmin();
    const ref = db.collection('stores').doc(storeUid);
    const snap = await ref.get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cur = (snap.exists ? (snap.data()?.subscription as any) : {}) || {};
    await db.collection('webhook_errors').add({ at: Date.now(), scope: 'subscription_fetch', storeUid, error: err.message }).catch(console.error);
    return res.status(200).json({ ok: true, subscription: cur ?? null, stale: true, warn: 'fetch_failed', message: err.message });
  }
}
