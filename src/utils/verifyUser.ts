import type { NextApiRequest } from "next";
import { authAdmin } from "@/lib/firebaseAdmin"; // لاحظ إنها دالة: authAdmin()

export async function verifyUser(req: NextApiRequest): Promise<{ uid: string; email?: string }> {
  // اقرأ التوكن من Authorization أو كوكي (لو عندك اسم كوكي)
  const auth = req.headers.authorization || "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = new Error("MISSING_ID_TOKEN") as any;
    err.status = 401;
    throw err;
  }

  try {
    const decoded = await authAdmin().verifyIdToken(token, true); // ✅ Admin SDK
    return { uid: decoded.uid, email: decoded.email || undefined };
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    // لو التوكن منتهي/غير صالح → 401 واضحة
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = new Error(`INVALID_ID_TOKEN: ${e?.message || e}`) as any;
    err.status = 401;
    throw err;
  }
}
