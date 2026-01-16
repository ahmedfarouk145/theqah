/**
 * Salla Token Service - handles OAuth token refresh
 * @module server/services/salla-token.service
 */

import { RepositoryFactory } from '../repositories';
import { log } from '@/lib/logger';

const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

export interface TokenRefreshResult {
    success: boolean;
    accessToken?: string;
    expiresAt?: number;
    error?: string;
}

export class SallaTokenService {
    private static instance: SallaTokenService;

    private constructor() { }

    static getInstance(): SallaTokenService {
        if (!SallaTokenService.instance) {
            SallaTokenService.instance = new SallaTokenService();
        }
        return SallaTokenService.instance;
    }

    /**
     * Get a valid access token, refreshing if needed
     */
    async getValidAccessToken(storeUid: string): Promise<string | null> {
        const ownerRepo = RepositoryFactory.getOwnerRepository();
        const owner = await ownerRepo.findById(storeUid);

        if (!owner?.oauth?.access_token) {
            log('warn', `No OAuth token found for ${storeUid}`, { scope: 'token' });
            return null;
        }

        const { access_token, refresh_token, expires } = owner.oauth;

        // Check if token needs refresh
        if (expires && this.isExpiredOrExpiring(expires)) {
            if (!refresh_token) {
                log('warn', `Token expired but no refresh_token for ${storeUid}`, { scope: 'token' });
                return null;
            }

            const result = await this.refreshToken(storeUid, refresh_token);
            if (result.success && result.accessToken) {
                return result.accessToken;
            }

            log('error', `Token refresh failed for ${storeUid}: ${result.error}`, { scope: 'token' });
            return null;
        }

        return access_token;
    }

    /**
     * Check if token is expired or about to expire
     */
    private isExpiredOrExpiring(expiresTimestamp: number): boolean {
        // Handle both seconds and milliseconds timestamps
        const expiresMs = expiresTimestamp < 1e12 ? expiresTimestamp * 1000 : expiresTimestamp;
        return Date.now() + REFRESH_BUFFER_MS >= expiresMs;
    }

    /**
     * Refresh the OAuth token
     */
    async refreshToken(storeUid: string, refreshToken: string): Promise<TokenRefreshResult> {
        const clientId = process.env.SALLA_CLIENT_ID;
        const clientSecret = process.env.SALLA_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return { success: false, error: 'Missing SALLA_CLIENT_ID or SALLA_CLIENT_SECRET' };
        }

        try {
            log('info', `Refreshing token for ${storeUid}`, { scope: 'token' });

            const response = await fetch(SALLA_TOKEN_URL, {
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
                refresh_token?: string;
                expires_in?: number;
                error?: string;
                error_description?: string;
            };

            if (!response.ok) {
                const errorMsg = data.error_description || data.error || `HTTP ${response.status}`;
                log('error', `Salla token refresh HTTP error for ${storeUid}: ${errorMsg}`, { scope: 'token' });
                return { success: false, error: errorMsg };
            }

            if (!data.access_token) {
                return { success: false, error: 'No access_token in response' };
            }

            // Calculate new expiry (Salla returns expires_in in seconds)
            const expiresIn = data.expires_in || 1209600; // Default 14 days
            const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

            // Save new token
            const ownerRepo = RepositoryFactory.getOwnerRepository();
            const owner = await ownerRepo.findById(storeUid);

            if (owner) {
                await ownerRepo.saveOAuth(storeUid, owner.provider || 'salla', {
                    access_token: data.access_token,
                    refresh_token: data.refresh_token || refreshToken,
                    scope: owner.oauth?.scope,
                    expires: expiresAt,
                    strategy: owner.oauth?.strategy,
                });
            }

            log('info', `Token refreshed for ${storeUid}, expires at ${new Date(expiresAt * 1000).toISOString()}`, { scope: 'token' });

            return {
                success: true,
                accessToken: data.access_token,
                expiresAt: expiresAt * 1000,
            };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            log('error', `Token refresh exception for ${storeUid}: ${errorMsg}`, { scope: 'token' });
            return { success: false, error: errorMsg };
        }
    }
}

// Export singleton
export const sallaTokenService = SallaTokenService.getInstance();
