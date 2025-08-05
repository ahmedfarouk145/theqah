// src/pages/api/admin/hide.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { verifyAdmin } from '@/utils/verifyAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await verifyAdmin(req); // ✅ تحقق من صلاحية المشرف

    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Missing review ID' });
    }

    const reviewRef = doc(db, 'reviews', id);
    await updateDoc(reviewRef, {
      published: false,
    });

    return res.status(200).json({ message: 'Review hidden successfully' });
  } catch (error) {
    console.error('Hide review error:', error);
    return res.status(401).json({ message: (error as Error).message || 'Unauthorized' });
  }
}
