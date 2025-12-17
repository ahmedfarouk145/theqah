/**
 * Activity Tracking API for Client-Side
 * ======================================
 * 
 * Accepts tracking events from client components
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { trackActivity } from "@/server/activity-tracker";
import { authAdmin, dbAdmin } from "@/lib/firebaseAdmin";

function getSessionCookie(req: NextApiRequest): string | null {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get user from session cookie
    const sessionCookie = getSessionCookie(req);
    if (!sessionCookie) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const decodedClaims = await authAdmin().verifySessionCookie(sessionCookie, true);
    const userId = decodedClaims.uid;

    // Get storeUid from user's profile
    let storeUid: string | undefined;
    try {
      const userDoc = await dbAdmin().collection('owners').doc(userId).get();
      storeUid = userDoc.data()?.uid || userId;
    } catch {
      storeUid = userId;
    }

    const { action, metadata } = req.body;

    if (!action || typeof action !== "string") {
      return res.status(400).json({ error: "action required" });
    }

    // Track the activity
    await trackActivity({
      userId,
      storeUid,
      action: action as any,
      metadata,
      req
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[Activity Track API Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
