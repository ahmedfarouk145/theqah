import type { NextApiRequest, NextApiResponse } from 'next';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { verifyStore } from '@/utils/verifyStore';

interface StoreRequest extends NextApiRequest {
  storeId: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const error = await verifyStore(req, res);
  if (error) return;

  const typedReq = req as StoreRequest;

  if (typedReq.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const q = query(collection(db, 'orders'), where('storeId', '==', typedReq.storeId));
    const snapshot = await getDocs(q);

    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return res.status(200).json({ orders });
  } catch (error) {
    console.error('Fetch Orders Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
