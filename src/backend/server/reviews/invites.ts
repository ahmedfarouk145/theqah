import { dbAdmin } from '@/lib/firebaseAdmin';
import crypto from 'crypto';
import { ensureSingleInviteKey } from '../idempotency';

export type Invite = {
  id: string; token: string; orderId: string; storeUid: string;
  customerPhone: string; status: 'pending'|'sent'|'consumed'|'expired'|'canceled';
  createdAt: number; expiresAt: number; reminded?: boolean;
};

export async function getOrCreateInvite(storeUid: string, orderId: string, customerPhone: string, ttlDays=30): Promise<Invite> {
  await ensureSingleInviteKey(storeUid, orderId);

  const q = await dbAdmin().collection('review_invites')
    .where('storeUid','==',storeUid).where('orderId','==',orderId).limit(1).get();
  if (!q.empty) return q.docs[0].data() as Invite;

  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const inv: Invite = {
    id: crypto.createHash('sha1').update(`${storeUid}:${orderId}`).digest('hex'),
    token, orderId, storeUid, customerPhone,
    status: 'pending', createdAt: now, expiresAt: now + ttlDays*24*60*60*1000,
  };
  await dbAdmin().collection('review_invites').doc(inv.id).set(inv, { merge: true });
  return inv;
}
