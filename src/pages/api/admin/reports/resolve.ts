import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';

type Body = {
  reportId?: string;
  action?: 'resolve' | 'delete';
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<{ ok: true } | { message: string }>) {
  try {
    await verifyAdmin(req);
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

    const { reportId, action } = (req.body || {}) as Body;
    if (!reportId || (action !== 'resolve' && action !== 'delete')) {
      return res.status(400).json({ message: 'Invalid body' });
    }

    const db = dbAdmin();
    const ref = db.collection('review_reports').doc(reportId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ message: 'Report not found' });

    if (action === 'delete') {
      await ref.delete();
    } else {
      await ref.update({ resolved: true, resolvedAt: new Date() });
    }

    try {
      await db.collection('admin_audit_logs').add({
        action: `report-${action}`,
        reportId,
        createdAt: new Date(),
      });
    } catch (e) {
      console.warn('audit log failed', e);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('resolve report error', error);
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated')) return res.status(401).json({ message: 'Unauthorized' });
    if (msg.startsWith('permission-denied')) return res.status(403).json({ message: 'Forbidden' });
    return res.status(500).json({ message: 'Server error' });
  }
}
