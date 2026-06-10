/**
 * Shapes raw `scans` collection docs into the admin "who scanned / who left an
 * email" view. Pure (no Firestore) so it's unit-testable and reusable.
 *
 * The scanner (`/api/public/scan`) writes one doc per scan with: domain, url,
 * email (if the visitor asked for the report), ip, isSubscriber +
 * subscriberStoreUid, scoreTotal, createdAt, and error (on failed scans). This
 * maps each to a safe admin row and computes lead/subscriber counts.
 */

export interface RawScan {
  domain?: string;
  url?: string;
  email?: string | null;
  ip?: string | null;
  isSubscriber?: boolean;
  subscriberStoreUid?: string | null;
  scoreTotal?: number | null;
  createdAt?: number;
  error?: string | null;
}

export interface ScanRow {
  domain: string | null;
  url: string | null;
  email: string | null;
  hasEmail: boolean;
  isSubscriber: boolean;
  storeUid: string | null;
  score: number | null;
  ip: string | null;
  createdAt: number;
  failed: boolean;
}

export interface ScansSummary {
  total: number;
  withEmail: number;
  subscribers: number;
  uniqueDomains: number;
  rows: ScanRow[];
}

function mapRow(s: RawScan): ScanRow {
  const email = typeof s.email === 'string' && s.email.trim() ? s.email.trim() : null;
  return {
    domain: s.domain || null,
    url: s.url || null,
    email,
    hasEmail: !!email,
    isSubscriber: s.isSubscriber === true,
    storeUid: s.subscriberStoreUid || null,
    score: typeof s.scoreTotal === 'number' ? s.scoreTotal : null,
    ip: s.ip || null,
    createdAt: typeof s.createdAt === 'number' ? s.createdAt : 0,
    failed: !!s.error,
  };
}

export function summarizeScans(docs: RawScan[]): ScansSummary {
  const rows = docs.map(mapRow).sort((a, b) => b.createdAt - a.createdAt);
  const domains = new Set<string>();
  let withEmail = 0;
  let subscribers = 0;
  for (const r of rows) {
    if (r.domain) domains.add(r.domain.toLowerCase());
    if (r.hasEmail) withEmail++;
    if (r.isSubscriber) subscribers++;
  }
  return { total: rows.length, withEmail, subscribers, uniqueDomains: domains.size, rows };
}
