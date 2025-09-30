import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/server/auth/requireAdmin';

type TS = FirebaseFirestore.Timestamp;
const isTS = (v: unknown): v is TS =>
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof v === 'object' && v !== null && 'toDate' in (v as any);

const parseSqlishToIso = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return;
  const [, Y, M, D, h, m2, s] = m;
  const dt = new Date(Date.UTC(+Y, +M - 1, +D, +h, +m2, +s));
  return dt.toISOString();
};

const toMillis = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const iso = parseSqlishToIso(v) ?? v;
    const t = Date.parse(iso as string);
    return Number.isFinite(t) ? t : undefined;
  }
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

interface StoreOut {
  id: string;
  provider?: string;
  storeId?: number | string | null;
  name?: string;
  email?: string;
  username?: string;
  domain?: string | null;
  connected?: boolean;
  installed?: boolean;
  plan?: string | null;
  createdAt?: string;
  lastActive?: string;
  status?: 'active' | 'inactive' | 'suspended';
  usage?: { invitesUsed?: number; monthKey?: string; updatedAt?: string };
}
interface StoresResponse {
  stores: StoreOut[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StoresResponse | { message: string; error?: string }>,
) {
  try {
    const admin = await requireAdmin(req);
    if (!admin?.uid) return res.status(403).json({ message: 'unauthorized' });

    if (req.query.debug === '1') {
      const db = dbAdmin();
      const snap = await db.collection('stores').orderBy('__name__').limit(5).get();
      return res.status(200).json({
        // @ts-expect-error debug
        ok: true,
        sampleCount: snap.size,
        ids: snap.docs.map(d => d.id),
        first: snap.docs[0]?.data() ?? null,
      });
    }

    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

    const db = dbAdmin();

    const {
      page = '1',
      limit: limitParam = '50',
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      filterConnected,
      status,
      cursor,
      provider,
    } = req.query as Record<string, string>;

    const limitNum = Math.min(100, Math.max(1, parseInt(limitParam, 10)));
    const pageNum = Math.max(1, parseInt(page, 10));
    const sortDirection: FirebaseFirestore.OrderByDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    const searchTerm = (search || '').toLowerCase().trim();

    let base: FirebaseFirestore.Query = db.collection('stores');
    if (provider) base = base.where('provider', '==', provider);
    if (filterConnected === 'connected') base = base.where('salla.connected', '==', true);
    else if (filterConnected === 'disconnected') base = base.where('salla.connected', '==', false);
    if (status && ['active', 'inactive', 'suspended'].includes(status)) {
      base = base.where('status', '==', status);
    }

    const validSort = ['createdAt', 'lastActive', 'name', 'email'];
    let orderField = validSort.includes(sortBy) ? sortBy : 'lastActive';
    if (orderField === 'createdAt' || orderField === 'lastActive') orderField = 'salla.updatedAt';
    else if (orderField === 'name') orderField = 'merchant.name';
    else if (orderField === 'email') orderField = 'email';

    let snap: FirebaseFirestore.QuerySnapshot | null = null;
    try {
      let q = base.orderBy(orderField || '__name__', sortDirection).limit(limitNum + 1);
      if (cursor) {
        const cd = await db.collection('stores').doc(cursor).get();
        if (cd.exists) q = q.startAfter(cd);
      }
      snap = await q.get();
    } catch {
      /* ignore */
    }
    if (!snap || snap.empty) {
      let q = base.orderBy('__name__', sortDirection).limit(limitNum + 1);
      if (cursor) {
        const cd = await db.collection('stores').doc(cursor).get();
        if (cd.exists) q = q.startAfter(cd);
      }
      snap = await q.get();
    }
    if (!snap || snap.empty) {
      snap = await db.collection('stores').limit(limitNum + 1).get();
    }

    let stores: StoreOut[] = snap.docs.map((doc) => {
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = doc.data() as any;
      const merchant = d.merchant || {};
      const salla = d.salla || {};
      const domain = d.domain || {};
      const ctx = d.context || {};
      const meta = d.meta || {};
      const usage = d.usage || {};

      const lastActiveMs = latestMillis(
        d.lastActive,
        meta.updatedAt,
        salla.updatedAt,
        usage.updatedAt,
        domain.updatedAt,
      );
      const lastActiveIso = lastActiveMs ? new Date(lastActiveMs).toISOString() : undefined;

      // استخراج اسم المتجر من أكثر من مصدر، أو من الدومين أو uid إذا لم يوجد
      const name: string | undefined =
        merchant.name ||
        d.storeName ||
        d.name ||
        ctx.name ||
        domain.name ||
        (typeof salla.domain === 'string' ? (() => { try { return new URL(salla.domain).hostname; } catch { return undefined; } })() : undefined) ||
        (typeof domain.base === 'string' ? (() => { try { return new URL(domain.base).hostname; } catch { return undefined; } })() : undefined) ||
        (typeof d.uid === 'string' ? d.uid : undefined);

      // استخراج البريد من أكثر من مصدر، أو بريد افتراضي من uid إذا لم يوجد
      const email: string | undefined =
        merchant.email || undefined;

      // استخراج اسم المستخدم من أكثر من مصدر، أو من uid إذا لم يوجد
      const username: string | undefined =
        merchant.username ||
        salla.username ||
        d.username ||
        ctx.username ||
        domain.username ||
        (typeof d.uid === 'string' ? d.uid.split(':')[1] : undefined);

      const domainBase: string | undefined =
        domain.base ||
        salla.domain ||
        merchant.domain ||
        d.domain ||
        undefined;

      // استخراج تاريخ التسجيل من أكثر من مصدر، أو من updatedAt إذا لم يوجد
      const createdIso: string | undefined =
        toIso(d.createdAt) ||
        parseSqlishToIso(merchant.created_at) ||
        parseSqlishToIso(ctx.created_at) ||
        parseSqlishToIso(salla.created_at) ||
        parseSqlishToIso(domain.created_at) ||
        toIso(d.updatedAt) ||
        toIso(usage.updatedAt) ||
        toIso(meta.updatedAt) ||
        undefined;

      const plan: string | null = merchant.plan ?? null;
      const connected: boolean = !!(salla.connected ?? d.connected);
      const installed: boolean = !!salla.installed;
      const computedStatus: 'active' | 'inactive' | 'suspended' =
        d.status === 'suspended' ? 'suspended' : connected ? 'active' : 'inactive';

      // يمكنك إزالة هذا بعد التأكد من ظهور الداتا بشكل صحيح
      // console.log('store doc:', d);

      return {
        id: doc.id,
        provider: d.provider || 'salla',
        storeId: salla.storeId ?? merchant.id ?? null,
        name,
        email,
        username,
        domain: domainBase ?? undefined,
        connected,
        installed,
        plan,
        createdAt: createdIso,
        lastActive: lastActiveIso,
        status: computedStatus,
        usage: {
          invitesUsed: typeof usage.invitesUsed === 'number' ? usage.invitesUsed : undefined,
          monthKey: typeof usage.monthKey === 'string' ? usage.monthKey : undefined,
          updatedAt: toIso(usage.updatedAt),
        },
      };
    });

    if (searchTerm) {
      const needle = searchTerm;
      stores = stores.filter((s) =>
        [s.id, s.name, s.email, s.username, s.domain, s.plan, String(s.storeId ?? '')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }

    const hasMore = stores.length > limitNum;
    let nextCursor: string | null = null;
    if (hasMore) {
      const last = snap.docs[limitNum];
      nextCursor = last?.id ?? null;
      stores = stores.slice(0, limitNum);
    }

    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({
      stores,
      total: pageNum === 1 ? stores.length + (hasMore ? 1 : 0) : -1,
      page: pageNum,
      limit: limitNum,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error('Admin Stores API Error:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: 'Internal Server Error' });
  }
}