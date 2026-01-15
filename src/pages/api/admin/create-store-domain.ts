// src/pages/api/admin/create-store-domain.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';

function encodeUrlForFirestore(url: string | null | undefined): string {
  if (!url) return '';
  return String(url).replace(/\./g, '_DOT_').replace(/:/g, '_COLON_').replace(/\//g, '_SLASH_').replace(/#/g, '_HASH_').replace(/\?/g, '_QUESTION_').replace(/&/g, '_AMP_');
}

function normalizeUrl(url: string): URL | null {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`); } catch { return null; }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.success) return res.status(401).json({ error: 'Unauthorized' });

    const { merchantId, domain, storeUid } = req.body;
    if (!merchantId || !domain) {
      return res.status(400).json({ error: 'Missing required fields', required: ['merchantId', 'domain'] });
    }

    const db = dbAdmin();
    const finalStoreUid = storeUid || `salla:${merchantId}`;
    const normalizedDomain = normalizeUrl(domain);

    if (!normalizedDomain) return res.status(400).json({ error: 'Invalid domain format', domain });

    const baseDomain = normalizedDomain.origin;

    // Save to stores collection
    await db.collection('stores').doc(finalStoreUid).set({
      uid: finalStoreUid,
      provider: 'salla',
      updatedAt: Date.now(),
      salla: { uid: finalStoreUid, storeId: merchantId, connected: true, installed: true, domain: baseDomain },
      domain: { base: baseDomain, key: encodeUrlForFirestore(baseDomain), updatedAt: Date.now(), createdManually: true },
    }, { merge: true });

    // Save to domains collection
    const domainKey = encodeUrlForFirestore(baseDomain);
    await db.collection('domains').doc(domainKey).set({
      base: baseDomain,
      key: domainKey,
      uid: finalStoreUid,
      storeUid: finalStoreUid,
      provider: 'salla',
      createdManually: true,
      updatedAt: Date.now(),
    }, { merge: true });

    return res.status(200).json({ ok: true, message: 'Store domain created successfully', storeUid: finalStoreUid, domain: baseDomain });
  } catch (error) {
    console.error('[MANUAL DOMAIN] Error:', error);
    return res.status(500).json({ error: 'Failed to create store domain', message: error instanceof Error ? error.message : String(error) });
  }
}
