/**
 * SallaTokenService — token refresh safety tests.
 *
 * These encode the audit findings about Salla's single-use, rotating refresh
 * tokens (access 14d / refresh 30d; reusing a refresh token in parallel revokes
 * BOTH tokens and forces a reinstall). See docs.salla.dev/421118m0.
 *
 * They are written test-first and are EXPECTED TO FAIL against the current
 * implementation until the locking + dead-token surfacing fixes land.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOwnerRepo = {
  findById: vi.fn(),
  saveOAuth: vi.fn(),
  // Intended new API: persist that a store's grant is revoked so the fleet
  // sweep can list stores needing a reinstall instead of failing silently.
  markNeedsReauth: vi.fn(),
};

vi.mock('@/backend/server/repositories', () => ({
  RepositoryFactory: { getOwnerRepository: () => mockOwnerRepo },
}));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

import { SallaTokenService } from '@/backend/server/services/salla-token.service';

const nowSec = () => Math.floor(Date.now() / 1000);

function expiringOwner(uid: string, refresh = 'r1') {
  return {
    uid,
    provider: 'salla',
    oauth: {
      access_token: 'old-access',
      refresh_token: refresh,
      scope: 'reviews.read offline_access',
      expires: nowSec() + 60, // inside the 5-min refresh buffer → triggers refresh
      receivedAt: 0,
      strategy: 'easy_mode',
    },
  };
}

describe('SallaTokenService — refresh-token safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SALLA_CLIENT_ID = 'cid';
    process.env.SALLA_CLIENT_SECRET = 'csec';
  });

  it('coalesces concurrent refreshes into a SINGLE Salla token call (single-use safety)', async () => {
    mockOwnerRepo.findById.mockResolvedValue(expiringOwner('salla:1'));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-access', refresh_token: 'r2', expires_in: 1209600 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const svc = SallaTokenService.getInstance();
    // Two callers race for the same store (mirrors run-backfill */5 colliding
    // with backfill-review-ids */10 on the same minute).
    const [a, b] = await Promise.all([
      svc.getValidAccessToken('salla:1'),
      svc.getValidAccessToken('salla:1'),
    ]);

    expect(a).toBe('new-access');
    expect(b).toBe('new-access');
    // Two parallel refreshes would reuse the same single-use refresh token and
    // make Salla revoke BOTH tokens. The service must serialize them.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flags the store for re-auth when the refresh grant is revoked (invalid_grant/401)', async () => {
    mockOwnerRepo.findById.mockResolvedValue(expiringOwner('salla:2'));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'The refresh token is invalid, expired, revoked...',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const svc = SallaTokenService.getInstance();
    const token = await svc.getValidAccessToken('salla:2');

    expect(token).toBeNull();
    // A revoked grant is terminal (reinstall required). It must be persisted so
    // it surfaces for outreach instead of rotting silently.
    expect(mockOwnerRepo.markNeedsReauth).toHaveBeenCalledWith('salla:2', expect.any(String));
  });
});

describe('SallaTokenService — keep-alive (proactive refresh)', () => {
  const day = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SALLA_CLIENT_ID = 'cid';
    process.env.SALLA_CLIENT_SECRET = 'csec';
  });

  it('proactively refreshes a token older than the keep-alive window, even if the access token is not expiring', async () => {
    mockOwnerRepo.findById.mockResolvedValue({
      uid: 'salla:3',
      provider: 'salla',
      oauth: {
        access_token: 'old-access',
        refresh_token: 'r1',
        expires: nowSec() + 13 * 24 * 3600, // 13 days out — NOT near expiry
        receivedAt: Date.now() - 12 * day,  // 12 days old — stale (refresh token nearing 30d)
        strategy: 'easy_mode',
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-access', refresh_token: 'r2', expires_in: 1209600 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await SallaTokenService.getInstance().refreshIfStale('salla:3');

    expect(res.refreshed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips a store already flagged needsReauth (dead grant — cannot refresh)', async () => {
    mockOwnerRepo.findById.mockResolvedValue({
      uid: 'salla:4',
      provider: 'salla',
      oauth: {
        access_token: 'x', refresh_token: 'r',
        expires: nowSec() + 60, receivedAt: Date.now() - 20 * day,
        needsReauth: true, strategy: 'easy_mode',
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await SallaTokenService.getInstance().refreshIfStale('salla:4');

    expect(res.refreshed).toBe(false);
    expect(res.skipped).toBe('needs-reauth');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips a freshly-received token (no needless rotation)', async () => {
    mockOwnerRepo.findById.mockResolvedValue({
      uid: 'salla:5',
      provider: 'salla',
      oauth: {
        access_token: 'x', refresh_token: 'r',
        expires: nowSec() + 13 * 24 * 3600, receivedAt: Date.now() - 1 * day,
        strategy: 'easy_mode',
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await SallaTokenService.getInstance().refreshIfStale('salla:5');

    expect(res.refreshed).toBe(false);
    expect(res.skipped).toBe('fresh');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
