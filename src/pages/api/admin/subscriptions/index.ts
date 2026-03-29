import type { NextApiRequest, NextApiResponse } from 'next';
import { LIMITS } from '@/config/constants';
import { dbAdmin } from '@/lib/firebaseAdmin';
import {
  buildAdminSubscriptionRow,
  groupAdminSubscriptions,
} from '@/server/utils/admin-subscription-buckets';
import { verifyAdmin } from '@/utils/verifyAdmin';

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};

const pickText = (...values: unknown[]): string | undefined =>
  values.find(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
  );

const toMillis = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const ts = value as FirebaseFirestore.Timestamp;
    return ts.toDate().getTime();
  }
  return undefined;
};

type DomainCandidate = {
  base?: string;
  updatedAt?: number;
  isCustomDomain?: boolean;
};

const toHttpsUrl = (value: string): string =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

const stripScheme = (value: string): string =>
  value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

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

  if (Boolean(zid.storeId ?? zid.connected ?? zid.installed ?? zid.domain ?? zid.url)) {
    return 'zid';
  }

  if (Boolean(salla.storeId ?? salla.connected ?? salla.installed ?? salla.domain ?? salla.url)) {
    return 'salla';
  }

  return 'unknown';
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

const resolveDomainBase = ({
  mappedDomain,
  domain,
  salla,
  zid,
  merchant,
  payloadMerchant,
  payloadStore,
  data,
  provider,
  username,
}: {
  mappedDomain?: string;
  domain: unknown;
  salla: Record<string, unknown>;
  zid: Record<string, unknown>;
  merchant: Record<string, unknown>;
  payloadMerchant: Record<string, unknown>;
  payloadStore: Record<string, unknown>;
  data: Record<string, unknown>;
  provider: string;
  username?: string;
}): string | undefined => {
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

type SuccessResponse = {
  ok: true;
  tiers: {
    trial: ReturnType<typeof groupAdminSubscriptions>['trial'];
    monthly: ReturnType<typeof groupAdminSubscriptions>['monthly'];
    yearly: ReturnType<typeof groupAdminSubscriptions>['yearly'];
    cancelled: ReturnType<typeof groupAdminSubscriptions>['cancelled'];
  };
  grouped: ReturnType<typeof groupAdminSubscriptions>;
  count: number;
  counts: {
    all: number;
    trial: number;
    monthly: number;
    yearly: number;
    cancelled: number;
    unknown: number;
  };
};

type ErrorResponse = {
  ok: false;
  error: string;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    await verifyAdmin(req);

    const db = dbAdmin();
    const [storesSnap, domainsSnap] = await Promise.all([
      db
        .collection('stores')
        .select(
          'uid',
          'provider',
          'platform',
          'domain',
          'merchant',
          'storeName',
          'name',
          'meta',
          'username',
          'salla',
          'zid',
          'subscription',
          'plan',
          'usage',
          'updatedAt',
        )
        .limit(LIMITS.MAX_BATCH_SIZE)
        .get(),
      db
        .collection('domains')
        .select('base', 'storeUid', 'uid', 'updatedAt', 'isCustomDomain')
        .get(),
    ]);

    const now = Date.now();
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

    const rows = storesSnap.docs
      .filter((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return !(typeof data.storeUid === 'string' && data.storeUid !== doc.id);
      })
      .map((doc) => {
        const data = doc.data() as Parameters<typeof buildAdminSubscriptionRow>[0];
        const dataRecord = data as Record<string, unknown>;
        const merchant = asRecord(dataRecord.merchant);
        const salla = asRecord(dataRecord.salla);
        const zid = asRecord(dataRecord.zid);
        const meta = asRecord(dataRecord.meta);
        const userinfo = asRecord(meta.userinfo);
        const payload = asRecord(userinfo.data || userinfo.context);
        const payloadMerchant = asRecord(payload.merchant);
        const payloadStore = asRecord(payload.store);
        const provider = inferProvider(doc.id, dataRecord, salla, zid);
        const username = pickText(
          payloadMerchant.username,
          payload.username,
          merchant.username,
          salla.username,
          zid.username,
          dataRecord.username,
        );
        const baseRow = buildAdminSubscriptionRow(
          data,
          doc.id,
          now,
        );

        return {
          ...baseRow,
          provider,
          domainBase: resolveDomainBase({
            mappedDomain: pickText(preferredDomainByStoreUid.get(doc.id)?.base),
            domain: dataRecord.domain,
            salla,
            zid,
            merchant,
            payloadMerchant,
            payloadStore,
            data: dataRecord,
            provider,
            username,
          }),
        };
      });
    const grouped = groupAdminSubscriptions(rows);

    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({
      ok: true,
      tiers: {
        trial: grouped.trial,
        monthly: grouped.monthly,
        yearly: grouped.yearly,
        cancelled: grouped.cancelled,
      },
      grouped,
      count: rows.length,
      counts: {
        all: rows.length,
        trial: grouped.trial.length,
        monthly: grouped.monthly.length,
        yearly: grouped.yearly.length,
        cancelled: grouped.cancelled.length,
        unknown: grouped.unknown.length,
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[subscriptions] error:', err);

    if (err.message.startsWith('permission-denied')) {
      return res
        .status(403)
        .json({ ok: false, error: 'forbidden', message: 'ليس لديك صلاحية' });
    }

    if (err.message.startsWith('unauthenticated')) {
      return res
        .status(401)
        .json({ ok: false, error: 'unauthorized', message: 'غير مصرح' });
    }

    return res
      .status(500)
      .json({ ok: false, error: 'internal_error', message: err.message });
  }
}
