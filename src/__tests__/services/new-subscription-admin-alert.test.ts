import { describe, expect, it } from 'vitest';

import {
  buildNewSubscriptionAdminAlertId,
  parseNotificationEmails,
  shouldSendNewSubscriptionAdminAlert,
} from '../../backend/server/messaging/new-subscription-admin-alert';

describe('new subscription admin alert helpers', () => {
  it('parses and deduplicates configured recipient emails', () => {
    expect(
      parseNotificationEmails('abuyzzn@gmail.com, ABUYZZN@gmail.com;ops@example.com\nadmin@example.com')
    ).toEqual(['abuyzzn@gmail.com', 'ops@example.com', 'admin@example.com']);
  });

  it('sends for a first paid activation', () => {
    expect(
      shouldSendNewSubscriptionAdminAlert({
        nextPlanId: 'PAID_MONTHLY',
        previousPlanId: 'TRIAL',
        previousPlanActive: false,
      })
    ).toBe(true);
  });

  it('does not send for active paid renewals', () => {
    expect(
      shouldSendNewSubscriptionAdminAlert({
        nextPlanId: 'PAID_MONTHLY',
        previousPlanId: 'PAID_MONTHLY',
        previousPlanActive: true,
      })
    ).toBe(false);
  });

  it('sends again when a previously inactive paid store reactivates', () => {
    expect(
      shouldSendNewSubscriptionAdminAlert({
        nextPlanId: 'PAID_ANNUAL',
        previousPlanId: 'PAID_MONTHLY',
        previousPlanActive: false,
      })
    ).toBe(true);
  });

  it('builds a deterministic alert document id', () => {
    expect(
      buildNewSubscriptionAdminAlertId({
        storeUid: 'salla:1162928018',
        planId: 'PAID_MONTHLY',
        startedAt: 1773100800000,
      })
    ).toBe('subscription.new_paid_salla_1162928018_PAID_MONTHLY_1773100800000');
  });
});
