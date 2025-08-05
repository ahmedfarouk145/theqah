// src/pages/api/admin/reviews/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { verifyAdmin } from '@/utils/verifyAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await verifyAdmin(req); // ✅ تحقق من التوكن

    const { id } = req.query;
    const { published } = req.body;

    if (typeof published !== 'boolean') {
      return res.status(400).json({ message: 'Invalid published value' });
    }

    const reviewRef = doc(db, 'reviews', id as string);
    await updateDoc(reviewRef, {
      published,
    });

    return res.status(200).json({ message: 'Review updated' });
  } catch (error) {
    console.error('Update review error:', error);
    return res.status(401).json({ message: (error as Error).message || 'Unauthorized' });
  }
}
