// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { DomainResolverService } from '@/server/services/domain-resolver.service';
import { RepositoryFactory } from '@/server/repositories';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const storeUidParam = typeof req.query.storeUid === 'string' ? req.query.storeUid.trim() : '';
    const href = typeof req.query.href === 'string' ? req.query.href.trim() : '';
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : '';
    const host = typeof req.query.host === 'string' ? req.query.host.trim().toLowerCase() : '';

    if (!storeUidParam && !href && !storeId) {
      return res.status(400).json({ error: 'MISSING_INPUT', hint: 'send storeUid or href' });
    }

    const resolver = new DomainResolverService();
    const result = await resolver.resolveStoreUid({
      storeUid: storeUidParam || undefined,
      href: href || undefined,
      storeId: storeId || undefined,
    });

    if (!result) {
      console.warn('[resolve] Store not found:', { href, storeId });
      return res.status(404).json({
        error: 'STORE_NOT_FOUND',
        message: 'لم يتم العثور على متجر لهذا الدومين/المعرف.',
      });
    }

    // AUTO-MAP CUSTOM DOMAIN: If we found the store by storeId but not by domain,
    // save the domain mapping for future requests (fire-and-forget)
    if (host && result.storeUid && storeId) {
      // Only auto-map if it's a custom domain (not salla.sa)
      const cleanHost = host.replace(/^www\./, '');
      if (!cleanHost.includes('salla.sa') && !cleanHost.includes('salla.dev')) {
        // Fire-and-forget: don't slow down the response
        try {
          const domainRepo = RepositoryFactory.getDomainRepository();
          domainRepo.saveCustomDomain(cleanHost, result.storeUid, 'salla').then(() => {
            console.log(`[resolve] Auto-mapped custom domain: ${cleanHost} -> ${result.storeUid}`);
          }).catch((err) => {
            console.warn('[resolve] Auto-map failed:', err);
          });
        } catch (e) {
          console.warn('[resolve] Auto-map setup failed:', e);
        }
      }
    }

    return res.status(200).json(result);
  } catch (e) {
    console.error('[resolve] unexpected', e);
    return res.status(500).json({ error: 'RESOLVE_FAILED' });
  }
}

