// src/pages/api/auth/session.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthService } from '@/server/services/auth.service';

type SameSiteOpt = 'Lax' | 'Strict' | 'None';

function cookieHeader(
  name: string,
  value: string,
  opts: {
    maxAgeSeconds?: number;
    secure?: boolean;
    path?: string;
    sameSite?: SameSiteOpt;
    httpOnly?: boolean;
    domain?: string;
    expires?: Date;
  } = {}
) {
  const parts: string[] = [];
  parts.push(`${name}=${value ? encodeURIComponent(value) : ''}`);

  const path = opts.path ?? '/';
  parts.push(`Path=${path}`);

  const sameSite = opts.sameSite ?? 'Lax';
  parts.push(`SameSite=${sameSite}`);

  const forceSecure = sameSite === 'None';
  const secure = (opts.secure ?? true) || forceSecure;
  if (secure) parts.push('Secure');

  const httpOnly = opts.httpOnly ?? true;
  if (httpOnly) parts.push('HttpOnly');

  if (opts.domain) parts.push(`Domain=${opts.domain}`);

  if (opts.maxAgeSeconds != null) {
    parts.push(`Max-Age=${opts.maxAgeSeconds}`);
    const exp = opts.expires ?? new Date(Date.now() + Math.max(0, opts.maxAgeSeconds) * 1000);
    parts.push(`Expires=${exp.toUTCString()}`);
  } else if (opts.expires) {
    parts.push(`Expires=${opts.expires.toUTCString()}`);
  }

  return parts.join('; ');
}

function isHttpsReq(req: NextApiRequest) {
  const xf = (req.headers['x-forwarded-proto'] ?? '').toString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return xf.includes('https') || (req.socket as any)?.encrypted === true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const https = isHttpsReq(req);
  const inProd = process.env.NODE_ENV === 'production';
  const authService = new AuthService();

  if (req.method === 'POST') {
    const authz = req.headers.authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    const idToken = m?.[1] || (req.body?.idToken as string | undefined);

    if (!idToken) return res.status(400).json({ error: 'MISSING_ID_TOKEN' });

    try {
      const expiresInMs = 5 * 24 * 60 * 60 * 1000;
      const expiresInSec = Math.floor(expiresInMs / 1000);

      const { sessionCookie, uid } = await authService.createSession(idToken, expiresInMs);

      // Track login activity
      const { trackAuth } = await import('@/server/activity-tracker');
      trackAuth({ userId: uid, action: 'login', req }).catch(err =>
        console.error('[Session] Failed to track login:', err)
      );

      res.setHeader(
        'Set-Cookie',
        cookieHeader('session', sessionCookie, {
          maxAgeSeconds: expiresInSec,
          secure: https || inProd,
          sameSite: 'Lax',
          httpOnly: true,
          path: '/',
        })
      );

      res.setHeader('Vary', 'Cookie');
      return res.status(200).json({ ok: true, uid });
    } catch {
      return res.status(401).json({ error: 'SESSION_CREATE_FAILED' });
    }
  }

  if (req.method === 'GET') {
    try {
      const session = req.cookies?.session || '';
      if (!session) return res.status(401).json({ error: 'NO_SESSION' });

      const user = await authService.verifySession(session);
      return res.status(200).json({ ok: true, uid: user.uid, email: user.email });
    } catch {
      return res.status(401).json({ error: 'INVALID_SESSION' });
    }
  }

  if (req.method === 'DELETE') {
    const session = req.cookies?.session || '';
    if (session) {
      await authService.revokeSession(session);
    }

    res.setHeader(
      'Set-Cookie',
      cookieHeader('session', '', {
        maxAgeSeconds: 0,
        secure: https || inProd,
        sameSite: 'Lax',
        httpOnly: true,
        path: '/',
        expires: new Date(0),
      })
    );
    res.setHeader('Vary', 'Cookie');
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
