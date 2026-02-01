import type { NextApiRequest, NextApiResponse } from 'next';
import { consumeZidState } from '@/backend/server/zid/state';
import { dbAdmin } from '@/lib/firebaseAdmin';

const TOKEN_URL = process.env.ZID_TOKEN_URL || 'https://oauth.zid.sa/oauth/token';
const ZID_API_URL = process.env.ZID_API_URL || 'https://api.zid.sa/v1';

type ZidTokenResponse = {
  access_token?: string;
  authorization?: string; // X-MANAGER-TOKEN - important for store-specific API calls
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number; // seconds
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
    console.error('Failed to fetch Zid store info:', err);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { code, state } = req.query;
    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return res.status(400).send('Missing code/state');
    }

    // تحقّق من state
    const check = await consumeZidState(state);
    if (!check.ok) {
      return res.redirect('/dashboard?zid_error=invalid_state');
    }
    const uid = check.uid;

    // بدّل الكود بتوكن
    const clientId = process.env.ZID_CLIENT_ID!;
    const clientSecret = process.env.ZID_CLIENT_SECRET!;
    const redirectUri = process.env.ZID_REDIRECT_URI!;
    if (!clientId || !clientSecret || !redirectUri) {
      return res.redirect('/dashboard?zid_error=server_config');
    }

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

      const raw = (await r.json()) as unknown;
      tokenJson = raw as ZidTokenResponse;

      if (!r.ok) {
        console.error('ZID token exchange failed:', tokenJson);
        return res.redirect('/dashboard?zid_error=token_exchange');
      }
    } catch (err) {
      console.error('ZID token request error:', err);
      return res.redirect('/dashboard?zid_error=token_request');
    }

    const db = dbAdmin();
    const expiresAt =
      typeof tokenJson.expires_in === 'number'
        ? Date.now() + tokenJson.expires_in * 1000
        : Date.now() + 3600 * 1000;

    // خزّن التوكنات (including authorization / X-MANAGER-TOKEN)
    await db.collection('zid_tokens').doc(uid).set(
      {
        access_token: tokenJson.access_token ?? null,
        authorization: tokenJson.authorization ?? null, // X-MANAGER-TOKEN for store-specific calls
        refresh_token: tokenJson.refresh_token ?? null,
        token_type: tokenJson.token_type ?? 'Bearer',
        scope: tokenJson.scope ?? null,
        expires_at: expiresAt,
        updated_at: Date.now(),
      },
      { merge: true }
    );

    // Fetch store info to get store ID and domain
    const managerToken = tokenJson.authorization || tokenJson.access_token;
    let storeInfo: ZidStoreInfo | null = null;
    let zidStoreId: string | null = null;
    let domain: string | null = null;

    if (managerToken) {
      storeInfo = await fetchZidStoreInfo(managerToken);
      if (storeInfo) {
        zidStoreId = storeInfo.id ? String(storeInfo.id) : null;
        domain = storeInfo.domain || storeInfo.url || null;
      }
    }

    // علّم المتجر "متصل" with store info
    await db.collection('stores').doc(uid).set(
      {
        zid: {
          connected: true,
          storeId: zidStoreId,
          name: storeInfo?.name ?? null,
          email: storeInfo?.email ?? null,
          domain: domain,
          updatedAt: Date.now()
        },
      },
      { merge: true }
    );

    // Save domain mapping for widget resolution
    if (domain && zidStoreId) {
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
      await db.collection('domains').doc(cleanDomain).set(
        {
          storeUid: `zid:${zidStoreId}`,
          domain: cleanDomain,
          platform: 'zid',
          createdAt: Date.now(),
        },
        { merge: true }
      );

      // Also store tokens by storeId for cron job access
      await db.collection('zid_tokens').doc(zidStoreId).set(
        {
          access_token: tokenJson.access_token ?? null,
          authorization: tokenJson.authorization ?? null,
          refresh_token: tokenJson.refresh_token ?? null,
          token_type: tokenJson.token_type ?? 'Bearer',
          scope: tokenJson.scope ?? null,
          expires_at: expiresAt,
          updated_at: Date.now(),
          firebaseUid: uid, // Link back to Firebase user
        },
        { merge: true }
      );
    }

    return res.redirect('/dashboard?zid=connected');
  } catch (err) {
    console.error('zid/callback error', err);
    return res.redirect('/dashboard?zid_error=unknown');
  }
}
