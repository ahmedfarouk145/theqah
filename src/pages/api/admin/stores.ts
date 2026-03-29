// src/pages/api/admin/stores.ts - Cleaned up version
import type { NextApiRequest, NextApiResponse } from 'next';
import { LIMITS } from '@/config/constants';
import { dbAdmin } from '@/lib/firebaseAdmin';
import {
  buildAdminSubscriptionRow,
  type SubscriptionBucket,
} from '@/server/utils/admin-subscription-buckets';
import { verifyAdmin } from '@/utils/verifyAdmin';

type TS = FirebaseFirestore.Timestamp;
const isTS = (v: unknown): v is TS => typeof v === 'object' && v !== null && 'toDate' in (v as Record<string, unknown>);
const asRecord = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

const toMillis = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
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

const pickText = (...vals: unknown[]): string | undefined =>
  vals.find((value): value is string => typeof value === 'string' && value.trim().length > 0);

type DomainCandidate = {
  base?: string;
  updatedAt?: number;
  isCustomDomain?: boolean;
};

const pickScalarId = (...vals: unknown[]): string | number | null => {
  const value = vals.find(
    (item): item is string | number =>
      (typeof item === 'string' && item.trim().length > 0) ||
      (typeof item === 'number' && Number.isFinite(item)),
  );
  return value ?? null;
};

const isAliasStore = (docId: string, data: Record<string, unknown>) =>
  typeof data.storeUid === 'string' && data.storeUid !== docId;

const toHttpsUrl = (value: string): string => (/^https?:\/\//i.test(value) ? value : `https://${value}`);

const stripScheme = (value: string): string => value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

const isPlatformDomain = (value: string): boolean => {
  const normalized = stripScheme(value).toLowerCase();
  return (
    normalized === 'salla.sa' ||
    normalized.startsWith('salla.sa/') ||
    normalized.endsWith('.salla.sa') ||
    normalized === 'zid.store' ||
    normalized.endsWith('.zid.store') ||
    normalized === 'zid.sa' ||
    normalized.endsWith('.zid.sa')
  );
};

const scoreDomain = (candidate: DomainCandidate): number => {
  const base = pickText(candidate.base);
  if (!base) return -1;

  const normalized = stripScheme(base);
  const host = normalized.split('/')[0] || '';
  const hasPath = normalized.includes('/');
  const isCustom = candidate.isCustomDomain === true;
  const isPlatform = isPlatformDomain(base);
  const hasSubdomain = host.split('.').length > 2;

  return (
    (isCustom ? 100 : 0) +
    (!isPlatform ? 50 : 0) +
    (hasPath ? 20 : 0) +
    (hasSubdomain ? 10 : 0) +
    (candidate.updatedAt ?? 0) / 1_000_000_000_000
  );
};

const pickPreferredDomain = (
  current: DomainCandidate | undefined,
  incoming: DomainCandidate,
): DomainCandidate => {
  if (!current) return incoming;
  return scoreDomain(incoming) > scoreDomain(current) ? incoming : current;
};

const buildStorefrontUrl = (provider: string, username?: string): string | undefined => {
  if (!username) return undefined;

  const cleanUsername = username.replace(/^@+/, '').trim();
  if (!cleanUsername) return undefined;

  if (provider === 'salla') {
    return `https://salla.sa/${cleanUsername}`;
  }

  return undefined;
};

const inferProvider = (
  docId: string,
  data: Record<string, unknown>,
  salla: Record<string, unknown>,
  zid: Record<string, unknown>,
): string => {
  const explicit = pickText(data.provider, data.platform)?.toLowerCase();
  if (explicit === 'salla' || explicit === 'zid') {
    return explicit;
  }

  const uid = pickText(data.uid);
  if (docId.startsWith('zid:') || uid?.startsWith('zid:')) {
    return 'zid';
  }
  if (docId.startsWith('salla:') || uid?.startsWith('salla:')) {
    return 'salla';
  }

  const hasZidData = Boolean(
    zid.storeId ??
      zid.connected ??
      zid.installed ??
      zid.domain,
  );
  if (hasZidData) {
    return 'zid';
  }

  const hasSallaData = Boolean(
    salla.storeId ??
      salla.connected ??
      salla.installed ??
      salla.domain,
  );
  if (hasSallaData) {
    return 'salla';
  }

  return 'unknown';
};

const getDomain = (
  mappedDomain: string | undefined,
  domain: unknown,
  salla: Record<string, unknown>,
  zid: Record<string, unknown>,
  merchant: Record<string, unknown>,
  payloadMerchant: Record<string, unknown>,
  payloadStore: Record<string, unknown>,
  data: Record<string, unknown>,
  provider: string,
  username?: string,
) => {
  const directDomain = pickText(
    mappedDomain,
    typeof domain === 'string' ? domain : undefined,
    data.url,
    payloadStore.url,
    payloadMerchant.url,
  );
  if (directDomain && !isPlatformDomain(directDomain)) {
    return toHttpsUrl(directDomain);
  }

  const domainRecord = asRecord(domain);
  const fallbackDomain = pickText(
    directDomain,
    domainRecord.base,
    salla.url,
    salla.domain,
    zid.url,
    zid.domain,
    merchant.url,
    merchant.domain,
  );

  if (fallbackDomain && !isPlatformDomain(fallbackDomain)) {
    return toHttpsUrl(fallbackDomain);
  }

  const storefrontUrl = buildStorefrontUrl(provider, username);
  if (storefrontUrl) {
    return storefrontUrl;
  }

  return fallbackDomain ? toHttpsUrl(fallbackDomain) : undefined;
};

const getConnectionValue = (
  providerData: Record<string, unknown>,
  fallbackData: Record<string, unknown>,
) => Boolean(providerData.connected ?? fallbackData.connected);

const getInstalledValue = (
  providerData: Record<string, unknown>,
  fallbackData: Record<string, unknown>,
) => Boolean(providerData.installed ?? fallbackData.installed);

type StoreResponseItem = {
  id: string;
  provider: string;
  storeId: string | number | null;
  name?: string;
  email?: string;
  phone?: string;
  username?: string;
  domain?: string;
  connected: boolean;
  installed: boolean;
  plan: unknown;
  planId?: string | null;
  planActive: boolean;
  subscriptionBucket: SubscriptionBucket;
  createdAt?: string;
  lastActive?: string;
  expiresAt?: string;
  cancelledAt?: string;
  status: 'active' | 'inactive' | 'suspended';
  usage: {
    invitesUsed: unknown;
    monthKey: unknown;
    updatedAt?: string;
  };
};

type StoreSummary = {
  totalStores: number;
  connectedStores: number;
  disconnectedStores: number;
  paidSubscribers: number;
  activeIncludingTrial: number;
  cancelledOrExpired: number;
  unknownSubscriptions: number;
};

const buildSummary = (stores: StoreResponseItem[]): StoreSummary => ({
  totalStores: stores.length,
  connectedStores: stores.filter((store) => store.connected).length,
  disconnectedStores: stores.filter((store) => !store.connected).length,
  paidSubscribers: stores.filter(
    (store) =>
      store.subscriptionBucket === 'monthly' ||
      store.subscriptionBucket === 'yearly',
  ).length,
  activeIncludingTrial: stores.filter(
    (store) =>
      store.subscriptionBucket === 'trial' ||
      store.subscriptionBucket === 'monthly' ||
      store.subscriptionBucket === 'yearly',
  ).length,
  cancelledOrExpired: stores.filter(
    (store) => store.subscriptionBucket === 'cancelled',
  ).length,
  unknownSubscriptions: stores.filter(
    (store) => store.subscriptionBucket === 'unknown',
  ).length,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

    const db = dbAdmin();
    const {
      limit: limitParam = String(LIMITS.MAX_BATCH_SIZE),
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      filterConnected,
      status,
      provider,
    } = req.query as Record<string, string>;

    const limitNum = Math.min(LIMITS.MAX_BATCH_SIZE, Math.max(1, parseInt(limitParam, 10)));
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const searchTerm = (search || '').toLowerCase().trim();
    const now = Date.now();
    const [snap, domainsSnap] = await Promise.all([
      db
        .collection('stores')
        .limit(LIMITS.MAX_BATCH_SIZE)
        .get(),
      db
        .collection('domains')
        .select('base', 'storeUid', 'uid', 'updatedAt', 'isCustomDomain')
        .get(),
    ]);

    const preferredDomainByStoreUid = new Map<string, DomainCandidate>();
    for (const domainDoc of domainsSnap.docs) {
      const domainData = domainDoc.data() as Record<string, unknown>;
      const storeUid = pickText(domainData.storeUid, domainData.uid);
      const base = pickText(domainData.base);

      if (!storeUid || !base) continue;

      const incoming: DomainCandidate = {
        base,
        updatedAt: toMillis(domainData.updatedAt),
        isCustomDomain: domainData.isCustomDomain === true,
      };
      preferredDomainByStoreUid.set(
        storeUid,
        pickPreferredDomain(preferredDomainByStoreUid.get(storeUid), incoming),
      );
    }

    const stores: StoreResponseItem[] = [];
    const skippedDocIds: string[] = [];

    for (const doc of snap.docs) {
      if (isAliasStore(doc.id, doc.data() as Record<string, unknown>)) {
        continue;
      }

      try {
        const d = doc.data() as Record<string, unknown>;
        const merchant = asRecord(d.merchant);
        const salla = asRecord(d.salla);
        const zid = asRecord(d.zid);
        const domain = d.domain;
        const usage = asRecord(d.usage);
        const meta = asRecord(d.meta);
        const userinfo = asRecord(meta.userinfo);
        const payload = asRecord(userinfo.data || userinfo.context);
        const payloadMerchant = asRecord(payload.merchant);
        const payloadStore = asRecord(payload.store);
        const providerValue = inferProvider(doc.id, d, salla, zid);
        const subscriptionRow = buildAdminSubscriptionRow(
          d as Parameters<typeof buildAdminSubscriptionRow>[0],
          doc.id,
          now,
        );

        const lastActiveMs = latestMillis(
          d.lastActive,
          meta.updatedAt,
          usage.updatedAt,
          asRecord(domain).updatedAt,
          salla.updatedAt,
          zid.updatedAt,
          d.updatedAt,
        );
        const name = pickText(
          payloadMerchant.name,
          payloadStore.name,
          merchant.name,
          d.storeName,
          d.name,
          salla.storeName,
          zid.storeName,
          d.uid,
        );
        const email = pickText(
          payload.email,
          payloadMerchant.email,
          d.email,
          d.merchantEmail,
          asRecord(d.notifications).email,
          merchant.email,
        );
        const username = pickText(
          payloadMerchant.username,
          payload.username,
          merchant.username,
          salla.username,
          zid.username,
          d.username,
        );
        const phone = pickText(
          payload.mobile,
          payloadMerchant.mobile,
          payloadStore.mobile,
          merchant.mobile,
          d.phone,
          d.mobile,
          salla.mobile,
          zid.mobile,
        );
        const providerData =
          providerValue === 'zid'
            ? zid
            : providerValue === 'salla'
              ? salla
              : {};
        const connected =
          providerValue === 'unknown'
            ? Boolean(salla.connected ?? zid.connected ?? d.connected)
            : getConnectionValue(providerData, d);
        const installed =
          providerValue === 'unknown'
            ? Boolean(salla.installed ?? zid.installed ?? d.installed)
            : getInstalledValue(providerData, d);
        const storeStatus =
          d.status === 'suspended'
            ? 'suspended'
            : connected
              ? 'active'
              : 'inactive';

        stores.push({
          id: doc.id,
          provider: providerValue,
          storeId: pickScalarId(
            salla.storeId,
            zid.storeId,
            merchant.id,
            payloadMerchant.id,
          ),
          name,
          email,
          phone,
          username,
          domain: getDomain(
            pickText(preferredDomainByStoreUid.get(doc.id)?.base),
            domain,
            salla,
            zid,
            merchant,
            payloadMerchant,
            payloadStore,
            d,
            providerValue,
            username,
          ),
          connected,
          installed,
          plan: asRecord(d.plan).code ?? asRecord(d.subscription).planId ?? merchant.plan ?? null,
          planId: subscriptionRow.planId,
          planActive: subscriptionRow.planActive,
          subscriptionBucket: subscriptionRow.bucket,
          createdAt: toIso(d.createdAt) || toIso(d.updatedAt),
          lastActive: lastActiveMs ? new Date(lastActiveMs).toISOString() : undefined,
          expiresAt: toIso(subscriptionRow.expiresAt ?? subscriptionRow.cancelledAt),
          cancelledAt: toIso(subscriptionRow.cancelledAt),
          status: storeStatus,
          usage: {
            invitesUsed: usage.invitesUsed,
            monthKey: usage.monthKey,
            updatedAt: toIso(usage.updatedAt),
          },
        });
      } catch (docError) {
        skippedDocIds.push(doc.id);
        console.error('Admin Stores API skipped malformed store document:', {
          id: doc.id,
          error: docError instanceof Error ? docError.message : String(docError),
        });
      }
    }

    const providerScopedStores =
      provider === 'salla' || provider === 'zid' || provider === 'unknown'
        ? stores.filter((store) => store.provider === provider)
        : stores;
    const summary = buildSummary(providerScopedStores);
    const filteredStores = [...providerScopedStores];

    if (filterConnected === 'connected') {
      filteredStores.splice(0, filteredStores.length, ...filteredStores.filter((store) => store.connected));
    } else if (filterConnected === 'disconnected') {
      filteredStores.splice(0, filteredStores.length, ...filteredStores.filter((store) => !store.connected));
    }

    if (status && ['active', 'inactive', 'suspended'].includes(status)) {
      filteredStores.splice(0, filteredStores.length, ...filteredStores.filter((store) => store.status === status));
    }

    if (searchTerm) {
      filteredStores.splice(
        0,
        filteredStores.length,
        ...filteredStores.filter((s) =>
          [s.id, s.name, s.email, s.phone, s.username, s.domain, s.plan, String(s.storeId ?? '')]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(searchTerm),
        ),
      );
    }

    filteredStores.sort((left, right) => {
      const leftValue = String(left[sortBy as keyof typeof left] || '');
      const rightValue = String(right[sortBy as keyof typeof right] || '');

      if (sortBy === 'createdAt') {
        return (Date.parse(leftValue) - Date.parse(rightValue)) * sortDirection;
      }

      return leftValue.localeCompare(rightValue, 'ar') * sortDirection;
    });

    const limitedStores = filteredStores.slice(0, limitNum);

    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({
      stores: limitedStores,
      total: filteredStores.length,
      page: 1,
      limit: limitNum,
      hasMore: filteredStores.length > limitNum,
      nextCursor: null,
      summary,
      skipped: skippedDocIds.length,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Admin Stores API Error:', err);
    if (err.message.startsWith('permission-denied')) {
      return res.status(403).json({ message: 'ليس لديك صلاحية' });
    }
    if (err.message.startsWith('unauthenticated')) {
      return res.status(401).json({ message: 'غير مصرح' });
    }
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
