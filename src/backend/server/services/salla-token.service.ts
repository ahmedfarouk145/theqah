/**
 * Salla Token Service - handles OAuth token refresh
 * @module server/services/salla-token.service
 */

import { RepositoryFactory } from '../repositories';
import type { Owner } from '../core/types';
import { log } from '@/lib/logger';

const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
// Proactively rotate a token once it's older than this. Salla refresh tokens
// live 30 days; refreshing every ~10 days keeps the rotating refresh token far
// inside that window so idle/dormant stores never cross the expiry cliff.
const KEEPALIVE_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;

export interface TokenRefreshResult {
    success: boolean;
    accessToken?: string;
    expiresAt?: number;
    error?: string;
    /** True when the failure is a revoked/expired grant (reinstall required). */
    needsReauth?: boolean;
}

export class SallaTokenService {
    private static instance: SallaTokenService;

    /**
     * In-flight refresh promises keyed by storeUid. Salla refresh tokens are
     * single-use and rotating — two concurrent refreshes of the same store
     * reuse the same token and make Salla revoke BOTH tokens (a reinstall is
     * then required). Coalescing concurrent callers within this instance onto
     * one refresh prevents that. (Cross-instance collisions still need a
     * Firestore lease — tracked as the next increment.)
     */
    private refreshInFlight = new Map<string, Promise<TokenRefreshResult>>();

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

            const result = await this.refreshTokenCoalesced(storeUid, refresh_token);
            if (result.success && result.accessToken) {
                return result.accessToken;
            }

            log('error', `Token refresh failed for ${storeUid}: ${result.error}`, { scope: 'token' });
            return null;
        }

        return access_token;
    }

    /**
     * Coalesce concurrent refreshes of the same store onto a single in-flight
     * promise so the single-use refresh token is never used twice in parallel.
     */
    private refreshTokenCoalesced(storeUid: string, refreshToken: string): Promise<TokenRefreshResult> {
        const existing = this.refreshInFlight.get(storeUid);
        if (existing) return existing;

        const p = this.refreshToken(storeUid, refreshToken).finally(() => {
            this.refreshInFlight.delete(storeUid);
        });
        this.refreshInFlight.set(storeUid, p);
        return p;
    }

    /**
     * Whether a token should be proactively rotated to keep its (single-use,
     * 30-day) refresh token alive — true if it's past the keep-alive age or the
     * access token is near expiry. Revoked or refresh-less grants are never
     * stale (they can't be refreshed). Pure for unit testing.
     */
    isStale(oauth: Owner['oauth'], nowMs: number = Date.now()): boolean {
        if (!oauth?.refresh_token) return false;
        if (oauth.needsReauth) return false;
        const ageMs = nowMs - (oauth.receivedAt || 0);
        if (ageMs >= KEEPALIVE_MAX_AGE_MS) return true;
        if (oauth.expires && this.isExpiredOrExpiring(oauth.expires)) return true;
        return false;
    }

    /**
     * Proactively refresh one store's token if stale. Driven by the keep-alive
     * cron so it is the SINGLE writer of tokens — backfill crons then always
     * find a still-valid token and never trigger a competing (revoking) refresh.
     */
    async refreshIfStale(storeUid: string): Promise<{ refreshed: boolean; skipped?: string }> {
        const owner = await RepositoryFactory.getOwnerRepository().findById(storeUid);
        if (!owner?.oauth) return { refreshed: false, skipped: 'no-oauth' };
        if (owner.oauth.needsReauth) return { refreshed: false, skipped: 'needs-reauth' };
        if (!owner.oauth.refresh_token) return { refreshed: false, skipped: 'no-refresh-token' };
        if (!this.isStale(owner.oauth)) return { refreshed: false, skipped: 'fresh' };

        const result = await this.refreshTokenCoalesced(storeUid, owner.oauth.refresh_token);
        if (result.success) return { refreshed: true };
        return { refreshed: false, skipped: result.needsReauth ? 'revoked' : 'refresh-failed' };
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

                // A revoked/expired refresh grant is terminal — Salla's single-use
                // refresh token cannot be recovered by refreshing; the merchant must
                // reinstall the app. Persist this so the store surfaces for outreach
                // instead of silently failing every API call.
                const revoked =
                    response.status === 401 ||
                    data.error === 'invalid_grant' ||
                    /refresh token/i.test(errorMsg);
                if (revoked) {
                    await RepositoryFactory.getOwnerRepository()
                        .markNeedsReauth(storeUid, errorMsg)
                        .catch((e) => log('warn', `Failed to mark needsReauth for ${storeUid}: ${String(e)}`, { scope: 'token' }));
                }

                return { success: false, error: errorMsg, needsReauth: revoked };
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
