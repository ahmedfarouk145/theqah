import type { NextApiRequest, NextApiResponse } from 'next';
import { consumeZidState } from '@/server/zid/state';
import { dbAdmin } from '@/lib/firebaseAdmin';

const TOKEN_URL = process.env.ZID_TOKEN_URL || 'https://oauth.zid.sa/oauth/token';

type ZidTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number; // seconds
};

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

    // خزّن التوكنات
    await db.collection('zid_tokens').doc(uid).set(
      {
        access_token: tokenJson.access_token ?? null,
        refresh_token: tokenJson.refresh_token ?? null,
        token_type: tokenJson.token_type ?? 'Bearer',
        scope: tokenJson.scope ?? null,
        expires_at: expiresAt,
        updated_at: Date.now(),
      },
      { merge: true }
    );

    // علّم المتجر "متصل"
    await db.collection('stores').doc(uid).set(
      {
        zid: { connected: true, updatedAt: Date.now() },
      },
      { merge: true }
    );

    return res.redirect('/dashboard?zid=connected');
  } catch (err) {
    console.error('zid/callback error', err);
    return res.redirect('/dashboard?zid_error=unknown');
  }
}
