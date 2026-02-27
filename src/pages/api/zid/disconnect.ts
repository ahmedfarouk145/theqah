// src/pages/api/zid/disconnect.ts
// Disconnects Zid integration — delegates to ZidTokenService

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/backend/server/auth/requireUser';
import { ZidTokenService } from '@/backend/server/services/zid-token.service';
import { dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  let user;
  try {
    user = await requireUser(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const uid = user.uid;
  const db = dbAdmin();

  try {
    // Get store to find Zid store ID
    const storeDoc = await db.collection('stores').doc(uid).get();
    const storeData = storeDoc.data();
    const zidStoreId = storeData?.zid?.storeId;

    // Delete tokens via service
    const tokenService = ZidTokenService.getInstance();
    if (zidStoreId) {
      await tokenService.deleteTokens(zidStoreId);
    }
    // Also clean up UID-based tokens
    await db.collection('zid_tokens').doc(uid).delete().catch(() => { });

    // Mark store as disconnected
    await db.collection('stores').doc(uid).set(
      {
        zid: { connected: false, installed: false, updatedAt: Date.now() },
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    console.log(`[ZID_DISCONNECT] Store ${uid} disconnected`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ZID_DISCONNECT] Error:', err);
    return res.status(500).json({ error: 'disconnect_failed' });
  }
}
