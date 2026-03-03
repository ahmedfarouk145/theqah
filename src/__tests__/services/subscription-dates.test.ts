import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    extractSubscriptionExpiresAt,
    extractSubscriptionStartedAt,
    parseDateToEpochMs,
    parseEndDateToEpochMs,
} from '@/backend/server/utils/subscription-dates';
import { StoreRepository } from '@/backend/server/repositories/store.repository';

describe('subscription-dates utils', () => {
    it('parses date-only start dates as start-of-day UTC', () => {
        const parsed = parseDateToEpochMs('2025-03-15');
        expect(parsed).toBe(Date.parse('2025-03-15T00:00:00.000Z'));
    });

    it('parses date-only end dates as end-of-day UTC', () => {
        const parsed = parseEndDateToEpochMs('2025-03-15');
        expect(parsed).toBe(Date.parse('2025-03-15T23:59:59.999Z'));
    });

    it('converts seconds epoch into milliseconds', () => {
        const parsed = parseDateToEpochMs(1710000000);
        expect(parsed).toBe(1710000000 * 1000);
    });

    it('returns null for invalid date values', () => {
        expect(parseDateToEpochMs('not-a-date')).toBeNull();
        expect(parseEndDateToEpochMs({ value: '2025-01-01' })).toBeNull();
    });

    it('extracts subscription start/end from webhook-like payload', () => {
        const payload: Record<string, unknown> = {
            start_date: '2026-02-12',
            end_date: '2026-03-12',
        };

        expect(extractSubscriptionStartedAt(payload)).toBe(Date.parse('2026-02-12T00:00:00.000Z'));
        expect(extractSubscriptionExpiresAt(payload)).toBe(Date.parse('2026-03-12T23:59:59.999Z'));
    });
});

describe('StoreRepository subscription writes', () => {
    let repo: StoreRepository;

    beforeEach(() => {
        repo = new StoreRepository();
    });

    it('updateSubscription writes normalized expiresAt when provided', async () => {
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
        const setSpy = vi.spyOn(repo, 'set').mockResolvedValue();

        await repo.updateSubscription(
            'salla:123',
            'PAID_MONTHLY',
            1700000000000,
            1702600000000,
            { end_date: '2023-12-14' }
        );

        expect(setSpy).toHaveBeenCalledTimes(1);
        const [docId, payload] = setSpy.mock.calls[0];
        expect(docId).toBe('salla:123');
        expect(payload.subscription?.startedAt).toBe(1700000000000);
        expect(payload.subscription?.expiresAt).toBe(1702600000000);
        expect(payload.plan?.active).toBe(true);
        expect(payload.plan?.code).toBe('PAID_MONTHLY');

        nowSpy.mockRestore();
    });

    it('deactivateSubscription writes both expiredAt and expiresAt', async () => {
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000999);
        const setSpy = vi.spyOn(repo, 'set').mockResolvedValue();

        await repo.deactivateSubscription('salla:123', { reason: 'expired' });

        expect(setSpy).toHaveBeenCalledTimes(1);
        const [docId, payload] = setSpy.mock.calls[0];
        expect(docId).toBe('salla:123');
        expect(payload.subscription?.expiresAt).toBe(1700000000999);
        expect(payload.subscription?.expiredAt).toBe(1700000000999);
        expect(payload.plan?.active).toBe(false);
        expect(payload.plan?.expiredAt).toBe(1700000000999);

        nowSpy.mockRestore();
    });
});
