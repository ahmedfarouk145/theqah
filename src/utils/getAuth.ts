// File: src/utils/getAuth.ts
import { authAdmin } from '@/lib/firebaseAdmin';
import type { NextApiRequest } from 'next';

export async function getAuth(req: NextApiRequest) {
  const authz = req.headers.authorization || '';
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];

  if (!token) throw new Error('Unauthorized: Missing token');

  const decoded = await authAdmin().verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email ?? null };
}
