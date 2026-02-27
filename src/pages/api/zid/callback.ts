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

async function fetchZidStoreInfo(managerToken: string): Promise<ZidStoreInfo | null> {
  try {
    const r = await fetch(`${ZID_API_URL}/managers/account/profile`, {
      headers: {
        'Authorization': `Bearer ${managerToken}`,
        'X-MANAGER-TOKEN': managerToken,
        'Accept': 'application/json',
      },
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.store || data || null;
  } catch (err) {
    console.error('[ZID_CALLBACK] Failed to fetch store info:', err);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { code, state } = req.query;
    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return res.status(400).send('Missing code/state');
    }

    // Validate state
    const check = await consumeZidState(state);
    if (!check.ok) {
      return res.redirect('/dashboard?zid_error=invalid_state');
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

      if (!r.ok) {
        console.error('[ZID_CALLBACK] Token exchange failed:', tokenJson);
        return res.redirect('/dashboard?zid_error=token_exchange');
      }
    } catch (err) {
      console.error('[ZID_CALLBACK] Token request error:', err);
      return res.redirect('/dashboard?zid_error=token_request');
    }

    // Fetch store info
    const managerToken = tokenJson.authorization || tokenJson.access_token || '';
    const storeInfo = managerToken ? await fetchZidStoreInfo(managerToken) : null;
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
    const uid = check.uid;
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
