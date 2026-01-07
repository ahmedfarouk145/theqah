import type { NextApiRequest, NextApiResponse } from 'next';
import { VerificationService } from '@/server/services/verification.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const verificationService = new VerificationService();
    const stats = await verificationService.getPlatformStats();

    // Cache for 5 minutes (CDN) + 10 minutes stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    res.status(200).json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
}