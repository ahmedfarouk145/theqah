/**
 * Zid Webhook Service - handles all Zid webhook events
 * SRP: Only responsible for processing Zid webhook events
 * DIP: Uses RepositoryFactory and other services via dependency injection
 * @module server/services/zid-webhook.service
 */

import crypto from 'crypto';

/** Zid order from webhook — supports both nested (API) and flat (webhook) formats */
export interface ZidOrder {
    id?: string | number;
    number?: string;
    code?: string;                    // ZID webhook uses "code" as order number
    invoice_number?: string;          // Alternative order number field
    status?: string;
    order_status?: string;            // ZID webhook uses "order_status"
    payment_status?: string;
    customer?: {
        name?: string;
        email?: string;
        mobile?: string;
    };
    items?: Array<{
        id?: string | number;
        product_id?: string | number;
        name?: string;
        quantity?: number;
        price?: number;
    }>;
    products?: Array<{               // ZID webhook uses "products" not "items"
        id?: string | number;
        product_id?: string | number;
        name?: string;
        quantity?: number;
        price?: number;
    }>;
    total?: number;
    order_total?: number;             // ZID webhook uses "order_total"
    currency?: string;
    currency_code?: string;           // ZID webhook uses "currency_code"
}

/** Zid store info from API */
export interface ZidStoreInfo {
    id?: string;
    name?: string;
    email?: string;
    domain?: string;
    mobile?: string;
}

export class ZidWebhookService {

    /**
     * Handle app authorized event - auto-create store + Firebase user + send password email
     * This is the Zid-first onboarding flow
     */
    async handleAppAuthorize(
        zidStoreId: string,
        storeInfo: ZidStoreInfo,
        tokens: { access_token: string; authorization: string; refresh_token?: string; expires_in?: number }
    ): Promise<{ storeUid: string; isNew: boolean }> {
        const storeUid = `zid:${zidStoreId}`;
        const email = storeInfo.email?.toLowerCase() || '';
        const storeName = storeInfo.name || `Zid Store ${zidStoreId}`;
        const domain = storeInfo.domain || '';

        const { dbAdmin, authAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();
        const auth = authAdmin();

        // Check if store already exists
        const existingStore = await db.collection('stores').doc(storeUid).get();
        const isNew = !existingStore.exists;

        if (isNew && email) {
            // Auto-create Firebase user
            try {
                let firebaseUser;
                try {
                    firebaseUser = await auth.getUserByEmail(email);
                    console.log(`[ZID_WEBHOOK] Firebase user already exists for ${email}: ${firebaseUser.uid}`);
                } catch {
                    // User doesn't exist, create one
                    const tempPassword = crypto.randomBytes(16).toString('hex');
                    firebaseUser = await auth.createUser({
                        email,
                        password: tempPassword,
                        displayName: storeName,
                    });
                    console.log(`[ZID_WEBHOOK] Created Firebase user for ${email}: ${firebaseUser.uid}`);

                    // Send password setup email
                    try {
                        const { sendPasswordSetupEmail } = await import('@/server/auth/send-password-email');
                        await sendPasswordSetupEmail({
                            email,
                            storeUid,
                            storeName,
                            redirectUrlBase: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || ''
                        });
                        console.log(`[ZID_WEBHOOK] ✅ Password setup email sent to ${email}`);
                    } catch (emailErr) {
                        console.error(`[ZID_WEBHOOK] ⚠️ Failed to send password email:`, emailErr);
                    }
                }

                // Link Firebase UID to store
                await db.collection('stores').doc(storeUid).set(
                    {
                        ownerUid: firebaseUser.uid,
                    },
                    { merge: true }
                );
            } catch (authErr) {
                console.error(`[ZID_WEBHOOK] ⚠️ Failed to create Firebase user:`, authErr);
            }
        }

        // Save/update store data
        await db.collection('stores').doc(storeUid).set(
            {
                uid: storeUid,
                provider: 'zid',
                name: storeName,
                merchantEmail: email,
                zid: {
                    storeId: zidStoreId,
                    connected: true,
                    installed: true,
                    domain: domain || null,
                },
                registrationMethod: isNew ? 'zid_app_market' : undefined,
                registeredAt: isNew ? Date.now() : undefined,
                updatedAt: Date.now(),
            },
            { merge: true }
        );

        // Save domain mapping
        if (domain) {
            await this.saveDomain(storeUid, domain);
        }

        // Save tokens
        const { ZidTokenService } = await import('./zid-token.service');
        const tokenService = ZidTokenService.getInstance();
        await tokenService.saveTokens(zidStoreId, {
            access_token: tokens.access_token,
            authorization: tokens.authorization,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            expires_at: tokens.expires_in
                ? Date.now() + (tokens.expires_in * 1000)
                : undefined,
        });

        // Log registration
        if (isNew) {
            await db.collection('registration_logs').add({
                method: 'zid_app_market',
                storeUid,
                merchantEmail: email,
                storeName,
                zidStoreId,
                success: true,
                timestamp: Date.now(),
            });
        }

        console.log(`[ZID_WEBHOOK] ${isNew ? '🎉 New' : '🔄 Existing'} store authorized: ${storeUid}`);
        return { storeUid, isNew };
    }

    /**
     * Handle app installed event
     */
    async handleAppInstalled(storeUid: string): Promise<void> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        await db.collection('stores').doc(storeUid).set(
            {
                zid: { installed: true },
                updatedAt: Date.now(),
            },
            { merge: true }
        );

        console.log(`[ZID_WEBHOOK] App installed for ${storeUid}`);
    }

    /**
     * Handle app uninstalled event
     */
    async handleAppUninstalled(storeUid: string): Promise<void> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        await db.collection('stores').doc(storeUid).set(
            {
                zid: { installed: false, connected: false },
                updatedAt: Date.now(),
            },
            { merge: true }
        );

        console.log(`[ZID_WEBHOOK] App uninstalled for ${storeUid}`);
    }

    /**
     * Handle subscription active event
     */
    async handleSubscriptionActive(storeUid: string, raw?: object): Promise<void> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        await db.collection('stores').doc(storeUid).set(
            {
                subscription: {
                    syncedAt: Date.now(),
                    startedAt: Date.now(),
                    raw: raw || null,
                    updatedAt: Date.now(),
                },
                plan: {
                    active: true,
                    updatedAt: Date.now(),
                },
                updatedAt: Date.now(),
            },
            { merge: true }
        );

        console.log(`[ZID_WEBHOOK] Subscription active for ${storeUid}`);
    }

    /**
     * Handle subscription suspended/expired event
     */
    async handleSubscriptionExpired(storeUid: string, raw?: object): Promise<void> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        await db.collection('stores').doc(storeUid).set(
            {
                subscription: {
                    expiredAt: Date.now(),
                    raw: raw || null,
                    updatedAt: Date.now(),
                },
                plan: {
                    active: false,
                    expiredAt: Date.now(),
                    updatedAt: Date.now(),
                },
                updatedAt: Date.now(),
            },
            { merge: true }
        );

        console.log(`[ZID_WEBHOOK] Subscription expired for ${storeUid}`);
    }

    /**
     * Handle order created - save order snapshot with product IDs for review polling
     */
    async handleOrderCreated(order: ZidOrder, storeUid: string): Promise<void> {
        const orderId = String(order.id ?? '');
        if (!orderId) return;

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // ZID webhook sends "products" not "items"
        const itemsList = order.items || order.products || [];
        const productIds = itemsList
            .map(item => String(item.product_id ?? item.id ?? ''))
            .filter(Boolean);

        // ZID webhook uses different field names than the API
        const orderNumber = order.number ?? order.code ?? order.invoice_number ?? null;
        const orderStatus = order.status ?? order.order_status ?? null;
        const orderTotal = order.total ?? order.order_total ?? null;
        const currency = order.currency ?? order.currency_code ?? null;

        await db.collection('orders').doc(`zid_${orderId}`).set(
            {
                id: orderId,
                number: orderNumber,
                status: orderStatus,
                paymentStatus: order.payment_status ?? null,
                items: itemsList.map(item => ({
                    productId: String(item.product_id ?? item.id ?? ''),
                })),
                productIds,
                storeUid,
                platform: 'zid',
                total: orderTotal,
                currency,
                reviewChecked: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
            { merge: true }
        );

        console.log(`[ZID_WEBHOOK] Order created: ${orderId} (${productIds.length} products) number=${orderNumber}`);
    }

    /**
     * Handle order status update
     */
    async handleOrderStatusUpdate(orderId: string, newStatus: string): Promise<void> {
        if (!orderId) return;

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        await db.collection('orders').doc(`zid_${orderId}`).set(
            {
                status: newStatus,
                updatedAt: Date.now(),
            },
            { merge: true }
        );

        console.log(`[ZID_WEBHOOK] Order ${orderId} status updated to: ${newStatus}`);
    }

    /**
     * Save domain mapping for widget resolution
     */
    async saveDomain(storeUid: string, domain: string): Promise<void> {
        if (!domain) return;

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Clean domain
        const cleanDomain = domain
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '')
            .toLowerCase();

        if (!cleanDomain) return;

        await db.collection('domains').doc(cleanDomain).set(
            {
                storeUid,
                domain: cleanDomain,
                platform: 'zid',
                provider: 'zid',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
            { merge: true }
        );

        console.log(`[ZID_WEBHOOK] Domain saved: ${cleanDomain} → ${storeUid}`);
    }

    /**
     * Log webhook event for audit trail
     */
    async logEvent(
        event: string,
        storeUid: string,
        type: string,
        meta?: Record<string, unknown>
    ): Promise<void> {
        try {
            const { dbAdmin } = await import('@/lib/firebaseAdmin');
            const db = dbAdmin();

            await db.collection('webhook_logs').add({
                platform: 'zid',
                event,
                storeUid,
                type,
                meta: meta || {},
                timestamp: Date.now(),
            });
        } catch (err) {
            // Fire-and-forget — don't fail the webhook for logging
            console.error(`[ZID_WEBHOOK] Failed to log event:`, err);
        }
    }

    /**
     * Register webhook subscriptions for a merchant store via Zid API
     * Called after OAuth — Zid requires per-merchant webhook registration
     * Endpoint: POST /v1/managers/webhooks
     */
    async registerWebhooks(
        tokens: { access_token: string; authorization: string },
        targetUrl: string
    ): Promise<{ registered: string[]; failed: string[] }> {
        const ZID_API_URL = process.env.ZID_API_URL || 'https://api.zid.sa/v1';

        console.log(`[ZID_WEBHOOK_REG] ▶ Starting webhook registration`);
        console.log(`[ZID_WEBHOOK_REG] Target URL: ${targetUrl}`);
        console.log(`[ZID_WEBHOOK_REG] API URL: ${ZID_API_URL}`);
        console.log(`[ZID_WEBHOOK_REG] Tokens: access_token=${tokens.access_token ? `${tokens.access_token.substring(0, 10)}...` : 'MISSING'}, authorization=${tokens.authorization ? `${tokens.authorization.substring(0, 10)}...` : 'MISSING'}`);

        const eventsToRegister = [
            'order.create',
            'order.status.update',
            'order.payment_status.update',
        ];

        const registered: string[] = [];
        const failed: string[] = [];

        for (const event of eventsToRegister) {
            try {
                // original_id is required by ZID API — must be the App ID or MD5 of App ID
                const appId = process.env.ZID_CLIENT_ID || '';
                const reqBody = JSON.stringify({
                    event,
                    target_url: targetUrl,
                    original_id: appId,
                    conditions: {},
                });
                console.log(`[ZID_WEBHOOK_REG] Registering: ${event} → ${targetUrl}`);

                const response = await fetch(`${ZID_API_URL}/managers/webhooks`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${tokens.authorization}`,
                        'X-Manager-Token': tokens.access_token,
                        'Accept': 'application/json',
                        'Accept-Language': 'en',
                        'Content-Type': 'application/json',
                    },
                    body: reqBody,
                });

                if (response.ok) {
                    const responseBody = await response.text();
                    registered.push(event);
                    console.log(`[ZID_WEBHOOK_REG] ✅ Registered: ${event} (HTTP ${response.status}) — ${responseBody.substring(0, 200)}`);
                } else {
                    const errorBody = await response.text();
                    console.error(`[ZID_WEBHOOK_REG] ❌ HTTP ${response.status} for ${event}: ${errorBody}`);
                    // 409/422 = already registered — treat as success
                    if (response.status === 409 || response.status === 422) {
                        registered.push(event);
                        console.log(`[ZID_WEBHOOK_REG] ↳ Treating as already registered (${response.status})`);
                    } else {
                        failed.push(event);
                    }
                }
            } catch (err) {
                failed.push(event);
                console.error(`[ZID_WEBHOOK_REG] ❌ Exception for ${event}:`, err instanceof Error ? err.message : err);
            }
        }

        console.log(`[ZID_WEBHOOK_REG] 📊 Result: ${registered.length} registered [${registered.join(', ')}], ${failed.length} failed [${failed.join(', ')}]`);
        return { registered, failed };
    }
}

