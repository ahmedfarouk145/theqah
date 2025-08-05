// src/pages/api/admin/reports/resolve.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { verifyAdmin } from '@/utils/verifyAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await verifyAdmin(req); // ✅ تحقق من الصلاحية

    const { reportId, action } = req.body;

    if (!reportId || typeof reportId !== 'string') {
      return res.status(400).json({ message: 'Missing report ID' });
    }

    const reportRef = doc(db, 'review_reports', reportId);

    if (action === 'resolve') {
      await updateDoc(reportRef, {
        resolved: true,
        resolvedAt: new Date(),
      });
      return res.status(200).json({ message: 'Report resolved successfully' });
    }

    if (action === 'delete') {
      await deleteDoc(reportRef);
      return res.status(200).json({ message: 'Report deleted successfully' });
    }

    return res.status(400).json({ message: 'Invalid action' });
  } catch (error) {
    console.error('Resolve report error:', error);
    return res.status(401).json({ message: (error as Error).message || 'Unauthorized' });
  }
}
