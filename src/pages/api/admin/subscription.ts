// src/pages/api/admin/subscription.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { fetchAppSubscriptions } from '@/lib/sallaClient';
import { mapSallaPlanToInternal } from '@/config/plans';
import { requireAdmin } from '@/server/auth/requireAdmin';

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const auth = await requireAdmin(req);
  if (!auth || !auth.uid) return res.status(403).json({ ok: false, error: 'unauthorized' });

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

  try {
    const raw: unknown = await fetchAppSubscriptions(storeUid);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr = Array.isArray((raw as any)?.data) ? (raw as any).data : Array.isArray(raw) ? raw : [];
    const first = arr.length ? arr[0] : null;
    const planName: string | null = first?.plan_name ?? first?.name ?? null;
    const planType: string | null = first?.plan_type ?? null;
    const nextPlanId = mapSallaPlanToInternal(planName, planType as 'monthly' | 'annual' | null) ?? null;

    const samePlan = (cur?.planId ?? null) === nextPlanId;
    const sameSnapshot = JSON.stringify(cur?.raw ?? null) === JSON.stringify(raw ?? null);

    if (!samePlan || !sameSnapshot) {
      await ref.set({ subscription: { raw, syncedAt: Date.now(), planId: nextPlanId }, updatedAt: Date.now() }, { merge: true });
    } else {
      await ref.set({ subscription: { ...cur, syncedAt: Date.now() }, updatedAt: Date.now() }, { merge: true });
    }

    return reply({ subscription: { planId: nextPlanId, raw } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.collection('webhook_errors').add({ at: Date.now(), scope: 'subscription_fetch', storeUid, error: msg }).catch(console.error);
    return res.status(200).json({ ok: true, subscription: cur ?? null, stale: true, warn: 'fetch_failed', message: msg });
  }
}
