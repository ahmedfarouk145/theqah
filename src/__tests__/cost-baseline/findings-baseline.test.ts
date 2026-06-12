/**
 * Cost-fix acceptance suite — the post-fix counterpart of the audit
 * baseline (2026-06-12 Firestore read-overrun findings F1–F6).
 *
 * Each finding's acceptance criterion is asserted with exact billed-read
 * accounting. Billing emulation mirrors Firestore: every query.get()
 * bills max(1, docs returned), every doc get bills 1, count() aggregates
 * bill 1, and comparisons are TYPE-STRICT (a numeric field never matches
 * a Date cutoff) — the semantics that produced the original bugs.
 *
 * Pre-fix baselines, for reference (measured by the original suite):
 *   F1 1,002 reads/call · F2 60–67 reads/miss · F3 no-store ·
 *   F4 deletes 0 of backlog · F5 cross-store leak · F6 1 write/request
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fake = vi.hoisted(() => {
  const state = {
    billedReads: 0,
    billedWrites: 0,
    billedDeletes: 0,
    /** verified reviews the fake store has (none match a productId filter) */
    reviewCount: 0,
    /** metrics docs past retention, split by timestamp value type */
    metricsBacklogNumeric: 0,
    metricsBacklogDate: 0,
    storeDocs: {} as Record<string, Record<string, unknown>>,
    domainDocs: {} as Record<string, Record<string, unknown>>,
    indexDocs: {} as Record<string, Record<string, unknown>>,
  };

  function reviewDocs(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `rev_${i}`,
      exists: true,
      data: () => ({
        storeUid: 'salla:test',
        verified: true,
        status: 'approved',
        sallaReviewId: `s_${i}`,
        stars: 5,
        author: { displayName: `author ${i}` },
        text: 'review text',
        publishedAt: 1700000000000 + i,
      }),
    }));
  }

  function makeQuery(collection: string) {
    const filters: Array<{ field: string; op: string; value: unknown }> = [];
    let limitN: number | undefined;
    const q: Record<string, unknown> = {};
    q.where = (field: string, op: string, value: unknown) => {
      filters.push({ field, op, value });
      return q;
    };
    q.limit = (n: number) => { limitN = n; return q; };
    q.offset = () => q;
    q.orderBy = () => q;
    q.count = () => ({
      get: async () => {
        state.billedReads += 1;
        const productFiltered = filters.some((f) => f.field === 'productId');
        const count = collection === 'reviews' ? (productFiltered ? 0 : state.reviewCount) : 0;
        return { data: () => ({ count }) };
      },
    });
    q.get = async () => {
      let docs: Array<Record<string, unknown>> = [];
      if (collection === 'reviews') {
        const productFiltered = filters.some((f) => f.field === 'productId');
        const n = productFiltered ? 0 : state.reviewCount;
        docs = reviewDocs(limitN !== undefined ? Math.min(limitN, n) : n);
      } else if (collection === 'metrics') {
        const cutoff = filters.find((f) => f.field === 'timestamp' && f.op === '<');
        // Type-strict: numeric timestamps match numeric cutoffs only,
        // Date-typed timestamps match Date cutoffs only.
        let matches = 0;
        let refTag: 'num' | 'date' = 'num';
        if (cutoff && typeof cutoff.value === 'number') { matches = state.metricsBacklogNumeric; refTag = 'num'; }
        else if (cutoff && cutoff.value instanceof Date) { matches = state.metricsBacklogDate; refTag = 'date'; }
        const n = Math.min(limitN ?? matches, matches);
        docs = Array.from({ length: n }, (_, i) => ({
          id: `m_${i}`,
          exists: true,
          ref: { __metrics: refTag },
          data: () => ({ timestamp: 1 }),
        }));
      }
      // other collections (stores/zid_stores/domains queries) return empty
      state.billedReads += Math.max(1, docs.length);
      return { empty: docs.length === 0, size: docs.length, docs };
    };
    q.add = async () => { state.billedWrites += 1; return { id: 'new' }; };
    q.doc = (id: string) => ({
      get: async () => {
        state.billedReads += 1;
        const data =
          collection === 'stores' ? state.storeDocs[id]
          : collection === 'domains' ? state.domainDocs[id]
          : collection === 'verified_index' ? state.indexDocs[id]
          : undefined;
        return { id, exists: !!data, data: () => data };
      },
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        state.billedWrites += 1;
        const bucket =
          collection === 'domains' ? state.domainDocs
          : collection === 'verified_index' ? state.indexDocs
          : collection === 'stores' ? state.storeDocs
          : null;
        if (bucket) bucket[id] = opts?.merge ? { ...(bucket[id] || {}), ...data } : data;
      },
    });
    return q;
  }

  const db = {
    collection: (name: string) => makeQuery(name),
    batch: () => {
      let num = 0, date = 0;
      return {
        delete: (ref: { __metrics?: 'num' | 'date' }) => {
          if (ref.__metrics === 'num') num++;
          if (ref.__metrics === 'date') date++;
        },
        commit: async () => {
          state.billedDeletes += num + date;
          state.metricsBacklogNumeric = Math.max(0, state.metricsBacklogNumeric - num);
          state.metricsBacklogDate = Math.max(0, state.metricsBacklogDate - date);
          num = 0; date = 0;
        },
      };
    },
  };

  const trackSpy = { calls: 0 };

  return {
    state,
    trackSpy,
    dbAdmin: () => db,
    reset() {
      state.billedReads = 0;
      state.billedWrites = 0;
      state.billedDeletes = 0;
      state.reviewCount = 0;
      state.metricsBacklogNumeric = 0;
      state.metricsBacklogDate = 0;
      state.storeDocs = {};
      state.domainDocs = {};
      state.indexDocs = {};
      trackSpy.calls = 0;
    },
  };
});

vi.mock('@/lib/firebaseAdmin', () => ({
  dbAdmin: fake.dbAdmin,
  initAdmin: () => ({}),
  authAdmin: () => ({}),
}));

vi.mock('@/server/monitoring/metrics', () => ({
  metrics: {
    track: async () => { fake.trackSpy.calls += 1; },
    trackError: async () => { fake.trackSpy.calls += 1; },
    forceFlush: async () => {},
  },
}));

import { VerificationService } from '@/server/services/verification.service';
import { DomainResolverService } from '@/server/services/domain-resolver.service';
import { MaintenanceService } from '@/server/services/maintenance.service';
import { rateLimitPublic } from '@/server/rate-limit-public';
import resolveHandler from '@/pages/api/public/reviews/resolve';
import type { NextApiRequest, NextApiResponse } from 'next';

beforeEach(() => {
  fake.reset();
});

function seedStore(reviews: number) {
  fake.state.storeDocs['salla:test'] = { salla: { connected: true, installed: true } };
  fake.state.reviewCount = reviews;
}

function seedIndex(reviews: number) {
  const entries = Array.from({ length: reviews }, (_, i) => ({
    id: `rev_${i}`, sallaReviewId: `s_${i}`, zidDomHash: null, productId: null,
  }));
  fake.state.indexDocs['salla:test'] = {
    storeUid: 'salla:test',
    count: reviews,
    updatedAt: Date.now(),
    entries,
    rich: entries.slice(0, 20).map((e) => ({
      ...e, stars: 5, authorName: `author ${e.id}`, text: 'review text', productName: null, publishedAt: 1700000000000,
    })),
  };
}

/* ============== F1 — check-verified served from the verified index ============== */

describe('F1: check-verified costs ~4 reads instead of 1,002 (was: ALL verified reviews per call)', () => {
  it('steady state: store with 1000 verified reviews costs <= 35 billed reads per call', async () => {
    seedStore(1000);
    seedIndex(1000);
    const svc = new VerificationService();
    const result = await svc.getVerifiedReviews('salla:test', 'someProductWithoutReviews');
    expect(result.count).toBe(1000);
    expect(result.hasVerified).toBe(true);
    // 1 store doc + 1 index doc + 1 count aggregate + 1 product query
    expect(fake.state.billedReads).toBeLessThanOrEqual(35);
    expect(fake.state.billedReads).toBe(4);
  });

  it('widget contract: ALL entries carry badge IDs; only rich entries qualify for JSON-LD', async () => {
    seedStore(1000);
    seedIndex(1000);
    const svc = new VerificationService();
    const result = await svc.getVerifiedReviews('salla:test', undefined);

    // Badge matching: every verified review is represented with its ID.
    expect(result.reviews.length).toBe(1000);
    expect(result.reviews.every((r) => (r as { sallaReviewId?: string | null }).sallaReviewId)).toBe(true);

    // JSON-LD: the widget filters on `r.stars && r.authorName` — rich
    // entries pass, compact entries are naturally excluded.
    const jsonLdEligible = result.reviews.filter(
      (r) => (r as { stars?: number }).stars && ((r as { author?: { displayName?: string } }).author?.displayName),
    );
    expect(jsonLdEligible.length).toBe(20);
  });

  it('self-heals: first call on an unindexed store rebuilds once, second call is cheap', async () => {
    seedStore(1000);
    const svc = new VerificationService();

    await svc.getVerifiedReviews('salla:test', undefined); // rebuild: ~1004 reads, 1 write
    expect(fake.state.indexDocs['salla:test']).toBeTruthy(); // index persisted

    fake.state.billedReads = 0;
    const second = await svc.getVerifiedReviews('salla:test', undefined);
    expect(second.count).toBe(1000);
    expect(fake.state.billedReads).toBeLessThanOrEqual(5); // store + index + count
  });
});

/* ============== F2 — resolver: tombstones make repeat misses cheap ============== */

describe('F2: repeat misses cost <= 3 reads (was: 60 reads on EVERY miss)', () => {
  it('first miss brute-forces once and writes a tombstone; second miss short-circuits', async () => {
    const r = new DomainResolverService();

    const first = await r.resolveStoreUid({ href: 'https://shop.example.com/products/abc' });
    expect(first).toBeNull();
    const firstCost = fake.state.billedReads;
    expect(fake.state.domainDocs[r.encodeUrlForFirestore('https://shop.example.com')]).toMatchObject({ notFound: true });

    fake.state.billedReads = 0;
    const second = await r.resolveStoreUid({ href: 'https://shop.example.com/other-page' });
    expect(second).toBeNull();
    expect(fake.state.billedReads).toBeLessThanOrEqual(3);
    expect(fake.state.billedReads).toBeLessThan(firstCost);
  });

  it('mapped domains resolve via the fast path in <= 4 reads', async () => {
    const r = new DomainResolverService();
    fake.state.domainDocs[r.encodeUrlForFirestore('https://shop.example.com')] = {
      base: 'https://shop.example.com', storeUid: 'salla:777',
    };
    fake.state.storeDocs['salla:777'] = { storeUid: 'salla:777', salla: { connected: true } };

    const result = await r.resolveStoreUid({ href: 'https://shop.example.com/products/abc' });
    expect(result?.storeUid).toBe('salla:777');
    expect(fake.state.billedReads).toBeLessThanOrEqual(4);
  });

  it('brute-force success writes through so the next call takes the fast path', async () => {
    const r = new DomainResolverService();
    fake.state.domainDocs['shop_example_com'] = { base: 'shop.example.com', storeUid: 'salla:777' };
    fake.state.storeDocs['salla:777'] = { storeUid: 'salla:777', salla: { connected: true } };

    const result = await r.resolveStoreUid({ href: 'https://shop.example.com/p/1' });
    expect(result?.storeUid).toBe('salla:777');
    // write-through saved the canonical key
    expect(fake.state.domainDocs[r.encodeUrlForFirestore('https://shop.example.com')]).toMatchObject({ storeUid: 'salla:777' });
  });
});

/* ============== F3 — resolve endpoint is edge-cacheable ============== */

function mockApi(query: Record<string, string>) {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let body: unknown;
  const req = { method: 'GET', query, headers: {} } as unknown as NextApiRequest;
  const res = {
    setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v; },
    status: (c: number) => { statusCode = c; return res; },
    json: (b: unknown) => { body = b; return res; },
    end: () => res,
    send: (b: unknown) => { body = b; return res; },
  } as unknown as NextApiResponse;
  return { req, res, headers, status: () => statusCode, body: () => body };
}

describe('F3: /api/public/reviews/resolve emits CDN cache headers (was: no-store)', () => {
  it('successful resolve is edge-cacheable for 1h', async () => {
    const ctx = mockApi({ storeUid: 'salla:123' });
    await resolveHandler(ctx.req, ctx.res);
    expect(ctx.status()).toBe(200);
    expect(ctx.headers['cache-control']).toMatch(/s-maxage=3600/);
  });

  it('404 (store not found) uses a SHORT negative TTL so fresh installs appear quickly', async () => {
    const ctx = mockApi({ href: 'https://unknown-store.example.com/' });
    await resolveHandler(ctx.req, ctx.res);
    expect(ctx.status()).toBe(404);
    expect(ctx.headers['cache-control']).toMatch(/s-maxage=300/);
  });
});

/* ============== F4 — cleanupMetrics drains BOTH timestamp types ============== */

describe('F4: cleanupMetrics deletes numeric AND Date-typed backlog (was: 0 of 680k)', () => {
  it('drains 1200 numeric + 300 Date-typed over-retention docs', async () => {
    fake.state.metricsBacklogNumeric = 1200;
    fake.state.metricsBacklogDate = 300;
    const svc = new MaintenanceService();
    const result = await svc.cleanupMetrics(30);
    expect(result.deletedCount).toBe(1500);
    expect(result.hasMore).toBe(false);
    expect(fake.state.metricsBacklogNumeric).toBe(0);
    expect(fake.state.metricsBacklogDate).toBe(0);
  });

  it('respects the time budget and reports hasMore for the next run', async () => {
    fake.state.metricsBacklogNumeric = 5000;
    const svc = new MaintenanceService();
    const result = await svc.cleanupMetrics(30, 0); // 0ms budget: bail immediately
    expect(result.hasMore).toBe(true);
    expect(result.deletedCount).toBe(0);
  });
});

/* ============== F5 — platform-path stores never inherit bare-host mappings ============== */

describe('F5: salla.sa/<store> pages cannot resolve to another store (was: cross-store leak)', () => {
  it('poisoned bare-host doc is ignored for path-based stores', async () => {
    // Production really had domains/salla_sa -> one specific store.
    fake.state.domainDocs['salla_sa'] = { base: 'salla.sa', storeUid: 'salla:STORE_A' };
    fake.state.storeDocs['salla:STORE_A'] = { storeUid: 'salla:STORE_A', salla: { connected: true } };

    const r = new DomainResolverService();
    const result = await r.resolveStoreUid({ href: 'https://salla.sa/store-b/p/123' });
    expect(result?.storeUid).not.toBe('salla:STORE_A');
    expect(result).toBeNull(); // store-b has no mapping of its own -> honest miss
  });

  it('parseHref keeps the store segment for platform hosts (root cause fixed)', () => {
    const r = new DomainResolverService();
    const parsed = r.parseHref('https://salla.sa/store-b/p/123');
    expect(parsed.isPlatformPath).toBe(true);
    expect(parsed.base).toBe('https://salla.sa/store-b');
  });

  it('correctly-mapped path store resolves via its segmented key', async () => {
    const r = new DomainResolverService();
    fake.state.domainDocs[r.encodeUrlForFirestore('https://salla.sa/store-b')] = {
      base: 'https://salla.sa/store-b', storeUid: 'salla:B',
    };
    fake.state.storeDocs['salla:B'] = { storeUid: 'salla:B', salla: { connected: true } };

    const result = await r.resolveStoreUid({ href: 'https://salla.sa/store-b/p/123' });
    expect(result?.storeUid).toBe('salla:B');
    expect(fake.state.billedReads).toBeLessThanOrEqual(3);
  });

  it('never writes tombstones or mappings for bare platform hosts', async () => {
    const r = new DomainResolverService();
    await r.resolveStoreUid({ href: 'https://salla.sa/store-without-mapping/p/1' });
    expect(fake.state.domainDocs['salla_sa']).toBeUndefined();
    expect(fake.state.domainDocs[r.encodeUrlForFirestore('https://salla.sa')]).toBeUndefined();
  });

  it('resolves path stores via legacy underscore keys (salla_sa_alool22 format)', async () => {
    // Install-time mappings (saveDomainVariations era) used this format —
    // the ONLY mapping many path stores have. Regression: 2026-06-12.
    fake.state.domainDocs['salla_sa_store-b'] = { base: 'salla.sa/store-b', storeUid: 'salla:B' };
    fake.state.storeDocs['salla:B'] = { storeUid: 'salla:B', salla: { connected: true } };

    const r = new DomainResolverService();
    const result = await r.resolveStoreUid({ href: 'https://salla.sa/store-b/p/123' });
    expect(result?.storeUid).toBe('salla:B');
    // and the canonical key gets written through for next time
    expect(fake.state.domainDocs[r.encodeUrlForFirestore('https://salla.sa/store-b')]).toMatchObject({ storeUid: 'salla:B' });
  });

  it('a positive legacy mapping beats an active tombstone at the canonical key', async () => {
    const r = new DomainResolverService();
    fake.state.domainDocs[r.encodeUrlForFirestore('https://salla.sa/store-b')] = {
      base: 'https://salla.sa/store-b', notFound: true, until: Date.now() + 60_000,
    };
    fake.state.domainDocs['salla_sa_store-b'] = { base: 'salla.sa/store-b', storeUid: 'salla:B' };
    fake.state.storeDocs['salla:B'] = { storeUid: 'salla:B', salla: { connected: true } };

    const result = await r.resolveStoreUid({ href: 'https://salla.sa/store-b/p/123' });
    expect(result?.storeUid).toBe('salla:B');
    // tombstone replaced by the real mapping
    expect(fake.state.domainDocs[r.encodeUrlForFirestore('https://salla.sa/store-b')]).toMatchObject({ storeUid: 'salla:B', notFound: false });
  });
});

/* ============== F6 — allowed-request metrics are sampled ============== */

describe('F6: rate limiter samples allowed-request metrics 1-in-10 (was: every request)', () => {
  function publicReq(): NextApiRequest {
    return {
      method: 'GET',
      url: '/api/reviews/check-verified',
      headers: { 'x-forwarded-for': '203.0.113.7' },
      socket: { remoteAddress: '203.0.113.7' },
      query: {},
    } as unknown as NextApiRequest;
  }

  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it('5 allowed requests produce at most 1 metric write', async () => {
    for (let i = 0; i < 5; i++) {
      const ctx = mockApi({});
      const limited = await rateLimitPublic(publicReq(), ctx.res, {
        maxRequests: 100,
        windowMs: 60_000,
        identifier: 'acceptance-sampled',
      });
      expect(limited).toBe(false);
    }
    expect(fake.trackSpy.calls).toBeLessThanOrEqual(1);
  });

  it('blocked (429) requests are ALWAYS logged', async () => {
    for (let i = 0; i < 4; i++) {
      const ctx = mockApi({});
      await rateLimitPublic(publicReq(), ctx.res, {
        maxRequests: 2,
        windowMs: 60_000,
        identifier: 'acceptance-blocked',
      });
    }
    // 2 allowed (1 sampled) + 2 blocked (both logged) = 3
    expect(fake.trackSpy.calls).toBe(3);
  });
});
