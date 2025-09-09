// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

type StoreDoc = {
  uid?: string;
  storeUid?: string;
  storeId?: number | string;
  updatedAt?: number;
  salla?: {
    uid?: string;
    storeId?: number | string;
    domain?: string;        // قد تكون https://demostore.salla.sa/dev-xxxx
    connected?: boolean;
    installed?: boolean;
  };
};

function cleanHost(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

function parseHref(raw: unknown) {
  const out = { host: '', origin: '', base: '', href: '' };
  try {
    const u = new URL(String(raw || ''));
    out.host = u.host.replace(/^www\./, '').toLowerCase();
    out.origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split('/').filter(Boolean)[0] || '';
    // سلة dev-... ⇒ اعتبرها جزء من الـ base
    out.base = firstSeg && firstSeg.startsWith('dev-') ? `${out.origin}/${firstSeg}` : out.origin;
    out.href = u.href.toLowerCase();
  } catch {}
  return out;
}

const norm = (s: string) => String(s || '').trim().toLowerCase().replace(/\/+$/,'');
const prefixScore = (storeDomain: string, pageHref: string) => {
  const a = norm(storeDomain);
  const b = norm(pageHref);
  return b.startsWith(a) ? a.length : 0;
};

// Simple in-memory cache (TTL)
//eslint-disable-next-line @typescript-eslint/no-explicit-any
const MEM: Map<string, { uid: string; t: number }> = (global as any).__THEQAH_RESOLVE_MEM__ || new Map();
//eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__THEQAH_RESOLVE_MEM__ = MEM;
const TTL = 10 * 60 * 1000; // 10m

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS — بدون x-headers → المتصفح ما يعملش OPTIONS للودجت
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const { host: hrefHost, base, href } = parseHref(req.query.href);
    const qHost = cleanHost(req.query.host || req.headers.host);
    const host = hrefHost || qHost;

    const storeId = String(req.query.storeId || req.query.store || '').trim();
    const storeUid = String(req.query.storeUid || '').trim();

    const cacheKey = `h:${host}|sid:${storeId}|su:${storeUid}|b:${base}`;
    const hit = MEM.get(cacheKey);
    if (hit && Date.now() - hit.t < TTL) {
      return res.status(200).json({ storeUid: hit.uid });
    }

    // 1) storeUid مباشر
    if (storeUid) {
      MEM.set(cacheKey, { uid: storeUid, t: Date.now() });
      return res.status(200).json({ storeUid });
    }

    // 2) storeId → salla:{id}
    if (storeId) {
      const resolvedUid = `salla:${storeId}`;
      MEM.set(cacheKey, { uid: resolvedUid, t: Date.now() });
      return res.status(200).json({ storeUid: resolvedUid });
    }

    // 3) host/href مطلوب
    if (!host) return res.status(400).json({ error: 'MISSING_HOST' });

    const db = dbAdmin();

    // أ) محاولات تطابق مباشرة على salla.domain (origin و base و variants)
    const variants = new Set<string>([
      `https://${host}`,
      `https://www.${host}`,
      `http://${host}`,
      `http://www.${host}`,
      base || '',
      base ? base.replace(/^http:/,'https:') : '',
      base ? base.replace(/^https:/,'http:') : '',
    ].filter(Boolean));

    let foundDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

    for (const v of variants) {
      const snap = await db.collection('stores')
        .where('salla.domain', '==', v)
        .where('salla.connected', '==', true)
        .where('salla.installed', '==', true)
        .limit(1).get();
      if (!snap.empty) { foundDoc = snap.docs[0]; break; }
    }

    // ب) فallback: امسح المتاجر المتصلة/المثبتة واختر أعلى prefixScore بالنسبة للـ href/base
    if (!foundDoc) {
      const snap = await db.collection('stores')
        .where('salla.connected', '==', true)
        .where('salla.installed', '==', true)
        .get();

      let best = { score: 0, updatedAt: 0, doc: undefined as FirebaseFirestore.QueryDocumentSnapshot | undefined };

      snap.forEach(d => {
        const data = d.data() as StoreDoc;
        const sd = String(data?.salla?.domain || '');
        if (!sd) return;

        const score = Math.max(
          prefixScore(sd, href || ''),
          prefixScore(sd, base || ''),
          prefixScore(sd, `https://${host}`)
        );

        // فضّل الأعلى score، ولو تعادل فضّل الأحدث updatedAt
        const updatedAt = Number(data?.updatedAt || 0);
        if (score > best.score || (score === best.score && updatedAt > best.updatedAt)) {
          best = { score, updatedAt, doc: d };
        }
      });

      foundDoc = best.doc;
    }

    if (!foundDoc) {
      return res.status(404).json({ error: 'STORE_NOT_FOUND', host, base });
    }

    const data = foundDoc.data() as StoreDoc;
    const uid =
      data.uid ||
      data.storeUid ||
      data.salla?.uid ||
      (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined) ||
      (data.storeId != null ? `salla:${String(data.storeId)}` : undefined);

    if (!uid) return res.status(404).json({ error: 'UID_NOT_FOUND' });

    MEM.set(cacheKey, { uid, t: Date.now() });
    return res.status(200).json({ storeUid: uid });
//eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Unexpected error in resolve handler:', error);
    return res.status(500).json({
      error: 'RESOLVE_FAILED',
      details: process.env.NODE_ENV === 'development' ? String(error?.message || error) : undefined
    });
  }
}
