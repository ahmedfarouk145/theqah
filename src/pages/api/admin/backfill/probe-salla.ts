// src/pages/api/admin/backfill/probe-salla.ts
//
// One-shot diagnostic: fetch ONE page of Salla /admin/v2/reviews for a
// given storeUid, return the raw response. Useful to verify the actual
// shape Salla sends (does each review include product/customer inline?
// does `expanded=true` change anything?) without waiting for cron.

import type { NextApiRequest, NextApiResponse } from 'next';
import { SallaTokenService } from '@/server/services/salla-token.service';

function extractBearerToken(header: string | undefined): string {
    if (!header) return '';
    const m = header.trim().match(/^Bearer\s+(\S+)\s*$/);
    return m ? m[1] : '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const auth = extractBearerToken(req.headers.authorization);
    if (!auth || auth !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const storeUid = String(req.query.storeUid || '');
    if (!storeUid) return res.status(400).json({ error: 'storeUid required' });

    const expanded = req.query.expanded === '0' ? false : true;
    const page = String(req.query.page || '1');

    const accessToken = await SallaTokenService.getInstance().getValidAccessToken(storeUid);
    if (!accessToken) {
        return res.status(200).json({ ok: false, reason: 'no_valid_token', storeUid });
    }

    const url = new URL('https://api.salla.dev/admin/v2/reviews');
    url.searchParams.set('page', page);
    url.searchParams.set('per_page', '5');
    if (expanded) url.searchParams.set('expanded', 'true');
    // Optional: scope to one product to test the per-product flow.
    const productId = String(req.query.product || '');
    if (productId) url.searchParams.append('products[]', productId);
    // Optional: filter by type (rating | ask | testimonial).
    const typeFilter = String(req.query.type || '');
    if (typeFilter) url.searchParams.set('type', typeFilter);

    const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    let body: unknown;
    const text = await r.text();
    try { body = JSON.parse(text); } catch { body = text; }

    // Trim to what we care about: a list of (firstReview, count, expanded, status, raw_pagination)
    type ReviewLite = {
        id?: unknown; type?: unknown; rating?: unknown; order_id?: unknown;
        product?: unknown; customer?: unknown; date?: unknown;
        keys: string[];
    };
    const data = (body && typeof body === 'object' && 'data' in body)
        ? (body as { data?: unknown[] }).data ?? []
        : [];

    const sample: ReviewLite[] = data.slice(0, 3).map((it) => {
        const o = (it ?? {}) as Record<string, unknown>;
        return {
            id: o.id, type: o.type, rating: o.rating, order_id: o.order_id,
            product: o.product, customer: o.customer, date: o.date,
            keys: Object.keys(o),
        };
    });

    return res.status(200).json({
        ok: r.ok,
        httpStatus: r.status,
        urlSent: url.toString(),
        expanded,
        count: data.length,
        sample,
        pagination: (body && typeof body === 'object' && 'pagination' in body) ? (body as { pagination?: unknown }).pagination : undefined,
    });
}
