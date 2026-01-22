// src/pages/api/orders/export.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/server/auth/requireUser';

/**
 * M11: Orders Export API
 * Export orders as CSV or JSON for the store
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const user = await requireUser(req);
        const storeUid = user.uid;

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Query params
        const format = (req.query.format as string) || 'json';
        const limit = Math.min(Number(req.query.limit) || 1000, 5000);
        const startDate = req.query.startDate ? Number(req.query.startDate) : undefined;
        const endDate = req.query.endDate ? Number(req.query.endDate) : undefined;

        // Build query
        let query = db.collection('orders')
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .limit(limit);

        if (startDate) {
            query = query.where('createdAt', '>=', startDate);
        }
        if (endDate) {
            query = query.where('createdAt', '<=', endDate);
        }

        const ordersSnap = await query.get();

        // Map orders
        const orders = ordersSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                orderId: data.orderId || doc.id,
                customerName: data.customerName || data.customer?.name || '',
                customerEmail: data.customerEmail || data.customer?.email || '',
                customerPhone: data.customerPhone || data.customer?.phone || '',
                status: data.status || 'unknown',
                total: data.total || 0,
                currency: data.currency || 'SAR',
                itemsCount: data.items?.length || data.itemsCount || 0,
                createdAt: formatDate(data.createdAt),
                reviewRequested: data.reviewRequested || false,
                reviewSubmitted: data.reviewSubmitted || false,
            };
        });

        // Return based on format
        if (format === 'csv') {
            const csv = convertToCSV(orders);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="orders-${storeUid}-${Date.now()}.csv"`);
            return res.status(200).send('\uFEFF' + csv); // BOM for Excel Arabic support
        }

        return res.status(200).json({
            total: orders.length,
            exportedAt: new Date().toISOString(),
            orders,
        });

    } catch (error) {
        console.error('Orders Export Error:', error);
        return res.status(500).json({ error: 'Failed to export orders' });
    }
}

function formatDate(timestamp: unknown): string {
    if (!timestamp) return '';
    try {
        if (typeof timestamp === 'number') {
            return new Date(timestamp).toISOString();
        }
        if (typeof timestamp === 'object' && 'toDate' in timestamp) {
            return (timestamp as { toDate: () => Date }).toDate().toISOString();
        }
        return String(timestamp);
    } catch {
        return '';
    }
}

function convertToCSV(data: Record<string, unknown>[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','),
        ...data.map(row =>
            headers.map(header => {
                const value = row[header];
                const stringValue = value === null || value === undefined ? '' : String(value);
                // Escape quotes and wrap in quotes if contains comma or quote
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            }).join(',')
        )
    ];

    return csvRows.join('\n');
}
