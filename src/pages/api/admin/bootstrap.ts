// src/pages/api/admin/bootstrap.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(401).json({ ok: false });
  }
}
