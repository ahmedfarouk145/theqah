// src/pages/api/admin/stores.ts - Cleaned up version
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/server/auth/requireAdmin';

type TS = FirebaseFirestore.Timestamp;
const isTS = (v: unknown): v is TS => typeof v === 'object' && v !== null && 'toDate' in (v as Record<string, unknown>);

const toMillis = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v;
  if (isTS(v)) return v.toDate().getTime();
  return undefined;
};

const toIso = (v: unknown): string | undefined => {
  const ms = toMillis(v);
  return typeof ms === 'number' ? new Date(ms).toISOString() : undefined;
};

const latestMillis = (...vals: unknown[]): number | undefined => {
  const arr = vals.map(toMillis).filter((n): n is number => Number.isFinite(n as number));
  return arr.length ? Math.max(...arr) : undefined;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const admin = await requireAdmin(req);
    if (!admin?.uid) return res.status(403).json({ message: 'unauthorized' });
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

    const db = dbAdmin();
    const { limit: limitParam = '50', search = '', sortOrder = 'desc', filterConnected, status, cursor, provider } = req.query as Record<string, string>;

    const limitNum = Math.min(100, Math.max(1, parseInt(limitParam, 10)));
    const sortDirection: FirebaseFirestore.OrderByDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    const searchTerm = (search || '').toLowerCase().trim();

    let base: FirebaseFirestore.Query = db.collection('stores');
    if (provider) base = base.where('provider', '==', provider);
    if (filterConnected === 'connected') base = base.where('salla.connected', '==', true);
    else if (filterConnected === 'disconnected') base = base.where('salla.connected', '==', false);
    if (status && ['active', 'inactive', 'suspended'].includes(status)) base = base.where('status', '==', status);

    let q = base.orderBy('__name__', sortDirection).limit(limitNum + 1);
    if (cursor) {
      const cd = await db.collection('stores').doc(cursor).get();
      if (cd.exists) q = q.startAfter(cd);
    }

    const snap = await q.get();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stores = snap.docs.map((doc: any) => {
      const d = doc.data();
      const merchant = d.merchant || {};
      const salla = d.salla || {};
      const domain = d.domain || {};
      const usage = d.usage || {};
      const meta = d.meta || {};

      const lastActiveMs = latestMillis(d.lastActive, meta.updatedAt, salla.updatedAt, usage.updatedAt, domain.updatedAt);
      const name = merchant.name || d.storeName || d.name || domain.name || (typeof d.uid === 'string' ? d.uid : undefined);

      return {
        id: doc.id,
        provider: d.provider || 'salla',
        storeId: salla.storeId ?? merchant.id ?? null,
        name,
        email: merchant.email || undefined,
        username: merchant.username || salla.username || d.username,
        domain: domain.base || salla.domain || merchant.domain,
        connected: !!(salla.connected ?? d.connected),
        installed: !!salla.installed,
        plan: merchant.plan ?? null,
        createdAt: toIso(d.createdAt) || toIso(d.updatedAt),
        lastActive: lastActiveMs ? new Date(lastActiveMs).toISOString() : undefined,
        status: d.status === 'suspended' ? 'suspended' : !!(salla.connected ?? d.connected) ? 'active' : 'inactive',
        usage: { invitesUsed: usage.invitesUsed, monthKey: usage.monthKey, updatedAt: toIso(usage.updatedAt) },
      };
    });

    if (searchTerm) {
      stores = stores.filter((s: Record<string, unknown>) =>
        [s.id, s.name, s.email, s.username, s.domain, s.plan, String(s.storeId ?? '')].filter(Boolean).join(' ').toLowerCase().includes(searchTerm)
      );
    }

    const hasMore = stores.length > limitNum;
    const nextCursor = hasMore ? snap.docs[limitNum]?.id ?? null : null;
    if (hasMore) stores = stores.slice(0, limitNum);

    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({ stores, total: stores.length + (hasMore ? 1 : 0), page: 1, limit: limitNum, hasMore, nextCursor });
  } catch (error) {
    console.error('Admin Stores API Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}