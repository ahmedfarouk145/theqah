// src/pages/api/admin/export-reviews.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { MaintenanceService } from '@/server/services/maintenance.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const maintenance = new MaintenanceService();
    const { reviews, summary } = await maintenance.exportReviews();

    return res.status(200).json({ success: true, summary, reviews });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ success: false, error: errorMessage });
  }
}
