// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

function cleanHost(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

// ذاكرة بسيطة عبر عمر العملية
const MEM_KEY = '__THEQAH_RESOLVE_MEM__';
const mem: Map<string, { uid: string; t: number }> =
//eslint-disable-next-line 
  (global as any)[MEM_KEY] || new Map();
  //eslint-disable-next-line
(global as any)[MEM_KEY] = mem;

const TTL = 10 * 60 * 1000; // 10 دقائق

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS (خفيف بدون هيدرات مخصّصة => يقلّل OPTIONS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400'); // كاش للـpreflight يوم
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const host = cleanHost(req.query.host || req.query.domain);
    const storeId = String(req.query.storeId || req.query.store || '').trim();
    const storeUid = String(req.query.storeUid || '').trim();

    // مفتاح الكاش
    const cacheKey = `h:${host}|sid:${storeId}|su:${storeUid}|v:${String(req.query.v || '')}`;
    const hit = mem.get(cacheKey);
    if (hit && Date.now() - hit.t < TTL) {
      return res.status(200).json({ storeUid: hit.uid });
    }

    // 1) storeUid مباشر
    if (storeUid) {
      mem.set(cacheKey, { uid: storeUid, t: Date.now() });
      return res.status(200).json({ storeUid });
    }

    // 2) storeId → salla:{id}
    if (storeId) {
      const resolvedUid = `salla:${storeId}`;
      mem.set(cacheKey, { uid: resolvedUid, t: Date.now() });
      return res.status(200).json({ storeUid: resolvedUid });
    }

    // 3) lookup بالـ host
    if (!host) {
      return res.status(400).json({ error: 'MISSING_HOST' });
    }

    const db = dbAdmin();
    let doc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

    // Strategy 1: salla.domain تطابق مباشر + variations
    try {
      const variations = [
        `https://${host}`,
        `https://www.${host}`,
        `http://${host}`,
        `http://www.${host}`,
        host,
        `www.${host}`,
      ];

      for (const variation of variations) {
        const snap = await db.collection('stores')
          .where('salla.domain', '==', variation)
          .where('salla.connected', '==', true)
          .where('salla.installed', '==', true)
          .limit(1)
          .get();
        if (!snap.empty) {
          doc = snap.docs[0];
          break;
        }
      }
    } catch (err) {
      // log فقط
      console.error('Error querying by salla.domain:', err);
    }

    // Strategy 2: مسح يدوي (fallback)
    if (!doc) {
      try {
        const snap = await db.collection('stores')
          .where('salla.connected', '==', true)
          .where('salla.installed', '==', true)
          .get();

        for (const d of snap.docs) {
            //eslint-disable-next-line
          const data = d.data() as any;
          const storeDomain = String(data?.salla?.domain || '');
          const normalized = storeDomain.replace(/^https?:\/\//, '').replace(/^www\./, '');
          if (!storeDomain) continue;

          const ok =
            storeDomain.includes(host) ||
            storeDomain.includes(host.replace('www.', '')) ||
            normalized === host ||
            storeDomain === `https://${host}` ||
            storeDomain === `http://${host}`;

          if (ok) { doc = d; break; }
        }
      } catch (err) {
        console.error('Error in manual domain matching:', err);
      }
    }

    if (!doc) {
      return res.status(404).json({ error: 'STORE_NOT_FOUND', host });
    }

    // استخراج UID
    // eslint-disable-next-line
    const data = doc.data() as any;
    const uid =
      data.uid ||
      data.storeUid ||
      data.salla?.uid ||
      (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined) ||
      (data.storeId != null ? `salla:${String(data.storeId)}` : undefined);

    if (!uid) {
      return res.status(404).json({ error: 'UID_NOT_FOUND' });
    }

    mem.set(cacheKey, { uid, t: Date.now() });
    return res.status(200).json({ storeUid: uid });
//eslint-disable-next-line
  } catch (error: any) {
    console.error('Unexpected error in resolve handler:', error);
    return res.status(500).json({
      error: 'RESOLVE_FAILED',
      details: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined
    });
  }
}
