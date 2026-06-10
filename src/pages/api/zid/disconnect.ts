// src/pages/api/zid/disconnect.ts
// Disconnects Zid integration — delegates to ZidTokenService

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireStore, StoreNotLinkedError } from '@/server/auth/resolveStoreUid';
import { ZidTokenService } from '@/backend/server/services/zid-token.service';
import { dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  let storeUid: string;
  let uid: string;
  try {
    ({ uid, storeUid } = await requireStore(req));
  } catch (e) {
    if (e instanceof StoreNotLinkedError) {
      return res.status(200).json({ ok: false, storeNotLinked: true });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = dbAdmin();

  try {
    // Get store to find Zid store ID
    const storeDoc = await db.collection('stores').doc(storeUid).get();
    const storeData = storeDoc.data();
    const zidStoreId = storeData?.zid?.storeId;

    // Delete tokens via service
    const tokenService = ZidTokenService.getInstance();
    if (zidStoreId) {
      await tokenService.deleteTokens(zidStoreId);
    }
    // Also clean up legacy UID-keyed token docs
    await db.collection('zid_tokens').doc(uid).delete().catch(() => { });

    // Mark store as disconnected
    await db.collection('stores').doc(storeUid).set(
      {
        zid: { connected: false, installed: false, updatedAt: Date.now() },
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    console.log(`[ZID_DISCONNECT] Store ${storeUid} disconnected`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ZID_DISCONNECT] Error:', err);
    return res.status(500).json({ error: 'disconnect_failed' });
  }
}
