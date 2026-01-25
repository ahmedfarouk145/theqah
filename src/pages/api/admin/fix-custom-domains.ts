// src/pages/api/admin/fix-custom-domains.ts
// Add custom domain mappings - can be called with body or uses defaults
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow POST with admin auth
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Simple auth check - use CRON_SECRET
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = dbAdmin();
    const domainsCollection = db.collection('domains');

    // Accept custom domains from request body OR use defaults
    // Body format: { mappings: [{ customDomain: "example.com", storeUid: "salla:123" }] }
    const bodyMappings = req.body?.mappings as Array<{ customDomain: string; storeUid: string }> | undefined;

    const customDomainMappings: Array<{ customDomain: string; storeUid: string }> = bodyMappings?.length
        ? bodyMappings
        : [
            { customDomain: 'pointstylishes.com', storeUid: 'salla:1900960657' },
            // Add more defaults as needed
        ];

    const results: Array<{ domain: string; storeUid: string; status: string }> = [];

    for (const mapping of customDomainMappings) {
        const { customDomain, storeUid } = mapping;

        if (!customDomain || !storeUid) {
            results.push({ domain: customDomain || 'missing', storeUid: storeUid || 'missing', status: 'skipped: invalid' });
            continue;
        }

        // Clean the domain
        const cleanDomain = customDomain
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '')
            .toLowerCase();

        // Skip Salla domains
        if (cleanDomain.includes('salla.sa') || cleanDomain.includes('salla.dev')) {
            results.push({ domain: customDomain, storeUid, status: 'skipped: salla domain' });
            continue;
        }

        // Generate variations
        const variations = [cleanDomain];
        if (cleanDomain.startsWith('www.')) {
            variations.push(cleanDomain.substring(4));
        } else {
            variations.push(`www.${cleanDomain}`);
        }

        const batch = db.batch();
        for (const domain of variations) {
            const key = domain.replace(/\//g, '_').replace(/\./g, '_').toLowerCase();
            batch.set(domainsCollection.doc(key), {
                base: domain,
                key,
                uid: storeUid,
                storeUid,
                provider: 'salla',
                isCustomDomain: true,
                updatedAt: Date.now(),
            }, { merge: true });
        }

        try {
            await batch.commit();
            results.push({ domain: customDomain, storeUid, status: 'added' });
        } catch (err) {
            results.push({
                domain: customDomain,
                storeUid,
                status: `error: ${err instanceof Error ? err.message : String(err)}`
            });
        }
    }

    return res.status(200).json({
        success: true,
        message: 'Custom domains processed',
        results
    });
}

