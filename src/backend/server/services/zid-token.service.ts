/**
 * Zid Token Service - handles Zid OAuth token lifecycle
 * SRP: Only responsible for token storage, retrieval, and refresh
 * DIP: Uses RepositoryFactory abstractions for data access
 * @module server/services/zid-token.service
 */

import { log } from '@/lib/logger';

const ZID_TOKEN_URL = process.env.ZID_TOKEN_URL || 'https://oauth.zid.sa/oauth/token';
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

/** Zid returns dual tokens: access_token (X-Manager-Token) + authorization (Authorization header) */
export interface ZidTokens {
    access_token: string;
    authorization: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    expires_at?: number;   // millis
    scope?: string;
}

export interface ZidTokenRefreshResult {
    success: boolean;
    tokens?: ZidTokens;
    error?: string;
}

export class ZidTokenService {
    private static instance: ZidTokenService;

    private constructor() { }

    static getInstance(): ZidTokenService {
        if (!ZidTokenService.instance) {
            ZidTokenService.instance = new ZidTokenService();
        }
        return ZidTokenService.instance;
    }

    /**
     * Get valid tokens for a Zid store, refreshing if needed
     */
    async getValidTokens(storeId: string): Promise<ZidTokens | null> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const doc = await db.collection('zid_tokens').doc(storeId).get();
        const tokens = doc.data() as ZidTokens | undefined;

        if (!tokens?.access_token) {
            log('warn', `[ZID_TOKEN] No tokens found for store ${storeId}`, { scope: 'zid' });
            return null;
        }

        // Check if token needs refresh
        if (tokens.expires_at && this.isExpiredOrExpiring(tokens.expires_at)) {
            if (!tokens.refresh_token) {
                log('warn', `[ZID_TOKEN] Token expired but no refresh_token for store ${storeId}`, { scope: 'zid' });
                return null;
            }

            const result = await this.refreshToken(storeId, tokens.refresh_token);
            if (result.success && result.tokens) {
                return result.tokens;
            }

            log('error', `[ZID_TOKEN] Token refresh failed for store ${storeId}: ${result.error}`, { scope: 'zid' });
            return null;
        }

        return tokens;
    }

    /**
     * Save tokens for a Zid store
     */
    async saveTokens(storeId: string, tokens: ZidTokens): Promise<void> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Calculate expiry if not set
        if (!tokens.expires_at && tokens.expires_in) {
            tokens.expires_at = Date.now() + (tokens.expires_in * 1000);
        }

        await db.collection('zid_tokens').doc(storeId).set(
            {
                ...tokens,
                updatedAt: Date.now(),
            },
            { merge: true }
        );

        log('info', `[ZID_TOKEN] Tokens saved for store ${storeId}`, { scope: 'zid' });
    }

    /**
     * Delete tokens for a Zid store (disconnect)
     */
    async deleteTokens(storeId: string): Promise<void> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        await db.collection('zid_tokens').doc(storeId).delete();
        log('info', `[ZID_TOKEN] Tokens deleted for store ${storeId}`, { scope: 'zid' });
    }

    /**
     * Refresh the Zid OAuth token
     */
    async refreshToken(storeId: string, refreshToken: string): Promise<ZidTokenRefreshResult> {
        const clientId = process.env.ZID_CLIENT_ID;
        const clientSecret = process.env.ZID_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return { success: false, error: 'Missing ZID_CLIENT_ID or ZID_CLIENT_SECRET' };
        }

        try {
            log('info', `[ZID_TOKEN] Refreshing token for store ${storeId}`, { scope: 'zid' });

            const response = await fetch(ZID_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                }).toString(),
            });

            const data = await response.json() as {
                access_token?: string;
                authorization?: string;
                refresh_token?: string;
                token_type?: string;
                expires_in?: number;
                error?: string;
                error_description?: string;
            };

            if (!response.ok) {
                const errorMsg = data.error_description || data.error || `HTTP ${response.status}`;
                log('error', `[ZID_TOKEN] Refresh HTTP error for store ${storeId}: ${errorMsg}`, { scope: 'zid' });
                return { success: false, error: errorMsg };
            }

            if (!data.access_token) {
                return { success: false, error: 'No access_token in response' };
            }

            // Zid tokens expire in ~1 year, default to 365 days
            const expiresIn = data.expires_in || 31536000;
            const expiresAt = Date.now() + (expiresIn * 1000);

            const newTokens: ZidTokens = {
                access_token: data.access_token,
                authorization: data.authorization || '',
                refresh_token: data.refresh_token || refreshToken,
                token_type: data.token_type,
                expires_in: expiresIn,
                expires_at: expiresAt,
            };

            // Persist refreshed tokens
            await this.saveTokens(storeId, newTokens);

            log('info', `[ZID_TOKEN] Token refreshed for store ${storeId}, expires at ${new Date(expiresAt).toISOString()}`, { scope: 'zid' });

            return { success: true, tokens: newTokens };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            log('error', `[ZID_TOKEN] Refresh exception for store ${storeId}: ${errorMsg}`, { scope: 'zid' });
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Check if token is expired or about to expire
     */
    private isExpiredOrExpiring(expiresAt: number): boolean {
        // Handle both seconds and milliseconds timestamps
        const expiresMs = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
        return Date.now() + REFRESH_BUFFER_MS >= expiresMs;
    }
}

// Export singleton
export const zidTokenService = ZidTokenService.getInstance();
