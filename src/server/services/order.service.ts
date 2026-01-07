/**
 * Order service
 * @module server/services/order.service
 */

import { RepositoryFactory } from '../repositories';
import type { Order } from '../core/types';

export class OrderService {
    private orderRepo = RepositoryFactory.getOrderRepository();
    private tokenRepo = RepositoryFactory.getReviewTokenRepository();

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

    /**
     * Handle order cancellation - void tokens
     */
    async handleCancellation(orderId: string): Promise<number> {
        return this.tokenRepo.voidByOrderId(orderId, 'order_cancelled');
    }

    /**
     * Handle order refund - void tokens
     */
    async handleRefund(orderId: string): Promise<number> {
        return this.tokenRepo.voidByOrderId(orderId, 'order_refunded');
    }
}
