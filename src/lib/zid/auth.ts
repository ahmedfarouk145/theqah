// src/lib/zid/auth.ts
import { getZidTokens, saveZidTokens, ZidTokens } from '@/lib/zid/tokens';

type RefreshResponse = {
  access_token: string;
  authorization?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

async function refresh(uid: string, tokens: ZidTokens) {
  if (!tokens.refresh_token) throw new Error('No refresh_token');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: process.env.ZID_CLIENT_ID!,
    client_secret: process.env.ZID_CLIENT_SECRET!,
  });

  const r = await fetch('https://oauth.zid.sa/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`refresh_failed_${r.status}`);

  const j = (await r.json()) as RefreshResponse;
  const expiresAt = Date.now() + ((j.expires_in ?? 3600) * 1000);

  const next: ZidTokens = {
    access_token: j.access_token,
    authorization: j.authorization ?? tokens.authorization, // احتفظ بما لديك إن لم ترجع
    refresh_token: j.refresh_token ?? tokens.refresh_token,
    token_type: j.token_type,
    expires_in: j.expires_in,
    expires_at: expiresAt,
    scope: j.scope,
    raw: j,
  };
  await saveZidTokens(uid, next);
  return next;
}

export async function ensureZidAccessToken(uid: string): Promise<ZidTokens> {
  const tokens = await getZidTokens(uid);
  if (!tokens) throw new Error('no_tokens');
  if (Date.now() < tokens.expires_at) return tokens;
  return refresh(uid, tokens);
}
