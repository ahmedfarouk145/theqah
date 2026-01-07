/**
 * Salla webhook service - handles all Salla webhook events
 * @module server/services/salla-webhook.service
 */

import { RepositoryFactory } from '../repositories';
import type { Review } from '../core/types';

export interface SallaOrder {
    id?: string | number;
    reference_id?: string;
    order_id?: string;
    number?: string;
    status?: string;
    order_status?: string;
    new_status?: string;
    shipment_status?: string;
    payment_status?: string;
    customer?: {
        name?: string;
        email?: string;
        mobile?: string;
    };
    items?: Array<{ product_id?: string | number }>;
}

export interface SallaReviewPayload {
    id?: string | number;
    type?: string;
    content?: string;
    rating?: number;
    product?: {
        id?: string | number;
        name?: string;
    };
    order?: {
        id?: string | number;
        order_id?: string | number;
        reference_id?: string;
        date?: { date?: string };
    };
    customer?: {
        name?: string;
        email?: string;
        mobile?: string;
    };
}

export class SallaWebhookService {
    private reviewRepo = RepositoryFactory.getReviewRepository();
    private storeRepo = RepositoryFactory.getStoreRepository();
    private orderRepo = RepositoryFactory.getOrderRepository();
    private ownerRepo = RepositoryFactory.getOwnerRepository();
    private tokenRepo = RepositoryFactory.getReviewTokenRepository();
    private domainRepo = RepositoryFactory.getDomainRepository();

    /**
     * Handle app.store.authorize event
     */
    async handleAppAuthorize(
        storeUid: string,
        accessToken: string,
        refreshToken?: string,
        scope?: string,
        expires?: number
    ): Promise<void> {
        await this.ownerRepo.saveOAuth(storeUid, 'salla', {
            access_token: accessToken,
            refresh_token: refreshToken,
            scope,
            expires,
            strategy: 'easy_mode',
        });
    }

    /**
     * Handle subscription started/renewed events
     */
    async handleSubscriptionEvent(
        storeUid: string,
        planId: string,
        startedAt: number,
        rawPayload?: object
    ): Promise<void> {
        await this.storeRepo.updateSubscription(storeUid, planId, startedAt, rawPayload);
    }

    /**
     * Handle subscription expired/cancelled events
     */
    async handleSubscriptionExpired(storeUid: string, rawPayload?: object): Promise<void> {
        await this.storeRepo.deactivateSubscription(storeUid, rawPayload);
    }

    /**
     * Handle trial started event
     */
    async handleTrialStarted(storeUid: string, startedAt: number, rawPayload?: object): Promise<void> {
        await this.storeRepo.updateSubscription(storeUid, 'TRIAL', startedAt, rawPayload);
    }

    /**
     * Handle order.created - save order snapshot
     */
    async handleOrderCreated(order: SallaOrder, storeUid: string): Promise<void> {
        const orderId = String(order.reference_id ?? order.id ?? order.order_id ?? '');
        if (!orderId) return;

        await this.orderRepo.upsertSnapshot(orderId, {
            number: order.number || null,
            status: (order.status ?? order.order_status ?? '').toLowerCase(),
            paymentStatus: (order.payment_status ?? '').toLowerCase(),
            customer: {
                name: order.customer?.name || null,
                email: order.customer?.email || null,
                mobile: order.customer?.mobile || null,
            },
            storeUid,
            platform: 'salla',
        });
    }

    /**
     * Handle order.cancelled/refunded - void tokens
     */
    async handleOrderCancelled(orderId: string, reason: string): Promise<number> {
        return this.tokenRepo.voidByOrderId(orderId, reason);
    }

    /**
     * Handle review.added - save review from webhook
     */
    async handleReviewAdded(
        storeUid: string,
        merchantId: string,
        payload: SallaReviewPayload,
        subscriptionStart: number
    ): Promise<{ saved: boolean; docId?: string; skipped?: string }> {
        const product = payload.product;
        const order = payload.order;
        const customer = payload.customer;
        const reviewType = String(payload.type || '');

        // Skip testimonials (store reviews)
        if (reviewType === 'testimonial' || !product) {
            return { saved: false, skipped: 'testimonial_or_no_product' };
        }

        const productId = String(product.id || '');
        const sallaOrderId = String(order?.id || order?.order_id || '');
        const sallaReferenceId = String(order?.reference_id || '');
        const orderId = sallaOrderId || sallaReferenceId;

        if (!productId || !orderId) {
            return { saved: false, skipped: 'missing_product_or_order_id' };
        }

        // Check if already exists
        const existing = await this.reviewRepo.findByOrderAndProduct(orderId, productId);
        if (existing) {
            return { saved: false, skipped: 'already_exists' };
        }

        // Determine if verified
        const orderDate = order?.date?.date
            ? new Date(order.date.date).getTime()
            : Date.now();
        const isVerified = subscriptionStart > 0 && orderDate >= subscriptionStart;

        // Create doc ID
        const docId = `salla_${merchantId}_order_${orderId}_product_${productId}`;

        const reviewDoc: Omit<Review, 'id' | 'createdAt'> = {
            reviewId: docId,
            storeUid,
            orderId: String(orderId),
            orderNumber: sallaReferenceId || String(orderId),
            productId: String(productId),
            productName: String(product.name || ''),
            source: 'salla_native',
            stars: Number(payload.rating || 0),
            text: String(payload.content || ''),
            author: {
                displayName: String(customer?.name || 'عميل سلة'),
                email: String(customer?.email || ''),
                mobile: String(customer?.mobile || ''),
            },
            status: 'approved', // Will be overridden by moderation
            trustedBuyer: false,
            verified: isVerified,
            publishedAt: orderDate,
            needsSallaId: true,
            updatedAt: Date.now(),
        };

        await this.reviewRepo.createWithId(docId, reviewDoc);

        return { saved: true, docId };
    }

    /**
     * Backfill Salla review ID (called by cron)
     */
    async backfillReviewId(reviewId: string, sallaReviewId: string): Promise<boolean> {
        try {
            await this.reviewRepo.updateSallaId(reviewId, sallaReviewId);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get reviews needing Salla ID backfill
     */
    async getReviewsNeedingBackfill(limit: number = 50): Promise<Review[]> {
        return this.reviewRepo.findNeedingSallaId(limit);
    }

    /**
     * Save domain mapping
     */
    async saveDomain(storeUid: string, domain: string): Promise<void> {
        const key = domain
            .replace(/^https?:\/\//, '')
            .replace(/\//g, '_')
            .replace(/\./g, '_')
            .toLowerCase();

        await this.storeRepo.updateDomain(storeUid, domain, key);
        await this.domainRepo.saveDomainVariations(domain, storeUid);
    }
}
