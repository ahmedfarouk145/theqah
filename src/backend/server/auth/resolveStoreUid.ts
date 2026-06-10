/**
 * Resolve a dashboard login (Firebase uid) to its store (`salla:`/`zid:` storeUid).
 *
 * Background: onboarding creates the merchant's Firebase user with a RANDOM uid
 * and never links it to the storeUid, but the dashboard historically queried
 * `where('storeUid','==', uid)` — so every merchant's dashboard was empty. This
 * resolver is the missing join. Precedence:
 *   1. users/{uid}.storeUid           (the canonical mapping; written at onboarding + backfill)
 *   2. a store whose ownerUid == uid  (legacy alias)
 *   3. a UNIQUE email match           (fallback for un-backfilled users; never guess if >1)
 * Resolved fallbacks are cached into users/{uid} so it's a one-time cost.
 */
import type { NextApiRequest } from 'next';
import { requireUser } from './requireUser';

export interface StoreUidCandidates {
  mappedStoreUid: string | null;
  ownerUidStoreUid: string | null;
  emailMatchedStoreUids: string[];
}

/** Pure precedence — unit-tested. Returns the storeUid or null (never guesses on ambiguity). */
export function pickStoreUid(c: StoreUidCandidates): string | null {
  if (c.mappedStoreUid) return c.mappedStoreUid;
  if (c.ownerUidStoreUid) return c.ownerUidStoreUid;
  const unique = Array.from(new Set(c.emailMatchedStoreUids.filter(Boolean)));
  return unique.length === 1 ? unique[0] : null;
}

/**
 * Security gate for the email-fallback path. The fallback matches the caller's
 * Firebase email against store records and AUTO-LINKS the login to that store —
 * so an UNVERIFIED email is an account-takeover vector: an attacker can sign up
 * with a victim merchant's email, never verify it, and be mapped to the victim's
 * store (IDOR). Only consult the fallback when the email is verified (proven
 * control of that mailbox == the real merchant). Skipped anyway when an ownerUid
 * match already resolved the store. Pure for unit testing.
 */
export function emailFallbackAllowed(emailVerified: boolean, ownerUidStoreUid: string | null): boolean {
  return emailVerified === true && !ownerUidStoreUid;
}

const normEmail = (e: string | null | undefined) => String(e || '').trim().toLowerCase();

function storeEmails(d: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const add = (e: unknown) => { const n = normEmail(e as string); if (n.includes('@')) out.add(n); };
  add((d as { email?: unknown }).email);
  const meta = (d as { meta?: { ownerEmail?: unknown; userinfo?: { data?: Record<string, unknown> } & Record<string, unknown> } }).meta;
  add(meta?.ownerEmail);
  add((d as { merchantEmail?: unknown }).merchantEmail);
  const ui = (meta?.userinfo?.data ?? meta?.userinfo) as Record<string, unknown> | undefined;
  if (ui) { add(ui.email); add((ui.context as { email?: unknown } | undefined)?.email); }
  return [...out];
}

/** Scan stores + zid_stores for an email match. Fallback path only (cached after first resolve). */
async function findStoreUidsByEmail(email: string): Promise<string[]> {
  const target = normEmail(email);
  if (!target.includes('@')) return [];
  const { dbAdmin } = await import('@/lib/firebaseAdmin');
  const db = dbAdmin();
  const hits: string[] = [];
  for (const coll of ['stores', 'zid_stores']) {
    const snap = await db.collection(coll).get();
    for (const doc of snap.docs) {
      if (storeEmails(doc.data() as Record<string, unknown>).includes(target)) hits.push(doc.id);
    }
  }
  return hits;
}

/** Write/refresh the canonical users/{uid} -> storeUid mapping. */
export async function linkUserToStore(
  uid: string,
  storeUid: string,
  opts?: { email?: string | null; via?: 'onboarding' | 'email-backfill' | 'ownerUid' | 'admin' },
): Promise<void> {
  const { dbAdmin } = await import('@/lib/firebaseAdmin');
  await dbAdmin().collection('users').doc(uid).set({
    storeUid,
    email: opts?.email ?? null,
    linkedVia: opts?.via ?? 'admin',
    linkedAt: Date.now(),
  }, { merge: true });
}

/** Resolve uid -> storeUid using the precedence above; caches fallback resolutions. */
export async function resolveStoreUid(uid: string, email: string | null, emailVerified: boolean): Promise<string | null> {
  const { dbAdmin } = await import('@/lib/firebaseAdmin');
  const db = dbAdmin();

  // 1) canonical mapping
  const mapDoc = await db.collection('users').doc(uid).get();
  const mappedStoreUid = (mapDoc.data() as { storeUid?: string } | undefined)?.storeUid ?? null;
  if (mappedStoreUid) return mappedStoreUid;

  // 2) legacy ownerUid alias
  const ownerSnap = await db.collection('stores').where('ownerUid', '==', uid).limit(1).get();
  const ownerUidStoreUid = ownerSnap.empty ? null : ownerSnap.docs[0].id;

  // 3) unique email match (fallback) — ONLY for a verified email, else this is
  //    an account-takeover vector. See emailFallbackAllowed().
  const emailMatchedStoreUids = emailFallbackAllowed(emailVerified, ownerUidStoreUid)
    ? await findStoreUidsByEmail(email || '')
    : [];

  const resolved = pickStoreUid({ mappedStoreUid, ownerUidStoreUid, emailMatchedStoreUids });

  // cache fallback resolutions so subsequent requests are O(1)
  if (resolved) {
    await linkUserToStore(uid, resolved, { email, via: ownerUidStoreUid ? 'ownerUid' : 'email-backfill' }).catch(() => {});
  }
  return resolved;
}

export class StoreNotLinkedError extends Error {
  constructor() { super('store_not_linked'); this.name = 'StoreNotLinkedError'; }
}

/** Endpoint helper: authenticate AND resolve the caller's store. Throws StoreNotLinkedError if unresolved. */
export async function requireStore(req: NextApiRequest): Promise<{ uid: string; email: string | null; storeUid: string }> {
  const { uid, email, emailVerified } = await requireUser(req);
  const storeUid = await resolveStoreUid(uid, email, emailVerified);
  if (!storeUid) throw new StoreNotLinkedError();
  return { uid, email, storeUid };
}
