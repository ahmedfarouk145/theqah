/**
 * Debug endpoint to check what Salla API returns for reviews
 * DELETE after testing!
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { sallaTokenService } from '@/server/services/salla-token.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const storeUid = (req.query.storeUid as string) || 'salla:982747175';
    const productId = req.query.productId as string;

    try {
        const accessToken = await sallaTokenService.getValidAccessToken(storeUid);

        if (!accessToken) {
            return res.status(400).json({ error: 'No access token for store' });
        }

        // Build URL
        const apiUrl = productId
            ? `https://api.salla.dev/admin/v2/reviews?products=${productId}&per_page=50`
            : `https://api.salla.dev/admin/v2/reviews?per_page=50`;

        const sallaResponse = await fetch(apiUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        });

        if (!sallaResponse.ok) {
            return res.status(sallaResponse.status).json({
                error: `Salla API error: ${sallaResponse.status}`,
                statusText: sallaResponse.statusText,
            });
        }

        const data = await sallaResponse.json();

        return res.status(200).json({
            storeUid,
            productId: productId || 'all',
            apiUrl,
            reviewCount: data.data?.length || 0,
            reviews: data.data?.map((r: Record<string, unknown>) => ({
                id: r.id,
                order_id: r.order_id,
                product: r.product,
                rating: r.rating,
                type: r.type,
                content: r.content,
            })) || [],
            pagination: data.pagination,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: message });
    }
}
