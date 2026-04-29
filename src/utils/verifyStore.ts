// src/utils/verifyStore.ts
import type { NextApiRequest } from "next";
import { authAdmin, dbAdmin } from "@/lib/firebaseAdmin";

export type AuthedRequest = NextApiRequest & { storeId?: string; storeEmail?: string };

function readBearer(req: NextApiRequest): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7);

  // بدائل شائعة بالكوكيز
  const cookieToken = (req.cookies?.token as string | undefined)
    || (req.cookies?.Authorization as string | undefined)
    || null;
  if (cookieToken?.startsWith("Bearer ")) return cookieToken.slice(7);
  return cookieToken;
}

/**
 * Resolve store UID from Firebase Auth UID
 * Checks alias document first, then falls back to email-based lookup
 */
async function resolveStoreUid(firebaseUid: string, email?: string): Promise<string> {
  const db = dbAdmin();

  // 1) Check if there's an alias document pointing to the real store
  try {
    const aliasDoc = await db.collection('stores').doc(firebaseUid).get();
    if (aliasDoc.exists) {
      const alias = aliasDoc.data() || {};
      // If this document has storeUid, it's an alias pointing to the real store
      if (alias.storeUid && typeof alias.storeUid === 'string') {
        return alias.storeUid;
      }
      // If this document IS the store (has salla.connected etc), return the firebase UID
      if (alias.salla?.connected || alias.zid?.connected || alias.provider) {
        return firebaseUid;
      }
    }
  } catch {
    // Ignore errors, try next approach
  }

  // 2) Try to find store by email
  if (email) {
    try {
      // First: Look for userinfo.data.context.email match
      const emailQuery = db.collection('stores')
        .where('meta.userinfo.data.context.email', '==', email)
        .orderBy('updatedAt', 'desc')
        .limit(1);

      const snap = await emailQuery.get();
      if (!snap.empty) {
        return snap.docs[0].id;
      }
    } catch {
      // Index might not exist, try alternative
    }

    try {
      // Second: Look for email + salla.connected
      const sallaQuery = db.collection('stores')
        .where('email', '==', email)
        .where('salla.connected', '==', true)
        .limit(1);

      const snap = await sallaQuery.get();
      if (!snap.empty) {
        return snap.docs[0].id;
      }
    } catch {
      // Index might not exist
    }

    try {
      // Third: Look for email + zid.connected — query BOTH legacy `stores`
      // and the new `zid_stores` collection (Phase 3d of Zid/Salla split).
      // Prefer zid_stores on hit so a post-cutover Zid registration is
      // resolved before any stale legacy doc.
      const [zidNewSnap, zidLegacySnap] = await Promise.all([
        db.collection('zid_stores')
          .where('email', '==', email)
          .where('zid.connected', '==', true)
          .limit(1)
          .get(),
        db.collection('stores')
          .where('email', '==', email)
          .where('zid.connected', '==', true)
          .limit(1)
          .get(),
      ]);

      if (!zidNewSnap.empty) return zidNewSnap.docs[0].id;
      if (!zidLegacySnap.empty) return zidLegacySnap.docs[0].id;
    } catch {
      // Index might not exist
    }
  }

  // 3) Fallback: return the firebase UID as-is
  return firebaseUid;
}

export async function verifyStore(req: NextApiRequest): Promise<{ uid: string; email?: string }> {
  const token = readBearer(req);
  if (!token) {
    const e = new Error("MISSING_ID_TOKEN");
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e as any).status = 401;
    throw e;
  }

  try {
    const decoded = await authAdmin().verifyIdToken(token);
    const email = decoded.email ?? undefined;

    // Resolve the actual store UID (might be different from Firebase Auth UID)
    const storeUid = await resolveStoreUid(decoded.uid, email);

    (req as AuthedRequest).storeId = storeUid;
    (req as AuthedRequest).storeEmail = email;
    return { uid: storeUid, email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('incorrect "aud"')) {
      const e = new Error("FIREBASE_AUDIENCE_MISMATCH");
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e as any).status = 401;
      throw e;
    }
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).status = 401;
    throw err;
  }
}

