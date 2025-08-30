// src/pages/api/store/info.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyStore, type AuthedRequest } from '@/utils/verifyStore';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyStore(req); // ✅ وسيط واحد فقط
  } catch (e) {
    const err = e as Error & { status?: number };
    return res.status(err.status ?? 401).json({ message: err.message || 'Unauthorized' });
  }

  try {
    const { storeId } = req as AuthedRequest;
    if (!storeId) {
      return res.status(400).json({ message: 'Missing storeId' });
    }

    const docRef = doc(db, 'stores', storeId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'Store not found' });
    }

    return res.status(200).json({ store: snapshot.data() });
  } catch (err) {
    console.error('Fetch store info error:', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
