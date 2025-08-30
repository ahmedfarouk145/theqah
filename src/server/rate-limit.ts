// src/server/rate-limit.ts
import { dbAdmin } from '@/lib/firebaseAdmin';

type RateDoc = { count: number; resetAt: number };

export async function rateLimit(key: string, limit: number, windowSec: number) {
  const ref = dbAdmin().collection('ratelimits').doc(key);
  const now = Date.now();
  const windowMs = windowSec * 1000;

  const res = await dbAdmin().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let count = 1;
    let resetAt = now + windowMs;
    if (snap.exists) {
      const d = snap.data() as Partial<RateDoc>;
      if (d.resetAt && now < d.resetAt) {
        count = (d.count ?? 0) + 1;
        resetAt = d.resetAt;
      }
    }
    tx.set(ref, { count, resetAt } as RateDoc, { merge: true });
    return { count, resetAt };
  });

  return { allowed: res.count <= limit, remaining: Math.max(0, limit - res.count), resetAt: res.resetAt };
}
