import type { NextApiRequest, NextApiResponse } from 'next';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { verifyStore } from '@/utils/verifyStore';

interface StoreRequest extends NextApiRequest {
  storeId: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const error = await verifyStore(req, res);
  if (error) return;

  const typedReq = req as StoreRequest;

  if (typedReq.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { name, phone, email, orderId, productId, storeName } = typedReq.body;

    if (!name || !phone || !orderId || !productId || !storeName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const docRef = await addDoc(collection(db, 'orders'), {
      name,
      phone,
      email,
      orderId,
      productId,
      storeName,
      storeId: typedReq.storeId,
      sent: false,
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({ message: 'Order added', id: docRef.id });
  } catch (error) {
    console.error('Add Order Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
