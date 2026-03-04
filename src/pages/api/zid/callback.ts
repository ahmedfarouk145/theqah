// src/pages/api/zid/callback.ts
// OAuth callback — exchanges code for tokens, auto-creates store + Firebase user
// Delegates to ZidWebhookService for registration and ZidTokenService for tokens

import type { NextApiRequest, NextApiResponse } from 'next';
import { consumeZidState } from '@/backend/server/zid/state';
import { ZidWebhookService } from '@/backend/server/services/zid-webhook.service';

const TOKEN_URL = process.env.ZID_TOKEN_URL || 'https://oauth.zid.sa/oauth/token';
const ZID_API_URL = process.env.ZID_API_URL || 'https://api.zid.sa/v1';

type ZidTokenResponse = {
  access_token?: string;
  authorization?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
};

type ZidStoreInfo = {
  id?: string | number;
  name?: string;
  email?: string;
  mobile?: string;
  domain?: string;
  url?: string;
};

async function fetchZidStoreInfo(
  accessToken: string,
  authorizationToken: string
): Promise<ZidStoreInfo | null> {
  try {
    console.log('[ZID_CALLBACK] Fetching store info with tokens:', {
      hasAccessToken: !!accessToken,
      accessTokenLen: accessToken?.length || 0,
      hasAuthorizationToken: !!authorizationToken,
      authorizationTokenLen: authorizationToken?.length || 0,
    });

    // Zid dual-token auth: Authorization = Bearer {authorization}, X-Manager-Token = {access_token}
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Accept-Language': 'ar',
    };
    if (authorizationToken) {
      headers['Authorization'] = `Bearer ${authorizationToken}`;
      headers['X-Manager-Token'] = accessToken;
    } else {
      headers['Authorization'] = `Bearer ${accessToken}`;
      headers['X-Manager-Token'] = accessToken;
    }

    const r = await fetch(`${ZID_API_URL}/managers/account/profile`, { headers });

    const text = await r.text();
    console.log('[ZID_CALLBACK] Store info response:', {
      status: r.status,
      statusText: r.statusText,
      bodyPreview: text.substring(0, 500),
    });

    if (!r.ok) return null;

    const data = JSON.parse(text);
    const store = data?.user?.store || data?.store || data;
    console.log('[ZID_CALLBACK] Parsed store info:', {
      hasData: !!data,
      topKeys: data ? Object.keys(data) : [],
      userKeys: data?.user ? Object.keys(data.user) : [],
      storeKeys: store ? Object.keys(store) : [],
      storeId: store?.id,
      storeName: store?.name,
      storeDomain: store?.domain,
      storeUrl: store?.url,
      storeUsername: store?.username,
      storeEmail: store?.email || data?.user?.email,
    });
    return store || null;
  } catch (err) {
    console.error('[ZID_CALLBACK] Failed to fetch store info:', err);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { code, state } = req.query;

    // ── Redirection URL flow ──────────────────────────────────────────
    // When Zid redirects a merchant here after install, there is no `code` yet.
    // We start the OAuth flow by redirecting to Zid's authorize endpoint.
    if (!code || typeof code !== 'string') {
      const AUTH_URL = process.env.ZID_AUTHORIZE_URL || 'https://oauth.zid.sa/oauth/authorize';
      const clientId = process.env.ZID_CLIENT_ID;
      const redirectUri = process.env.ZID_REDIRECT_URI;
      if (!clientId || !redirectUri) {
        return res.status(500).send('Server misconfiguration: missing ZID_CLIENT_ID or ZID_REDIRECT_URI');
      }

      const scopes: string[] = [];
      if (process.env.ENABLE_ZID_SCOPE_EMBEDDED_APPS === 'true') scopes.push('embedded_apps');
      if (process.env.ENABLE_ZID_SCOPE_PRODUCTS === 'true') scopes.push('products');

      const authorizeUrl = new URL(AUTH_URL);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', clientId);
      authorizeUrl.searchParams.set('redirect_uri', redirectUri);
      if (scopes.length) authorizeUrl.searchParams.set('scope', scopes.join(' '));

      console.log('[ZID_CALLBACK] Redirection URL hit — starting OAuth flow');
      return res.redirect(authorizeUrl.toString());
    }

    // ── Callback URL flow ─────────────────────────────────────────────
    // Zid sends the authorization code here. Exchange it for tokens.

    // Try to validate state from our system (dashboard-initiated flow).
    // If state is missing or not found, this is a Zid marketplace-initiated install — proceed without uid.
    let uid: string | undefined;
    if (state && typeof state === 'string') {
      const check = await consumeZidState(state);
      if (check.ok) {
        uid = check.uid;
        console.log('[ZID_CALLBACK] Dashboard-initiated flow, uid:', uid);
      } else {
        // State not from our system — marketplace-initiated install (Zid generates its own state)
        console.log('[ZID_CALLBACK] Marketplace-initiated flow (state not from our system)');
      }
    } else {
      console.log('[ZID_CALLBACK] No state param — marketplace-initiated flow');
    }

    // Validate config
    const clientId = process.env.ZID_CLIENT_ID!;
    const clientSecret = process.env.ZID_CLIENT_SECRET!;
    const redirectUri = process.env.ZID_REDIRECT_URI!;
    if (!clientId || !clientSecret || !redirectUri) {
      return res.redirect('/dashboard?zid_error=server_config');
    }

    // Exchange code for tokens
    let tokenJson: ZidTokenResponse;
    try {
      const r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }),
      });

      tokenJson = (await r.json()) as ZidTokenResponse;

      console.log('[ZID_CALLBACK] Token response:', {
        status: r.status,
        keys: Object.keys(tokenJson),
        hasAccessToken: !!tokenJson.access_token,
        hasAuthorization: !!tokenJson.authorization,
        hasRefreshToken: !!tokenJson.refresh_token,
        tokenType: tokenJson.token_type,
        expiresIn: tokenJson.expires_in,
      });

      if (!r.ok) {
        console.error('[ZID_CALLBACK] Token exchange failed:', tokenJson);
        return res.redirect('/dashboard?zid_error=token_exchange');
      }
    } catch (err) {
      console.error('[ZID_CALLBACK] Token request error:', err);
      return res.redirect('/dashboard?zid_error=token_request');
    }

    // Fetch store info — Zid dual-token: Authorization=Bearer {authorization}, X-Manager-Token={access_token}
    const accessToken = tokenJson.access_token || '';
    const authorizationToken = tokenJson.authorization || '';
    const storeInfo = (accessToken || authorizationToken)
      ? await fetchZidStoreInfo(accessToken, authorizationToken)
      : null;
    const zidStoreId = storeInfo?.id ? String(storeInfo.id) : '';

    if (!zidStoreId) {
      console.error('[ZID_CALLBACK] Could not determine store ID');
      return res.redirect('/dashboard?zid_error=no_store_id');
    }

    // Delegate to services — auto-create store + Firebase user + send password email
    const webhookService = new ZidWebhookService();
    await webhookService.handleAppAuthorize(
      zidStoreId,
      {
        id: zidStoreId,
        name: storeInfo?.name || undefined,
        email: storeInfo?.email || undefined,
        domain: storeInfo?.domain || storeInfo?.url || undefined,
      },
      {
        access_token: tokenJson.access_token || '',
        authorization: tokenJson.authorization || '',
        refresh_token: tokenJson.refresh_token,
        expires_in: tokenJson.expires_in,
      }
    );

    // Also save tokens by Firebase UID for backward compatibility
    if (uid) {
      const { dbAdmin } = await import('@/lib/firebaseAdmin');
      const db = dbAdmin();
      await db.collection('zid_tokens').doc(uid).set(
        {
          access_token: tokenJson.access_token ?? null,
          authorization: tokenJson.authorization ?? null,
          refresh_token: tokenJson.refresh_token ?? null,
          expires_at: tokenJson.expires_in
            ? Date.now() + tokenJson.expires_in * 1000
            : Date.now() + 3600 * 1000,
          firebaseUid: uid,
          zidStoreId,
          updated_at: Date.now(),
        },
        { merge: true }
      );
    }

    // Register merchant webhook subscriptions via Zid API
    const webhookTargetUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://www.theqah.com.sa'}/api/zid/webhook`;
    try {
      const webhookResult = await webhookService.registerWebhooks(
        {
          access_token: tokenJson.access_token || '',
          authorization: tokenJson.authorization || '',
        },
        webhookTargetUrl
      );
      console.log(`[ZID_CALLBACK] Webhooks: ${webhookResult.registered.length} registered, ${webhookResult.failed.length} failed`);
    } catch (webhookErr) {
      // Don't fail the entire callback for webhook registration
      console.error('[ZID_CALLBACK] ⚠️ Webhook registration error (non-fatal):', webhookErr);
    }

    console.log(`[ZID_CALLBACK] ✅ Store ${zidStoreId} connected successfully`);
    return res.redirect('/dashboard?zid=connected');
  } catch (err) {
    console.error('[ZID_CALLBACK] Error:', err);
    return res.redirect('/dashboard?zid_error=unknown');
  }
}
