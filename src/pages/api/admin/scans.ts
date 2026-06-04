// src/pages/api/admin/scans.ts
// Admin-only: list AEO-scanner scans — who scanned (domain) and who left an
// email (leads) — stamped with subscriber status. Gated by verifyAdmin; this
// data includes visitor emails + IPs and must never be public.
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { summarizeScans, type RawScan } from '@/server/scans/summarize-scans';

const MAX_ROWS = 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const snap = await dbAdmin()
      .collection('scans')
      .orderBy('createdAt', 'desc')
      .limit(MAX_ROWS)
      .get();

    const docs = snap.docs.map((d) => d.data() as RawScan);
    return res.status(200).json(summarizeScans(docs));
  } catch (error) {
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated') || msg === 'no_token') {
      return res.status(401).json({ message: 'غير مصرح', error: 'Unauthorized' });
    }
    if (msg.startsWith('permission-denied') || msg === 'forbidden') {
      return res.status(403).json({ message: 'ليس لديك صلاحية', error: 'Forbidden' });
    }
    console.error('Admin Scans Error:', error);
    return res.status(500).json({ message: 'خطأ داخلي في الخادم', error: 'Internal Server Error' });
  }
}
