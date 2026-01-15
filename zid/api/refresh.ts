import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { requireUser } from '@/server/auth/requireUser';

const TOKEN_URL = process.env.ZID_TOKEN_URL || 'https://oauth.zid.sa/oauth/token';
const CRON_SECRET = process.env.CRON_SECRET;

async function refreshOne(uid: string) {
  const db = dbAdmin();
  const ref = db.collection('zid_tokens').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('no_token');

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = snap.data() as any;
  const refresh_token = data.refresh_token;
  if (!refresh_token) throw new Error('no_refresh');

  const clientId = process.env.ZID_CLIENT_ID!;
  const clientSecret = process.env.ZID_CLIENT_SECRET!;
  if (!clientId || !clientSecret) throw new Error('config');

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const j = await r.json();
  if (!r.ok) {
    throw new Error(`refresh_failed:${j?.error || 'unknown'}`);
  }

  const expiresAt =
    typeof j.expires_in === 'number'
      ? Date.now() + j.expires_in * 1000
      : Date.now() + 3600 * 1000;

  await ref.set({
    access_token: j.access_token,
    refresh_token: j.refresh_token || refresh_token,
    token_type: j.token_type || 'Bearer',
    scope: j.scope || data.scope || null,
    expires_at: expiresAt,
    updated_at: Date.now(),
  }, { merge: true });

  return { ok: true, expires_at: expiresAt };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // وضع1: مستخدم مسجّل يطلب تجديد حسابه
    if (req.method === 'POST' && req.headers.authorization) {
      const { uid } = await requireUser(req);
      const result = await refreshOne(uid);
      return res.status(200).json(result);
    }

    // وضع2: كرون للسيرفر لتجديد مستخدم معيّن بالـ uid
    if (req.method === 'POST' && req.headers['x-cron-secret'] === CRON_SECRET) {
      const { uid } = req.body || {};
      if (!uid || typeof uid !== 'string') {
        return res.status(400).json({ message: 'uid required' });
      }
      const result = await refreshOne(uid);
      return res.status(200).json(result);
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (e) {
    console.error('zid/refresh error', e);
    return res.status(500).json({ message: 'refresh failed' });
  }
}
