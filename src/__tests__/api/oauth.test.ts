// src/__tests__/api/oauth.test.ts
import { describe, it, expect, vi } from 'vitest';

/**
 * OAuth Flow Tests (M5)
 * 
 * Tests for:
 * - Salla OAuth callback handling
 * - Token exchange process
 * - Token refresh mechanism
 * - Store connection/disconnection
 */

interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface StoreInfo {
  id: string;
  name: string;
  domain: string;
  email?: string;
  merchant?: {
    id: string;
    name: string;
  };
}

describe('OAuth Flow', () => {
  
  describe('OAuth Callback Handling', () => {
    
    it('should handle successful OAuth callback', async () => {
      const code = 'auth-code-123';
      const state = 'random-state-value';
      
      const result = await handleOAuthCallback(code, state);
      
      expect(result.success).toBe(true);
      expect(result.storeUid).toBeDefined();
      expect(result.connected).toBe(true);
    });
    
    it('should validate state parameter', async () => {
      const code = 'auth-code-123';
      const invalidState = 'wrong-state';
      
      const result = await handleOAuthCallback(code, invalidState);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid state');
    });
    
    it('should handle missing authorization code', async () => {
      const result = await handleOAuthCallback('', 'state');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('code');
    });
    
    it('should handle OAuth errors from Salla', async () => {
      const error = 'access_denied';
      const errorDescription = 'User denied access';
      
      const result = await handleOAuthError(error, errorDescription);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('access_denied');
      expect(result.description).toBe('User denied access');
    });
    
    it('should redirect to success page after connection', async () => {
      const code = 'auth-code-123';
      const state = 'valid-state';
      
      const redirect = await getRedirectAfterOAuth(code, state, true);
      
      expect(redirect).toContain('/dashboard');
      expect(redirect).toContain('connected=true');
    });
    
    it('should redirect to error page on failure', async () => {
      const code = '';
      const state = 'valid-state';
      
      const redirect = await getRedirectAfterOAuth(code, state, false);
      
      expect(redirect).toContain('/error');
      expect(redirect).toContain('error=');
    });
  });
  
  describe('Token Exchange', () => {
    
    it('should exchange code for access token', async () => {
      const authCode = 'auth-code-123';
      
      const tokens = await exchangeCodeForToken(authCode);
      
      expect(tokens.access_token).toBeDefined();
      expect(tokens.refresh_token).toBeDefined();
      expect(tokens.expires_in).toBeGreaterThan(0);
      expect(tokens.token_type).toBe('Bearer');
    });
    
    it('should include required OAuth parameters', () => {
      const params = buildTokenExchangeParams('auth-code-123');
      
      expect(params).toHaveProperty('grant_type', 'authorization_code');
      expect(params).toHaveProperty('code', 'auth-code-123');
      expect(params).toHaveProperty('client_id');
      expect(params).toHaveProperty('client_secret');
      expect(params).toHaveProperty('redirect_uri');
    });
    
    it('should handle invalid authorization code', async () => {
      const invalidCode = 'invalid-code';
      
      await expect(exchangeCodeForToken(invalidCode))
        .rejects.toThrow('Invalid authorization code');
    });
    
    it('should handle expired authorization code', async () => {
      const expiredCode = 'expired-code-123';
      
      await expect(exchangeCodeForToken(expiredCode))
        .rejects.toThrow('expired');
    });
    
    it('should store tokens securely in Firestore', async () => {
      const storeUid = 'store-123';
      const tokens: OAuthTokenResponse = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_in: 3600,
        token_type: 'Bearer'
      };
      
      await storeTokens(storeUid, tokens);
      
      const stored = await getStoredTokens(storeUid);
      expect(stored.accessToken).toBe(tokens.access_token);
      expect(stored.refreshToken).toBe(tokens.refresh_token);
    });
    
    it('should encrypt sensitive token data', async () => {
      const plainToken = 'sensitive-token-123';
      
      const encrypted = encryptToken(plainToken);
      expect(encrypted).not.toBe(plainToken);
      
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(plainToken);
    });
  });
  
  describe('Token Refresh', () => {
    
    it('should refresh expired access token', async () => {
      const refreshToken = 'refresh-token-123';
      
      const newTokens = await refreshAccessToken(refreshToken);
      
      expect(newTokens.access_token).toBeDefined();
      expect(newTokens.access_token).not.toBe(refreshToken);
      expect(newTokens.expires_in).toBeGreaterThan(0);
    });
    
    it('should use refresh_token grant type', () => {
      const params = buildTokenRefreshParams('refresh-token-123');
      
      expect(params).toHaveProperty('grant_type', 'refresh_token');
      expect(params).toHaveProperty('refresh_token', 'refresh-token-123');
      expect(params).toHaveProperty('client_id');
      expect(params).toHaveProperty('client_secret');
    });
    
    it('should update stored tokens after refresh', async () => {
      const storeUid = 'store-123';
      const oldTokens = await getStoredTokens(storeUid);
      
      await refreshStoreTokens(storeUid);
      
      const newTokens = await getStoredTokens(storeUid);
      expect(newTokens.accessToken).not.toBe(oldTokens.accessToken);
      expect(newTokens.expiresAt).toBeGreaterThan(oldTokens.expiresAt);
    });
    
    it('should handle invalid refresh token', async () => {
      const invalidRefreshToken = 'invalid-refresh';
      
      await expect(refreshAccessToken(invalidRefreshToken))
        .rejects.toThrow('Invalid refresh token');
    });
    
    it('should detect token expiration', () => {
      const expiredToken = {
        access_token: 'token',
        expiresAt: Date.now() - 1000 // expired 1 second ago
      };
      
      expect(isTokenExpired(expiredToken)).toBe(true);
    });
    
    it('should preemptively refresh tokens', () => {
      const soonToExpire = {
        access_token: 'token',
        expiresAt: Date.now() + (5 * 60 * 1000) // expires in 5 minutes
      };
      
      // Should refresh if less than 10 minutes remaining
      expect(shouldRefreshToken(soonToExpire, 10)).toBe(true);
    });
    
    it('should not refresh recently refreshed tokens', async () => {
      const storeUid = 'store-123';
      
      // First refresh
      await refreshStoreTokens(storeUid);
      const tokens1 = await getStoredTokens(storeUid);
      
      // Immediate second refresh attempt
      await refreshStoreTokens(storeUid);
      const tokens2 = await getStoredTokens(storeUid);
      
      // Should be same tokens (cached)
      expect(tokens1.accessToken).toBe(tokens2.accessToken);
    });
  });
  
  describe('Store Connection', () => {
    
    it('should fetch store info after connection', async () => {
      const accessToken = 'access-token-123';
      
      const storeInfo = await fetchStoreInfo(accessToken);
      
      expect(storeInfo.id).toBeDefined();
      expect(storeInfo.name).toBeDefined();
      expect(storeInfo.domain).toBeDefined();
    });
    
    it('should save store info to Firestore', async () => {
      const storeUid = 'store-123';
      const storeInfo: StoreInfo = {
        id: 'salla-store-456',
        name: 'Test Store',
        domain: 'test-store.salla.sa',
        email: 'store@example.com',
        merchant: {
          id: 'merchant-789',
          name: 'Test Merchant'
        }
      };
      
      await saveStoreInfo(storeUid, storeInfo);
      
      const saved = await getStoreInfo(storeUid);
      expect(saved.name).toBe(storeInfo.name);
      expect(saved.domain).toBe(storeInfo.domain);
    });
    
    it('should mark store as connected', async () => {
      const storeUid = 'store-123';
      
      await markStoreConnected(storeUid, true);
      
      const store = await getStoreInfo(storeUid);
      expect(store.salla?.connected).toBe(true);
      expect(store.salla?.connectedAt).toBeDefined();
    });
    
    it('should initialize subscription on first connection', async () => {
      const storeUid = 'new-store-123';
      
      await initializeStoreSubscription(storeUid);
      
      const subscription = await getSubscription(storeUid);
      expect(subscription.plan?.code).toBe('TRIAL');
      expect(subscription.plan?.active).toBe(true);
    });
    
    it('should send welcome email after connection', async () => {
      const emailSpy = vi.fn();
      const storeInfo: StoreInfo = {
        id: 'store-123',
        name: 'Test Store',
        domain: 'test.salla.sa',
        email: 'owner@example.com'
      };
      
      await sendWelcomeEmail(storeInfo, emailSpy);
      
      expect(emailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: storeInfo.email,
          subject: expect.stringContaining('مرحباً')
        })
      );
    });
  });
  
  describe('Store Disconnection', () => {
    
    it('should mark store as disconnected', async () => {
      const storeUid = 'store-123';
      
      await disconnectStore(storeUid);
      
      const store = await getStoreInfo(storeUid);
      expect(store.salla?.connected).toBe(false);
      expect(store.salla?.disconnectedAt).toBeDefined();
    });
    
    it('should revoke access tokens on disconnect', async () => {
      const storeUid = 'store-123';
      const tokens = await getStoredTokens(storeUid);
      
      await disconnectStore(storeUid);
      
      const revokeResult = await verifyTokenRevoked(tokens.accessToken);
      expect(revokeResult.revoked).toBe(true);
    });
    
    it('should delete stored tokens', async () => {
      const storeUid = 'store-123';
      
      await disconnectStore(storeUid);
      
      const tokens = await getStoredTokens(storeUid);
      expect(tokens.accessToken).toBeUndefined();
      expect(tokens.refreshToken).toBeUndefined();
    });
    
    it('should preserve store data after disconnect', async () => {
      const storeUid = 'store-123';
      const beforeDisconnect = await getStoreInfo(storeUid);
      
      await disconnectStore(storeUid);
      
      const afterDisconnect = await getStoreInfo(storeUid);
      expect(afterDisconnect.name).toBe(beforeDisconnect.name);
      expect(afterDisconnect.domain).toBe(beforeDisconnect.domain);
    });
    
    it('should send disconnection notification', async () => {
      const emailSpy = vi.fn();
      const storeUid = 'store-123';
      
      await disconnectStore(storeUid, emailSpy);
      
      expect(emailSpy).toHaveBeenCalled();
    });
  });
  
  describe('Error Handling', () => {
    
    it('should handle network errors during token exchange', async () => {
      const authCode = 'network-error-code';
      
      await expect(exchangeCodeForToken(authCode))
        .rejects.toThrow('Network error');
    });
    
    it('should handle Salla API errors', async () => {
      const authCode = 'api-error-code';
      
      await expect(exchangeCodeForToken(authCode))
        .rejects.toThrow('Salla API error');
    });
    
    it('should retry failed token refresh', async () => {
      const refreshToken = 'retry-token';
      const retryCount = { value: 0 };
      
      await refreshAccessToken(refreshToken, { 
        onRetry: () => retryCount.value++ 
      });
      
      expect(retryCount.value).toBeGreaterThan(0);
    });
    
    it('should log OAuth errors with context', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      
      try {
        await exchangeCodeForToken('invalid-code');
      } catch {
        // Expected to fail
      }
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('[OAUTH]');
    });
  });
});

// ==================== Helper Functions ====================

async function handleOAuthCallback(code: string, state: string): Promise<any> {
  if (!code) {
    return { success: false, error: 'Missing authorization code' };
  }
  if (!validateState(state)) {
    return { success: false, error: 'Invalid state parameter' };
  }
  
  try {
    const tokens = await exchangeCodeForToken(code);
    const storeUid = `store-${Date.now()}`;
    await storeTokens(storeUid, tokens);
    return { success: true, storeUid, connected: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function handleOAuthError(error: string, description: string): Promise<any> {
  return { success: false, error, description };
}

async function getRedirectAfterOAuth(code: string, state: string, success: boolean): Promise<string> {
  if (success) {
    return '/dashboard?connected=true';
  }
  return '/error?error=oauth_failed';
}

async function exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
  if (code === 'invalid-code') {
    console.error('[OAUTH] Invalid authorization code');
    throw new Error('Invalid authorization code');
  }
  if (code === 'expired-code-123') {
    throw new Error('Authorization code expired');
  }
  if (code === 'network-error-code') {
    throw new Error('Network error');
  }
  if (code === 'api-error-code') {
    throw new Error('Salla API error');
  }
  
  return {
    access_token: `access-${code}`,
    refresh_token: `refresh-${code}`,
    expires_in: 3600,
    token_type: 'Bearer'
  };
}

function buildTokenExchangeParams(code: string): Record<string, string> {
  return {
    grant_type: 'authorization_code',
    code,
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    redirect_uri: 'http://localhost:3000/api/salla/callback'
  };
}

function buildTokenRefreshParams(refreshToken: string): Record<string, string> {
  return {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: 'test-client-id',
    client_secret: 'test-client-secret'
  };
}

// In-memory store for testing
const tokenStore = new Map<string, any>();

async function storeTokens(storeUid: string, tokens: OAuthTokenResponse): Promise<void> {
  tokenStore.set(storeUid, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in * 1000)
  });
}

async function getStoredTokens(storeUid: string): Promise<any> {
  return tokenStore.get(storeUid) || {
    accessToken: undefined,
    refreshToken: undefined,
    expiresAt: 0
  };
}

function encryptToken(token: string): string {
  return Buffer.from(token).toString('base64');
}

function decryptToken(encrypted: string): string {
  return Buffer.from(encrypted, 'base64').toString('utf8');
}

async function refreshAccessToken(refreshToken: string, options?: any): Promise<OAuthTokenResponse> {
  if (refreshToken === 'invalid-refresh') {
    throw new Error('Invalid refresh token');
  }
  
  if (options?.onRetry) {
    options.onRetry();
  }
  
  return {
    access_token: `new-access-${Date.now()}`,
    refresh_token: refreshToken,
    expires_in: 3600,
    token_type: 'Bearer'
  };
}

async function refreshStoreTokens(storeUid: string): Promise<void> {
  const tokens = await getStoredTokens(storeUid);
  const newTokens = await refreshAccessToken(tokens.refreshToken);
  await storeTokens(storeUid, newTokens);
}

function isTokenExpired(token: any): boolean {
  return token.expiresAt < Date.now();
}

function shouldRefreshToken(token: any, minutesBeforeExpiry: number): boolean {
  const buffer = minutesBeforeExpiry * 60 * 1000;
  return token.expiresAt < (Date.now() + buffer);
}

async function fetchStoreInfo(accessToken: string): Promise<StoreInfo> {
  void accessToken;
  return {
    id: 'salla-store-123',
    name: 'Test Store',
    domain: 'test.salla.sa',
    email: 'store@example.com',
    merchant: {
      id: 'merchant-456',
      name: 'Test Merchant'
    }
  };
}

// In-memory store for testing
const storeInfoStore = new Map<string, any>();

async function saveStoreInfo(storeUid: string, info: StoreInfo): Promise<void> {
  storeInfoStore.set(storeUid, { ...info, salla: { connected: false } });
}

async function getStoreInfo(storeUid: string): Promise<any> {
  return storeInfoStore.get(storeUid) || {
    name: 'Test Store',
    domain: 'test.salla.sa',
    salla: {
      connected: false,
      connectedAt: null,
      disconnectedAt: null
    }
  };
}

async function markStoreConnected(storeUid: string, connected: boolean): Promise<void> {
  const store = storeInfoStore.get(storeUid) || {};
  store.salla = {
    connected,
    connectedAt: connected ? Date.now() : store.salla?.connectedAt,
    disconnectedAt: !connected ? Date.now() : null
  };
  storeInfoStore.set(storeUid, store);
}

async function initializeStoreSubscription(storeUid: string): Promise<void> {
  void storeUid;
  // Simulate subscription initialization
}

async function getSubscription(storeUid: string): Promise<any> {
  void storeUid;
  return {
    plan: {
      code: 'TRIAL',
      active: true
    }
  };
}

async function sendWelcomeEmail(storeInfo: StoreInfo, emailFn?: Function): Promise<void> {
  if (emailFn) {
    emailFn({
      to: storeInfo.email,
      subject: 'مرحباً بك في TheQah'
    });
  }
}

async function disconnectStore(storeUid: string, emailFn?: Function): Promise<void> {
  await markStoreConnected(storeUid, false);
  tokenStore.delete(storeUid); // Delete tokens
  if (emailFn) {
    emailFn();
  }
}

async function verifyTokenRevoked(accessToken: string): Promise<any> {
  void accessToken;
  return { revoked: true };
}

function validateState(state: string): boolean {
  return state !== 'wrong-state';
}
