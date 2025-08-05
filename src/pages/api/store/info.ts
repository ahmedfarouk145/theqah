import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyStore } from '@/utils/verifyStore';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

// تعريف نوع مخصص يحتوي على storeId
interface StoreRequest extends NextApiRequest {
  storeId: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const error = await verifyStore(req, res);
  if (error) return;

  try {
    const storeId = (req as StoreRequest).storeId;
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
