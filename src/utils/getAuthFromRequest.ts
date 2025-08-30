// src/utils/getAuthFromRequest.ts
import type { NextApiRequest } from "next";
import { getAuthAdmin } from "@/server/firebase-admin";

/**
 * يقرأ Bearer ID Token من الهيدر "Authorization"
 * ويعيد uid + الكائن المفكوك كاملًا.
 * يرمي Error برسالة واضحة لو التوكن مفقود/غير صالح.
 */
export async function getAuthFromRequest(req: NextApiRequest) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new Error("Unauthorized: Missing Bearer token");
  }

  const decoded = await getAuthAdmin().verifyIdToken(token);
  return { uid: decoded.uid, decoded };
}
