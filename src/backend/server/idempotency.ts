// src/server/idempotency.ts
import { dbAdmin } from '@/lib/firebaseAdmin';

export async function withEventOnce<T>(key: string, fn: () => Promise<T>): Promise<{ ok: true; skipped?: true; out?: T }> {
  const ref = dbAdmin().collection('processed_events').doc(key);
  return dbAdmin().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { ok: true, skipped: true as const };
    tx.set(ref, { createdAt: Date.now() });
    const out = await fn();
    return { ok: true, out };
  });
}

export async function ensureSingleInviteKey(storeUid: string, orderId: string): Promise<string> {
  const id = `invite:${storeUid}:${orderId}`;
  const ref = dbAdmin().collection('invite_unique').doc(id);
  await dbAdmin().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) tx.set(ref, { createdAt: Date.now() });
  });
  return id;
}
