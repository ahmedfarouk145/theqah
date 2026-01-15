// src/pages/api/salla/verify.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SupportService } from '@/server/services/support.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const uid = typeof req.query.uid === 'string' ? req.query.uid : null;
    if (!uid) {
      return res.status(400).json({ error: 'missing uid' });
    }

    const supportService = new SupportService();
    const result = await supportService.getSallaVerification(uid);

    return res.json(result);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
