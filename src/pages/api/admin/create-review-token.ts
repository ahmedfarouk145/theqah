// src/pages/api/admin/create-review-token.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.success) return res.status(401).json({ error: 'Unauthorized' });

    const { orderId, storeUid, customerName, customerEmail, customerMobile, productIds = [], baseUrl } = req.body;

    if (!orderId || !storeUid) {
      return res.status(400).json({ error: 'Missing required fields', required: ['orderId', 'storeUid'] });
    }

    const db = dbAdmin();

    // Check existing
    const existing = await db.collection('review_tokens').where('orderId', '==', orderId).limit(1).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      return res.status(200).json({ ok: true, message: 'Review token already exists', tokenId: doc.id, url: doc.data().url, existing: true });
    }

    const tokenId = crypto.randomBytes(10).toString('hex');
    const finalBaseUrl = baseUrl || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://theqah.com';
    const reviewUrl = `${finalBaseUrl}/review/${tokenId}`;

    const tokenDoc = {
      id: tokenId,
      orderId: String(orderId),
      storeUid: String(storeUid),
      url: reviewUrl,
      customer: { name: customerName || 'عميل', email: customerEmail || null, mobile: customerMobile || null },
      productIds: Array.isArray(productIds) ? productIds : [],
      createdAt: Date.now(),
      usedAt: null,
      createdVia: 'manual_admin',
    };

    await db.collection('review_tokens').doc(tokenId).set(tokenDoc);

    // Create invite record
    await db.collection('review_invites').add({
      id: crypto.randomBytes(8).toString('hex'),
      orderId: String(orderId),
      storeUid: String(storeUid),
      tokenId,
      reviewUrl,
      customer: tokenDoc.customer,
      productIds: tokenDoc.productIds,
      createdAt: Date.now(),
      status: 'created',
      createdVia: 'manual_admin',
    });

    return res.status(200).json({ ok: true, message: 'Review token created successfully', tokenId, orderId, storeUid, url: reviewUrl });
  } catch (error) {
    console.error('[MANUAL TOKEN] Error:', error);
    return res.status(500).json({ error: 'Failed to create review token', message: error instanceof Error ? error.message : String(error) });
  }
}
