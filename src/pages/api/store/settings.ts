// src/pages/api/store/settings.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { verifyStore, type AuthedRequest } from '@/utils/verifyStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // ✅ verify auth (verifyStore throws on failure)
  try {
    await verifyStore(req);
  } catch (e) {
    const err = e as Error & { status?: number };
    return res.status(err.status ?? 401).json({ message: err.message || 'Unauthorized' });
  }

  const { storeId } = req as AuthedRequest;
  if (!storeId) {
    return res.status(400).json({ message: 'Missing storeId' });
  }

  const storeRef = doc(db, 'stores', storeId);

  try {
    if (req.method === 'GET') {
      const snapshot = await getDoc(storeRef);
      if (!snapshot.exists()) {
        return res.status(404).json({ message: 'Settings not found' });
      }
      return res.status(200).json(snapshot.data());
    }

    if (req.method === 'POST') {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ message: 'Invalid payload' });
      }
      await setDoc(storeRef, data, { merge: true });
      return res.status(200).json({ message: 'Settings saved' });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Settings Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
