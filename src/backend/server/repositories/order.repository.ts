/**
 * Order repository
 * @module server/repositories/order.repository
 */

import { BaseRepository } from './base.repository';
import type { Order } from '../core/types';

export class OrderRepository extends BaseRepository<Order> {
    protected readonly collectionName = 'orders';

    /**
     * Find order by number
     */
    async findByNumber(orderNumber: string): Promise<Order | null> {
        return this.query()
            .where('number', '==', orderNumber)
            .getFirst();
    }

    /**
     * Find orders by store
     */
    async findByStoreUid(storeUid: string): Promise<Order[]> {
        return this.query()
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .getAll();
    }

    /**
     * Upsert order snapshot
     */
    async upsertSnapshot(
        orderId: string,
        data: {
            number?: string | null;
            status: string;
            paymentStatus: string;
            customer: { name: string | null; email: string | null; mobile: string | null };
            storeUid: string | null;
            platform: string;
        }
    ): Promise<void> {
        await this.set(orderId, {
            id: orderId,
            ...data,
        } as Order);
    }

    /**
     * Update order status
     */
    async updateStatus(orderId: string, status: string, paymentStatus?: string): Promise<void> {
        const update: Partial<Order> = { status };
        if (paymentStatus !== undefined) {
            update.paymentStatus = paymentStatus;
        }
        await this.update(orderId, update);
    }
}
