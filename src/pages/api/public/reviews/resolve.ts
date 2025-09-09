// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

function cleanHost(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-theqah-widget');
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

    console.log('Resolve request:', { host, storeId, storeUid, userAgent: req.headers['user-agent'] });

    // 1) If storeUid provided directly
    if (storeUid) {
      console.log('Returning provided storeUid:', storeUid);
      return res.status(200).json({ storeUid });
    }
    
    // 2) If storeId provided, convert to salla format
    if (storeId) {
      const resolvedUid = `salla:${storeId}`;
      console.log('Returning resolved storeUid from storeId:', resolvedUid);
      return res.status(200).json({ storeUid: resolvedUid });
    }

    // 3) Lookup by host/domain
    if (!host) {
      console.error('Missing host parameter');
      return res.status(400).json({ error: 'MISSING_HOST' });
    }

    console.log('Looking up store by host:', host);

    const db = dbAdmin();
    let doc;

    // Strategy 1: Search by salla.domain field (most accurate for Salla stores)
    try {
      console.log('Querying stores by salla.domain...');
      
      // Try exact match with https prefix
      let snap = await db.collection('stores')
        .where('salla.domain', '==', `https://${host}`)
        .where('salla.connected', '==', true)
        .where('salla.installed', '==', true)
        .limit(1)
        .get();
      
      doc = snap.docs[0];
      
      // If not found, try with different variations
      if (!doc) {
        const domainVariations = [
          `https://${host}`,
          `https://www.${host}`,
          `http://${host}`,
          `http://www.${host}`,
          host,
          `www.${host}`
        ];
        
        for (const variation of domainVariations) {
          snap = await db.collection('stores')
            .where('salla.domain', '==', variation)
            .where('salla.connected', '==', true)
            .where('salla.installed', '==', true)
            .limit(1)
            .get();
          
          if (!snap.empty) {
            doc = snap.docs[0];
            console.log('Found store by domain variation:', variation, doc.id);
            break;
          }
        }
      }
      
      if (doc) {
        console.log('Found store by salla.domain:', doc.id);
      }
    } catch (error) {
      console.error('Error querying by salla.domain:', error);
    }

    // Strategy 2: Manual search through all connected stores (fallback)
    if (!doc) {
      try {
        console.log('Performing manual domain matching...');
        const snap = await db.collection('stores')
          .where('salla.connected', '==', true)
          .where('salla.installed', '==', true)
          .get();
        
        for (const storeDoc of snap.docs) {
          const data = storeDoc.data();
          const storeDomain = data.salla?.domain || '';
          
          // Check if the domain matches (with various formats)
          const domainChecks = [
            storeDomain.includes(host),
            storeDomain.includes(host.replace('www.', '')),
            storeDomain.replace(/^https?:\/\//, '').replace(/^www\./, '') === host,
            storeDomain.replace(/^https?:\/\//, '') === host,
            storeDomain === `https://${host}`,
            storeDomain === `http://${host}`
          ];
          
          if (domainChecks.some(Boolean)) {
            doc = storeDoc;
            console.log('Found store by manual domain matching:', doc.id, 'domain:', storeDomain);
            break;
          }
        }
      } catch (error) {
        console.error('Error in manual domain matching:', error);
      }
    }

    if (!doc) {
      console.log('Store not found for host:', host);
      return res.status(404).json({ error: 'STORE_NOT_FOUND', host });
    }
//eslint-disable-next-line
    const data = doc.data() as any;
    console.log('Store data found:', { 
      uid: data.uid, 
      storeUid: data.storeUid, 
      sallaStoreId: data.salla?.storeId,
      sallaUid: data.salla?.uid,
      sallaDomain: data.salla?.domain,
      sallaConnected: data.salla?.connected,
      sallaInstalled: data.salla?.installed
    });

    // Extract UID based on Salla store structure
    const uid = data.uid || 
                data.storeUid || 
                data.salla?.uid ||
                (data.salla?.storeId ? `salla:${data.salla.storeId}` : undefined) ||
                (data.storeId != null ? `salla:${String(data.storeId)}` : undefined);

    if (!uid) {
      console.error('No valid UID found in store document');
      return res.status(404).json({ error: 'UID_NOT_FOUND' });
    }

    console.log('Returning resolved storeUid:', uid);
    return res.status(200).json({ storeUid: uid });

  } catch (error) {
    console.error('Unexpected error in resolve handler:', error);
    return res.status(500).json({ 
      error: 'RESOLVE_FAILED',
      details: process.env.NODE_ENV === 'development'
      //eslint-disable-next-line
        ? (typeof error === 'object' && error !== null && 'message' in error ? String((error as any).message) : String(error))
        : undefined
    });
  }
}