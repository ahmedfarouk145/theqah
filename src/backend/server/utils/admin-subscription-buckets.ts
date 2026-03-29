import { getCycleBoundaries, PLANS, type PlanId } from '@/config/plans';
import type { Store } from '@/server/core/types';

export type SubscriptionBucket =
  | 'trial'
  | 'monthly'
  | 'yearly'
  | 'cancelled'
  | 'unknown';

type StoreUsage = {
  monthKey?: string;
  invitesUsed?: number;
};

type StoreWithUsage = Omit<Store, 'domain'> & {
  usage?: StoreUsage;
  domain?: Store['domain'] | string;
  merchant?: {
    name?: string;
    email?: string;
    username?: string;
    id?: string | number;
  };
  salla?: Store['salla'] & {
    storeName?: string;
    url?: string;
    username?: string;
    mobile?: string;
  };
  zid?: Store['zid'] & {
    storeName?: string;
    url?: string;
    username?: string;
    mobile?: string;
  };
  storeName?: string;
  name?: string;
  email?: string;
  merchantEmail?: string;
  notifications?: {
    email?: string;
  };
};

export interface AdminSubscriptionRow {
  storeUid: string;
  storeName?: string;
  provider: string;
  domainBase?: string;
  planId?: string | null;
  planActive: boolean;
  bucket: SubscriptionBucket;
  invitesUsed: number;
  invitesLimit: number | null;
  startedAt: number | null;
  expiresAt: number | null;
  cancelledAt: number | null;
  connected: boolean;
  installed: boolean;
  canSync: boolean;
  lastUpdate?: number;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};

const pickText = (...values: unknown[]): string | undefined =>
  values.find(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
  );

function extractRawSubscriptionEntry(store: Partial<StoreWithUsage>): Record<string, unknown> {
  const raw = store.subscription?.raw;
  const rawRecord = asRecord(raw);
  const rawData = rawRecord.data;

  if (Array.isArray(rawData) && rawData.length > 0) {
    return asRecord(rawData[0]);
  }

  if (Array.isArray(raw) && raw.length > 0) {
    return asRecord(raw[0]);
  }

  return rawRecord;
}

function parseRawEndDate(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return Date.parse(`${trimmed}T23:59:59.999Z`);
  }

  const parsed = Date.parse(trimmed.replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractRawSubscriptionStatus(store: Partial<StoreWithUsage>): string | null {
  const entry = extractRawSubscriptionEntry(store);
  const status = pickText(
    entry.status,
    entry.subscription_status,
    asRecord(entry.subscription).status,
  );

  return status ? status.trim().toLowerCase() : null;
}

function hasStrictCancelledStatus(status: string | null): boolean {
  return Boolean(
    status &&
      ['cancelled', 'canceled', 'expired', 'inactive'].includes(status),
  );
}

function hasStrictActiveStatus(status: string | null): boolean {
  return status === 'active';
}

function getEffectiveExpiresAt(store: Partial<StoreWithUsage>): number | null {
  if (typeof store.subscription?.expiresAt === 'number') {
    return store.subscription.expiresAt;
  }

  const entry = extractRawSubscriptionEntry(store);
  return parseRawEndDate(
    pickText(
      entry.end_date,
      entry.expires_at,
      entry.expired_at,
    ),
  );
}

function resolveStoreName(store: Partial<StoreWithUsage>): string | undefined {
  const meta = asRecord(store.meta);
  const userinfo = asRecord(meta.userinfo);
  const payload = asRecord(userinfo.data || userinfo.context);
  const payloadMerchant = asRecord(payload.merchant);
  const payloadStore = asRecord(payload.store);

  return pickText(
    payloadMerchant.name,
    payloadStore.name,
    store.merchant?.name,
    store.storeName,
    store.name,
    store.salla?.storeName,
    store.zid?.storeName,
    store.uid,
  );
}

export interface GroupedAdminSubscriptions {
  trial: AdminSubscriptionRow[];
  monthly: AdminSubscriptionRow[];
  yearly: AdminSubscriptionRow[];
  cancelled: AdminSubscriptionRow[];
  unknown: AdminSubscriptionRow[];
  all: AdminSubscriptionRow[];
}

export function getInvitesLimit(planId?: string | null): number | null {
  if (!planId) {
    return null;
  }

  const plan = PLANS[planId as PlanId];
  if (!plan) {
    return null;
  }

  return plan.reviewsPerMonth < 0 ? null : plan.reviewsPerMonth;
}

export function resolveSubscriptionBucket(
  store: Partial<StoreWithUsage>,
  now = Date.now(),
): SubscriptionBucket {
  const planId = store.subscription?.planId ?? store.plan?.code ?? null;
  const rawStatus = extractRawSubscriptionStatus(store);
  const expiresAt = getEffectiveExpiresAt(store);
  const cancelledAt =
    store.subscription?.expiredAt ?? store.plan?.expiredAt ?? null;
  const hasFutureExpiry = typeof expiresAt === 'number' && expiresAt > now;
  const isExpired = typeof expiresAt === 'number' && expiresAt <= now;

  if (hasStrictCancelledStatus(rawStatus)) {
    return 'cancelled';
  }

  if (hasStrictActiveStatus(rawStatus)) {
    if (isExpired) {
      return 'cancelled';
    }

    switch (planId) {
      case 'TRIAL':
        return 'trial';
      case 'PAID_MONTHLY':
        return 'monthly';
      case 'PAID_ANNUAL':
        return 'yearly';
      default:
        return 'unknown';
    }
  }

  const isCancelled =
    store.plan?.active === false ||
    isExpired ||
    (!hasFutureExpiry && typeof cancelledAt === 'number');

  if (isCancelled) {
    return 'cancelled';
  }

  switch (planId) {
    case 'TRIAL':
      return 'trial';
    case 'PAID_MONTHLY':
      return 'monthly';
    case 'PAID_ANNUAL':
      return 'yearly';
    default:
      return 'unknown';
  }
}

export function buildAdminSubscriptionRow(
  store: Partial<StoreWithUsage>,
  fallbackId: string,
  now = Date.now(),
): AdminSubscriptionRow {
  const currentMonthKey = getCycleBoundaries(new Date(now)).key;
  const storeUid = store.uid || fallbackId;
  const planId = store.subscription?.planId ?? store.plan?.code ?? null;
  const bucket = resolveSubscriptionBucket(store, now);
  const invitesUsed =
    store.usage?.monthKey === currentMonthKey &&
    typeof store.usage?.invitesUsed === 'number'
      ? store.usage.invitesUsed
      : 0;

  return {
    storeUid,
    storeName: resolveStoreName(store),
    provider: store.provider || 'salla',
    domainBase:
      (typeof store.domain === 'string' ? store.domain : store.domain?.base) ||
      store.salla?.domain ||
      store.zid?.domain,
    planId,
    planActive: store.plan?.active === true,
    bucket,
    invitesUsed,
    invitesLimit: getInvitesLimit(planId),
    startedAt: store.subscription?.startedAt ?? null,
    expiresAt: getEffectiveExpiresAt(store),
    cancelledAt: store.subscription?.expiredAt ?? store.plan?.expiredAt ?? null,
    connected: Boolean(store.salla?.connected ?? store.zid?.connected),
    installed: Boolean(store.salla?.installed ?? store.zid?.installed),
    canSync: storeUid.startsWith('salla:'),
    lastUpdate: store.updatedAt,
  };
}

export function groupAdminSubscriptions(
  rows: AdminSubscriptionRow[],
): GroupedAdminSubscriptions {
  const grouped: GroupedAdminSubscriptions = {
    trial: [],
    monthly: [],
    yearly: [],
    cancelled: [],
    unknown: [],
    all: rows,
  };

  for (const row of rows) {
    grouped[row.bucket].push(row);
  }

  return grouped;
}
