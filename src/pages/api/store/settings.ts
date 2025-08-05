import type { NextApiRequest, NextApiResponse } from 'next';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { verifyStore } from '@/utils/verifyStore';

// Extend NextApiRequest to include storeId injected by middleware
type CustomNextApiRequest = NextApiRequest & {
  storeId?: string;
};

export default async function handler(req: CustomNextApiRequest, res: NextApiResponse) {
  const error = await verifyStore(req, res);
  if (error) return;

  const storeId = req.storeId;
  if (!storeId) return res.status(400).json({ message: 'Missing storeId' });

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
      await setDoc(storeRef, data, { merge: true });
      return res.status(200).json({ message: 'Settings saved' });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Settings Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
