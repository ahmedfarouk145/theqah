import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = dbAdmin();
    // Lightweight check: Access a collection count or similar, or just verify instance
    // A simple listCollections() or just verifying initialization is good for "dependencies"
    // Let's try to list collections (limit 1) to ensure DB connectivity
    await db.listCollections();

    return res.status(200).json({
      status: 'ok',
      checks: {
        database: 'up',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return res.status(503).json({
      status: 'error',
      checks: {
        database: 'down',
        error: (error as Error).message
      }
    });
  }
}
