// Production debugging endpoint for Salla webhook issues
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = dbAdmin();
  const debugKey = req.query.key || '';
  
  // Basic auth check (use a secret key from env vars)
  if (debugKey !== process.env.DEBUG_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get recent webhook processing status
    const webhooksSnapshot = await db.collection('webhooks_salla')
      .orderBy('at', 'desc')
      .limit(20)
      .get();

    const webhookStatuses = webhooksSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      idemKey: doc.id.substring(0, 8) + '...', // Truncate for security
    }));

    // Get recent errors
    const errorsSnapshot = await db.collection('webhook_errors')
      .orderBy('at', 'desc')
      .limit(10)
      .get();

    const recentErrors = errorsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get event processing status
    const processedSnapshot = await db.collection('processed_events')
      .orderBy('at', 'desc')
      .limit(20)
      .get();

    const processedEvents = processedSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get failed webhooks specifically
    const failedWebhooks = webhookStatuses.filter(w => w.statusFlag === 'failed');
    const processingWebhooks = webhookStatuses.filter(w => w.statusFlag === 'processing');
    
    // Summary statistics
    const stats = {
      total: webhookStatuses.length,
      processing: processingWebhooks.length,
      completed: webhookStatuses.filter(w => w.statusFlag === 'done').length,
      failed: failedWebhooks.length,
      duplicates: webhookStatuses.filter(w => w.statusFlag === 'duplicate').length,
      recentErrors: recentErrors.length,
    };

    return res.status(200).json({
      status: 'ok',
      timestamp: Date.now(),
      stats,
      failedWebhooks: failedWebhooks.slice(0, 5), // Limit sensitive data
      recentErrors: recentErrors.slice(0, 5),
      lastProcessedEvents: processedEvents.slice(0, 5),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasWebhookSecret: !!process.env.SALLA_WEBHOOK_SECRET,
        hasWebhookToken: !!process.env.SALLA_WEBHOOK_TOKEN,
        hasAppBaseUrl: !!process.env.APP_BASE_URL,
      }
    });

  } catch (error) {
    console.error('[DEBUG] Error fetching Salla status:', error);
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
