// src/server/auth/requireAdmin.ts
import type { NextApiRequest } from 'next';
import { authAdmin } from '@/lib/firebaseAdmin';
import type { DecodedIdToken } from 'firebase-admin/auth';

function hasAdminClaim(t: DecodedIdToken): t is DecodedIdToken & { admin?: unknown } {
  return typeof t === 'object' && t !== null && 'admin' in t;
}

export async function requireAdmin(req: NextApiRequest): Promise<{ uid: string }> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new Error('no_token');

  const auth = authAdmin();
  const decoded = await auth.verifyIdToken(token);
  if (!decoded || !decoded.uid) throw new Error('invalid_token');

  const isAdmin = hasAdminClaim(decoded) ? Boolean(decoded.admin) : false;
  if (!isAdmin) throw new Error('forbidden');

  return { uid: decoded.uid };
}
