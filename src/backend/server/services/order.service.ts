/**
 * Order service
 * @module server/services/order.service
 */

import { RepositoryFactory } from '../repositories';
import type { Order } from '../core/types';

export interface OrderDTO {
    id: string;
    orderId: string;
    productId: string;
    status: string;
    createdAt: number;
}

export class OrderService {
    private orderRepo = RepositoryFactory.getOrderRepository();

    /**
     * Get order by ID
     */
    async getOrder(orderId: string): Promise<Order | null> {
        return this.orderRepo.findById(orderId);
    }

    /**
     * Get orders for a store
     */
    async getOrdersByStore(storeUid: string): Promise<Order[]> {
        return this.orderRepo.findByStoreUid(storeUid);
    }

    /**
     * List orders with pagination
     */
    async listWithPagination(
        storeUid: string,
        options: { limit?: number; cursor?: string }
    ): Promise<{
        orders: OrderDTO[];
        pagination: { hasMore: boolean; nextCursor: string | null; limit: number };
    }> {
        const { limit = 50, cursor } = options;

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = db.collection('orders')
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .limit(limit + 1);

        if (cursor) {
            const cursorDoc = await db.collection('orders').doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snap = await query.get();
        const hasMore = snap.docs.length > limit;
        const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;

        const orders: OrderDTO[] = docs.map((d: FirebaseFirestore.DocumentSnapshot) => {
            const x = d.data() as Record<string, unknown>;
            const rawCreatedAt = x.createdAt;
            const created = typeof rawCreatedAt === 'number'
                ? rawCreatedAt
                : (typeof rawCreatedAt === 'string' ? Date.parse(rawCreatedAt) : Date.now());
            return {
                id: d.id,
                orderId: String(x.orderId || d.id),
                productId: String(x.productId || ''),
                status: String(x.status || 'unknown'),
                createdAt: Number.isFinite(created) ? created : Date.now(),
            };
        });

        const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

        return {
            orders,
            pagination: { hasMore, nextCursor, limit },
        };
    }

    /**
     * Upsert order snapshot
     */
    async upsertSnapshot(
        orderId: string,
        data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<void> {
        await this.orderRepo.upsertSnapshot(orderId, data);
    }

    /**
     * Update order status
     */
    async updateStatus(orderId: string, status: string, paymentStatus?: string): Promise<void> {
        await this.orderRepo.updateStatus(orderId, status, paymentStatus);
    }

}

