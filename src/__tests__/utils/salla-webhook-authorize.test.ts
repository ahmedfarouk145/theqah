/**
 * resolveAuthorizeStoreUid — self-heal for the app.store.authorize handler.
 *
 * Dead-token root cause: the authorize handler derives storeUid only from
 * body.merchant. If that field is absent, the OAuth token is never persisted
 * to owners/{uid} and we can't even tell which store it was — the store rots.
 * But the store id is recoverable from the token itself via store/info
 * (data.id). This helper makes that fallback explicit and testable.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveAuthorizeStoreUid } from '@/backend/server/utils/salla-webhook.utils';

describe('resolveAuthorizeStoreUid', () => {
  it('uses merchantId when present, without calling store/info', async () => {
    const fetchStoreInfo = vi.fn();
    const uid = await resolveAuthorizeStoreUid({ merchantId: 1623177406, accessToken: 'tok', fetchStoreInfo });
    expect(uid).toBe('salla:1623177406');
    expect(fetchStoreInfo).not.toHaveBeenCalled();
  });

  it('self-heals storeUid from store/info (data.id) when merchantId is missing', async () => {
    const fetchStoreInfo = vi.fn().mockResolvedValue({ data: { id: 1900960657 } });
    const uid = await resolveAuthorizeStoreUid({ merchantId: null, accessToken: 'tok', fetchStoreInfo });
    expect(uid).toBe('salla:1900960657');
    expect(fetchStoreInfo).toHaveBeenCalledWith('tok');
  });

  it('returns null when merchantId is missing and store/info fails', async () => {
    const fetchStoreInfo = vi.fn().mockRejectedValue(new Error('store/info 401'));
    const uid = await resolveAuthorizeStoreUid({ merchantId: null, accessToken: 'tok', fetchStoreInfo });
    expect(uid).toBeNull();
  });

  it('returns null when neither merchantId nor a token is available', async () => {
    const fetchStoreInfo = vi.fn();
    const uid = await resolveAuthorizeStoreUid({ merchantId: null, accessToken: '', fetchStoreInfo });
    expect(uid).toBeNull();
    expect(fetchStoreInfo).not.toHaveBeenCalled();
  });
});
