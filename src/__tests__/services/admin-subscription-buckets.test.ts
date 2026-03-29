import { describe, expect, it } from 'vitest';
import {
  buildAdminSubscriptionRow,
  groupAdminSubscriptions,
  resolveSubscriptionBucket,
} from '@/backend/server/utils/admin-subscription-buckets';

const NOW = Date.UTC(2026, 2, 27, 12, 0, 0);

describe('admin subscription buckets', () => {
  it('classifies active trial stores as trial', () => {
    const row = buildAdminSubscriptionRow(
      {
        uid: 'salla:trial-store',
        provider: 'salla',
        plan: {
          code: 'TRIAL',
          active: true,
          updatedAt: NOW,
        },
        usage: {
          monthKey: '2026-03',
          invitesUsed: 4,
        },
      },
      'salla:trial-store',
      NOW,
    );

    expect(row.bucket).toBe('trial');
    expect(row.invitesLimit).toBe(10);
    expect(row.invitesUsed).toBe(4);
  });

  it('classifies active paid monthly stores as monthly', () => {
    const bucket = resolveSubscriptionBucket(
      {
        subscription: {
          planId: 'PAID_MONTHLY',
          startedAt: NOW,
          syncedAt: NOW,
        },
        plan: {
          code: 'PAID_MONTHLY',
          active: true,
          updatedAt: NOW,
        },
      },
      NOW,
    );

    expect(bucket).toBe('monthly');
  });

  it('classifies paid monthly stores as cancelled once expiry passes even if plan.active is still true', () => {
    const bucket = resolveSubscriptionBucket(
      {
        subscription: {
          planId: 'PAID_MONTHLY',
          startedAt: NOW - 7 * 24 * 60 * 60 * 1000,
          expiresAt: NOW - 1,
          syncedAt: NOW,
        },
        plan: {
          code: 'PAID_MONTHLY',
          active: true,
          updatedAt: NOW,
        },
      },
      NOW,
    );

    expect(bucket).toBe('cancelled');
  });

  it('classifies paid monthly stores as cancelled when only raw end_date is present and expired', () => {
    const bucket = resolveSubscriptionBucket(
      {
        subscription: {
          planId: 'PAID_MONTHLY',
          syncedAt: NOW,
          raw: {
            data: [
              {
                end_date: '2026-03-08',
              },
            ],
          },
        },
        plan: {
          code: 'PAID_MONTHLY',
          active: true,
          updatedAt: NOW,
        },
      },
      NOW,
    );

    expect(bucket).toBe('cancelled');
  });

  it('treats raw Salla cancelled status as cancelled even when expiry is still in the future', () => {
    const bucket = resolveSubscriptionBucket(
      {
        subscription: {
          planId: 'PAID_MONTHLY',
          expiresAt: NOW + 10 * 24 * 60 * 60 * 1000,
          syncedAt: NOW,
          raw: {
            data: [
              {
                status: 'canceled',
              },
            ],
          },
        },
        plan: {
          code: 'PAID_MONTHLY',
          active: true,
          updatedAt: NOW,
        },
      },
      NOW,
    );

    expect(bucket).toBe('cancelled');
  });

  it('treats raw Salla active status as active for trial subscriptions', () => {
    const bucket = resolveSubscriptionBucket(
      {
        subscription: {
          planId: 'TRIAL',
          syncedAt: NOW,
          raw: {
            data: [
              {
                status: 'active',
              },
            ],
          },
        },
        plan: {
          code: 'TRIAL',
          active: false,
          updatedAt: NOW,
        },
      },
      NOW,
    );

    expect(bucket).toBe('trial');
  });

  it('keeps the string domain and resolved store name from store docs', () => {
    const row = buildAdminSubscriptionRow(
      {
        uid: 'salla:named-store',
        provider: 'salla',
        domain: 'https://named-store.example',
        meta: {
          userinfo: {
            data: {
              merchant: {
                name: 'متجر الثقة',
              },
            },
          },
        },
        subscription: {
          planId: 'PAID_MONTHLY',
          syncedAt: NOW,
        },
        plan: {
          code: 'PAID_MONTHLY',
          active: true,
          updatedAt: NOW,
        },
      },
      'salla:named-store',
      NOW,
    );

    expect(row.storeName).toBe('متجر الثقة');
    expect(row.domainBase).toBe('https://named-store.example');
  });

  it('classifies active paid annual stores as yearly', () => {
    const bucket = resolveSubscriptionBucket(
      {
        subscription: {
          planId: 'PAID_ANNUAL',
          startedAt: NOW,
          syncedAt: NOW,
        },
        plan: {
          code: 'PAID_ANNUAL',
          active: true,
          updatedAt: NOW,
        },
      },
      NOW,
    );

    expect(bucket).toBe('yearly');
  });

  it('keeps active annual subscriptions as yearly even with stale expiredAt', () => {
    const row = buildAdminSubscriptionRow(
      {
        uid: 'salla:451411148',
        provider: 'salla',
        subscription: {
          planId: 'PAID_ANNUAL',
          startedAt: NOW,
          expiresAt: NOW + 30 * 24 * 60 * 60 * 1000,
          expiredAt: NOW - 24 * 60 * 60 * 1000,
          syncedAt: NOW,
        },
        plan: {
          code: 'PAID_ANNUAL',
          active: true,
          expiredAt: NOW - 24 * 60 * 60 * 1000,
          updatedAt: NOW,
        },
      },
      'salla:451411148',
      NOW,
    );

    expect(row.bucket).toBe('yearly');
  });

  it('prioritizes cancelled over trial when plan is inactive', () => {
    const row = buildAdminSubscriptionRow(
      {
        uid: 'salla:cancelled-store',
        provider: 'salla',
        subscription: {
          planId: 'TRIAL',
          expiredAt: NOW - 1,
          syncedAt: NOW,
        },
        plan: {
          code: 'TRIAL',
          active: false,
          expiredAt: NOW - 1,
          updatedAt: NOW,
        },
      },
      'salla:cancelled-store',
      NOW,
    );

    expect(row.bucket).toBe('cancelled');
  });

  it('groups rows by their derived bucket', () => {
    const grouped = groupAdminSubscriptions([
      buildAdminSubscriptionRow(
        {
          uid: 'salla:1',
          provider: 'salla',
          plan: {
            code: 'TRIAL',
            active: true,
            updatedAt: NOW,
          },
        },
        'salla:1',
        NOW,
      ),
      buildAdminSubscriptionRow(
        {
          uid: 'salla:2',
          provider: 'salla',
          plan: {
            code: 'PAID_MONTHLY',
            active: true,
            updatedAt: NOW,
          },
          subscription: {
            planId: 'PAID_MONTHLY',
            syncedAt: NOW,
          },
        },
        'salla:2',
        NOW,
      ),
      buildAdminSubscriptionRow(
        {
          uid: 'salla:3',
          provider: 'salla',
          plan: {
            code: 'TRIAL',
            active: false,
            expiredAt: NOW - 1,
            updatedAt: NOW,
          },
          subscription: {
            planId: 'TRIAL',
            expiredAt: NOW - 1,
            syncedAt: NOW,
          },
        },
        'salla:3',
        NOW,
      ),
    ]);

    expect(grouped.trial).toHaveLength(1);
    expect(grouped.monthly).toHaveLength(1);
    expect(grouped.cancelled).toHaveLength(1);
    expect(grouped.all).toHaveLength(3);
  });
});
