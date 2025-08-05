import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { reviewId, name, email, reason } = req.body;

  if (!reviewId || !reason || !name || !email) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    await addDoc(collection(db, 'review_reports'), {
      reviewId,
      name,
      email,
      reason,
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({ message: 'Report submitted successfully' });
  } catch (error) {
    console.error('Report Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
