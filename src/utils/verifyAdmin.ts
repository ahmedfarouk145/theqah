import type { NextApiRequest } from 'next';
import { authAdmin, dbAdmin } from '@/lib/firebaseAdmin';
import type { DecodedIdToken } from 'firebase-admin/auth';

type Decoded = DecodedIdToken & { role?: string };

function getTokenFromReq(req: NextApiRequest): string | null {
  const authHeader = (req.headers.authorization || req.headers.Authorization) as
    | string
    | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Optional: read from cookie "token" or "session"
  const cookie = req.headers.cookie || '';
  const tokenMatch =
    cookie.match(/(?:^|;\s*)(?:token|session)=([^;]+)/)?.[1] || null;
  return tokenMatch;
}

function hasAdminClaim(decoded: DecodedIdToken): boolean {
  // custom claim: decoded.admin === true
  // or decoded.role === 'admin'
  const hasura =
    (decoded['https://hasura.io/jwt/claims'] as
      | Record<string, unknown>
      | undefined) ?? undefined;
  const hasuraRole =
    typeof hasura?.['x-hasura-default-role'] === 'string'
      ? (hasura['x-hasura-default-role'] as string)
      : undefined;

  return (
    (decoded as { admin?: unknown }).admin === true ||
    (decoded as { role?: unknown }).role === 'admin' ||
    hasuraRole === 'admin'
  );
}

/**
 * Throws on failure with messages:
 *  - 'unauthenticated'
 *  - 'permission-denied'
 */
export async function verifyAdmin(
  req: NextApiRequest,
  options?: { checkRevoked?: boolean }
): Promise<Decoded> {
  const { checkRevoked = false } = options || {};
  const auth = authAdmin();
  const db = dbAdmin();

  const idToken = getTokenFromReq(req);
  if (!idToken) {
    throw new Error('unauthenticated: missing token');
  }

  let decoded: Decoded;
  try {
    decoded = (await auth.verifyIdToken(idToken, checkRevoked)) as Decoded;
  } catch {
    throw new Error('unauthenticated: invalid token');
  }

  // Accept admin via custom claims or users doc
  if (hasAdminClaim(decoded)) return decoded;

  // fallback: check Firestore user doc
  const userDoc = await db.collection('users').doc(decoded.uid).get();
  const role = (userDoc.data() as { role?: string } | undefined)?.role;
  if (role === 'admin') {
    decoded.role = 'admin';
    return decoded;
  }

  throw new Error('permission-denied: not admin');
}
