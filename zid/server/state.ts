//src/server/zid/state.ts
import crypto from 'crypto';
import { dbAdmin } from '@/lib/firebaseAdmin';

const TTL_MS = 10 * 60 * 1000; // 10 دقائق

export async function createZidState(uid: string) {
  const db = dbAdmin();
  const state = crypto.randomBytes(16).toString('base64url');
  await db.collection('zid_states').doc(state).set({
    uid,
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  });
  return state;
}

export async function consumeZidState(state: string) {
  const db = dbAdmin();
  const ref = db.collection('zid_states').doc(state);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false as const, reason: 'invalid' as const };
  const data = snap.data() as { uid: string; expiresAt: number };
  if (Date.now() > data.expiresAt) {
    await ref.delete();
    return { ok: false as const, reason: 'expired' as const };
  }
  await ref.delete();
  return { ok: true as const, uid: data.uid };
}
