// src/server/auth/requireUser.ts
import type { NextApiRequest } from "next";
import { authAdmin } from "@/lib/firebaseAdmin";

export async function requireUser(
  req: NextApiRequest
): Promise<{ uid: string; email: string | null }> {
  const authz = req.headers.authorization || "";
  const m = authz.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];

  if (!token) {
    throw new Error("unauthenticated: missing bearer");
  }

  const decoded = await authAdmin().verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email ?? null };
}
