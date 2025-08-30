// src/utils/verifyStore.ts
import type { NextApiRequest } from "next";
import { authAdmin } from "@/lib/firebaseAdmin";

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
    (req as AuthedRequest).storeId = decoded.uid;
    (req as AuthedRequest).storeEmail = decoded.email ?? undefined;
    return { uid: decoded.uid, email: decoded.email ?? undefined };
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
