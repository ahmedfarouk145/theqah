// src/pages/api/admin/alerts.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { AdminService } from '@/server/services/admin.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);
    const adminService = new AdminService();

    if (req.method === 'GET') {
      const items = await adminService.listAlerts();
      return res.status(200).json({ items });
    }

    if (req.method === 'POST') {
      const { message, level = 'info' } = req.body || {};
      if (!message) return res.status(400).json({ message: 'message required' });
      const id = await adminService.createAlert({ message, level, createdAt: Date.now() });
      return res.status(200).json({ id, ok: true });
    }

    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (e) {
    const msg = (e as Error).message || '';
    if (msg.startsWith('unauthenticated')) return res.status(401).json({ message: 'Unauthorized' });
    if (msg.startsWith('permission-denied')) return res.status(403).json({ message: 'Forbidden' });
    return res.status(500).json({ message: 'Server error' });
  }
}
