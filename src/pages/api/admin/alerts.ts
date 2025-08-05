import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { getDocs, collection } from 'firebase/firestore';
import { verifyAdmin } from '@/utils/verifyAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req); // تتحقق من الصلاحية، أو ترمي خطأ

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const snapshot = await getDocs(collection(db, 'review_reports'));
    const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return res.status(200).json({ alerts });
  } catch (error) {
    console.error('Admin Alerts Error:', error);
    return res.status(401).json({ message: (error as Error).message || 'Unauthorized' });
  }
}
