// src/pages/api/admin/subscriptions/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

type PlanId = 'STARTER' | 'SALES_BOOST' | 'EXPANSION' | string;

const PLAN_LIMITS: Record<PlanId, number> = {
  STARTER: 100, SALES_BOOST: 250, EXPANSION: 600,
  P30: 100, P60: 250, P120: 600,
};

function getInvitesLimit(planId?: PlanId): number {
  return planId ? PLAN_LIMITS[planId] ?? 0 : 0;
}

function monthKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  // Auth check
  const authHeader = req.headers.authorization;
  const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!adminSecret || !authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const db = dbAdmin();
    const storesSnap = await db.collection('stores').where('provider', '==', 'salla').limit(200).get();

    const out = [];

    for (const d of storesSnap.docs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (d.data() || {}) as any;
      const storeUid = s.uid || d.id;
      const planId = s.subscription?.planId as PlanId | undefined;
      const invitesLimit = getInvitesLimit(planId);

      // Legacy invite tracking was removed; only persisted usage counts remain.
      let invitesUsed = 0;
      if (s.usage?.monthKey === monthKey() && typeof s.usage?.invitesUsed === 'number') {
        invitesUsed = s.usage.invitesUsed;
      }

      // Derive status
      let status: 'active' | 'over_quota' | 'lapsed' | 'no_plan' = 'no_plan';
      if (planId) {
        const syncedAt = s.subscription?.syncedAt ?? s.subscription?.updatedAt;
        const stale = typeof syncedAt === 'number' ? (Date.now() - syncedAt > 35 * 24 * 60 * 60 * 1000) : true;
        if (stale) status = 'lapsed';
        else if (invitesUsed >= invitesLimit) status = 'over_quota';
        else status = 'active';
      }

      out.push({
        storeUid,
        domainBase: s.domain?.base || s.salla?.domain,
        planId,
        invitesUsed,
        invitesLimit,
        status,
        sallaInstalled: !!s.salla?.installed,
        sallaConnected: !!s.salla?.connected,
        lastUpdate: s.updatedAt,
      });
    }

    const grouped = {
      active: out.filter(x => x.status === 'active'),
      over_quota: out.filter(x => x.status === 'over_quota'),
      lapsed: out.filter(x => x.status === 'lapsed'),
      no_plan: out.filter(x => x.status === 'no_plan'),
      all: out,
    };

    return res.status(200).json({ ok: true, grouped, count: out.length, month: monthKey() });
  } catch (err) {
    console.error('[subscriptions] error:', err);
    return res.status(500).json({ error: 'internal_error', message: err instanceof Error ? err.message : 'Unknown error' });
  }
}
