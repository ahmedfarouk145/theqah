/**
 * summarizeScans — shapes raw `scans` docs into the admin "who scanned / who
 * left an email" view. Pure, so it's unit-testable without Firestore.
 */
import { describe, it, expect } from 'vitest';
import { summarizeScans } from '@/backend/server/scans/summarize-scans';

const docs = [
  { domain: 'a.com', url: 'https://a.com', email: 'lead@a.com', ip: '1.1.1.1', isSubscriber: false, scoreTotal: 60, createdAt: 300 },
  { domain: 'b.com', url: 'https://b.com', email: '', ip: '2.2.2.2', isSubscriber: true, subscriberStoreUid: 'salla:9', scoreTotal: 77, createdAt: 200 },
  { domain: 'a.com', url: 'https://a.com', email: '', ip: '1.1.1.1', isSubscriber: false, scoreTotal: 55, createdAt: 100, error: 'timeout' },
];

describe('summarizeScans', () => {
  it('computes summary counts (total, leads-with-email, subscribers, unique domains)', () => {
    const r = summarizeScans(docs);
    expect(r.total).toBe(3);
    expect(r.withEmail).toBe(1);      // only a.com's first scan left an email
    expect(r.subscribers).toBe(1);    // b.com
    expect(r.uniqueDomains).toBe(2);  // a.com, b.com
  });

  it('returns rows newest-first with a hasEmail flag and never leaks raw internals', () => {
    const r = summarizeScans(docs);
    expect(r.rows.map((x) => x.createdAt)).toEqual([300, 200, 100]); // desc
    const lead = r.rows[0];
    expect(lead).toMatchObject({ domain: 'a.com', email: 'lead@a.com', hasEmail: true, isSubscriber: false, score: 60 });
    const failed = r.rows[2];
    expect(failed).toMatchObject({ domain: 'a.com', hasEmail: false, failed: true });
  });

  it('treats missing/empty email as no-email and missing score as null', () => {
    const r = summarizeScans([{ domain: 'c.com', createdAt: 1 }]);
    expect(r.rows[0]).toMatchObject({ hasEmail: false, email: null, score: null, isSubscriber: false });
    expect(r.withEmail).toBe(0);
  });
});
