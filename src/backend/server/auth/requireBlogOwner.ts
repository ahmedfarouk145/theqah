// src/backend/server/auth/requireBlogOwner.ts
import type { NextApiRequest } from "next";
import { authAdmin } from "@/lib/firebaseAdmin";

// The single email allowed to manage the blog. Hardcoded intentionally —
// change this value and redeploy to transfer ownership.
const BLOG_OWNER_EMAIL = "abuyzzn@yahoo.com";

export async function requireBlogOwner(
    req: NextApiRequest
): Promise<{ uid: string; email: string }> {
    const authz = req.headers.authorization || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    const token = m?.[1];

    if (!token) {
        throw new Error("unauthenticated: missing bearer");
    }

    const decoded = await authAdmin().verifyIdToken(token);
    const email = decoded.email ?? "";

    if (!email || email.toLowerCase() !== BLOG_OWNER_EMAIL.toLowerCase()) {
        throw new Error("forbidden: not blog owner");
    }

    return { uid: decoded.uid, email };
}
