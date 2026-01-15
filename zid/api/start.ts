import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/server/auth/requireUser';
import { createZidState } from '@/server/zid/state';

const AUTH_URL = process.env.ZID_AUTH_URL || 'https://oauth.zid.sa/oauth/authorize';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { uid } = await requireUser(req);
    const state = await createZidState(uid);

    const clientId = process.env.ZID_CLIENT_ID!;
    const redirectUri = process.env.ZID_REDIRECT_URI!;
    if (!clientId || !redirectUri) {
      return res.status(500).json({ message: 'ZID_CLIENT_ID/ZID_REDIRECT_URI are required' });
    }

    // سكوبات اختيارية
    const scopes: string[] = [];
    if (process.env.ENABLE_ZID_SCOPE_EMBEDDED_APPS === 'true') scopes.push('embedded_apps');
    if (process.env.ENABLE_ZID_SCOPE_PRODUCTS === 'true') scopes.push('products');
    // أضف سكوبات أخرى حسب احتياجك…

    const authorizeUrl = new URL(AUTH_URL);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    if (scopes.length) authorizeUrl.searchParams.set('scope', scopes.join(' '));
    authorizeUrl.searchParams.set('state', state);

    return res.status(200).json({ authorizeUrl: authorizeUrl.toString() });
  } catch (e) {
    console.error('zid/start error', e);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
