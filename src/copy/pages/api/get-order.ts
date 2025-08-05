// src/pages/api/get-order.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Missing id' });
  }

  try {
    const docRef = doc(db, 'orders', id);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return res.status(404).json({ message: 'Order not found' });
    }

    return res.status(200).json(snap.data());
  } catch (error) {
    console.error('GetOrder Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
}
