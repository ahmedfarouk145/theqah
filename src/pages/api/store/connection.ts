// src/pages/api/store/connection.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { verifyUser } from '@/utils/verifyUser';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { uid } = await verifyUser(req);
    const docRef = doc(db, 'stores', uid);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return res.status(404).json({ connected: false });
    }

    const salla = snap.data().salla;
    const connected = !!salla?.connected;
    const connectedAt = salla?.connected_at || null;

    return res.status(200).json({ connected, connectedAt });
  } catch {
    return res.status(401).json({ connected: false, error: 'Unauthorized' });
  }
}
