/**
 * Order service
 * @module server/services/order.service
 */

import { RepositoryFactory } from '../repositories';
import type { Order } from '../core/types';

export interface OrderDTO {
    id: string;
    orderId: string;
    name: string;
    phone: string;
    email: string;
    createdAt: number;
    sent: boolean;
}

export interface CreateOrderInput {
    orderId: string;
    storeUid: string;
    productId: string;
    customer?: {
        name?: string;
        phone?: string;
        email?: string;
    };
}

export class OrderService {
    private orderRepo = RepositoryFactory.getOrderRepository();
    private tokenRepo = RepositoryFactory.getReviewTokenRepository();
    private storeRepo = RepositoryFactory.getStoreRepository();

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
                name: String(x.name || ''),
                phone: String(x.phone || ''),
                email: String(x.email || ''),
                createdAt: Number.isFinite(created) ? created : Date.now(),
                sent: !!x.reviewSent,
            };
        });

        const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

        return {
            orders,
            pagination: { hasMore, nextCursor, limit },
        };
    }

    /**
     * Create order manually
     */
    async createOrder(
        userUid: string,
        input: CreateOrderInput
    ): Promise<{ ok: boolean; id?: string; error?: string }> {
        const { orderId, storeUid, productId, customer } = input;

        if (!orderId || !storeUid || !productId) {
            return { ok: false, error: 'MISSING_FIELDS' };
        }

        // Check store ownership
        const store = await this.storeRepo.findById(storeUid);
        if (!store) {
            return { ok: false, error: 'STORE_NOT_FOUND' };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storeData = store as any;
        const ownerUids: string[] = Array.isArray(storeData.ownerUids) ? storeData.ownerUids : [];
        const isOwner = storeUid === userUid || ownerUids.includes(userUid);
        if (!isOwner) {
            return { ok: false, error: 'NOT_STORE_OWNER' };
        }

        // Create order document
        const orderDoc = {
            orderId: String(orderId),
            storeUid: String(storeUid),
            storeName: String(storeData.name || storeData.storeName || 'متجرك'),
            productId: String(productId),
            name: customer?.name ?? null,
            phone: customer?.phone ?? null,
            email: customer?.email ?? null,
            status: 'created',
            reviewSent: false,
            reviewLink: null,
            reviewTokenId: null,
            createdAt: Date.now(),
        };

        // Save to orders collection
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();
        const batch = db.batch();
        const storeRef = db.collection('stores').doc(storeUid);
        const nestedRef = storeRef.collection('orders').doc(orderId);
        const rootRef = db.collection('orders').doc(orderId);
        batch.set(nestedRef, orderDoc, { merge: true });
        batch.set(rootRef, orderDoc, { merge: true });
        await batch.commit();

        return { ok: true, id: orderId };
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

    /**
     * Import orders from CSV records
     */
    async importFromCsv(
        storeId: string,
        records: Array<{
            name: string;
            phone: string;
            email?: string;
            orderId: string;
            productId: string;
            storeName: string;
        }>
    ): Promise<{ inserted: number; skipped: number; total: number }> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        let inserted = 0;
        let skipped = 0;

        for (const raw of records) {
            const name = String(raw.name ?? '').trim();
            const phone = String(raw.phone ?? '').trim();
            const email = raw.email ? String(raw.email).trim() : undefined;
            const orderId = String(raw.orderId ?? '').trim();
            const productId = String(raw.productId ?? '').trim();
            const storeName = String(raw.storeName ?? '').trim();

            if (!name || !phone || !orderId || !productId || !storeName) {
                skipped++;
                continue;
            }

            await db.collection('orders').add({
                name,
                phone,
                email: email || null,
                orderId,
                productId,
                storeName,
                storeId: storeId ?? null,
                sent: false,
                createdAt: new Date().toISOString(),
            });

            inserted++;
        }

        return { inserted, skipped, total: records.length };
    }
}

