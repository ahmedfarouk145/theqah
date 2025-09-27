// src/pages/api/admin/hide.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const decoded = await verifyAdmin(req);
    const { id } = req.query;
    if (!id || typeof id !== 'string') return res.status(400).json({ message: 'Missing review ID' });

    const db = dbAdmin();
    const ref = db.collection('reviews').doc(id);
    await ref.update({ published: false, status: 'hidden', lastModified: new Date() });

    await db.collection('admin_audit_logs').add({
      action: 'hideReview',
      reviewId: id,
      adminUid: decoded.uid,
      createdAt: new Date(),
    });

    return res.status(200).json({ message: 'Review hidden successfully' });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Hide review error:', error);
    const msg = String(error?.message || '');
    if (msg.startsWith('unauthenticated')) return res.status(401).json({ message: 'Unauthorized' });
    if (msg.startsWith('permission-denied')) return res.status(403).json({ message: 'Forbidden' });
    return res.status(500).json({ message: 'Server error' });
  }
}
