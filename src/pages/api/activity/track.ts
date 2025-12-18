/**
 * Activity Tracking API for Client-Side
 * ======================================
 * 
 * Accepts tracking events from client components
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { trackActivity, type ActivityAction } from "@/server/activity-tracker";
import { authAdmin, dbAdmin } from "@/lib/firebaseAdmin";

function getSessionCookie(req: NextApiRequest): string | null {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const validActivityActions: ActivityAction[] = [
  "auth.login",
  "auth.logout",
  "auth.signup",
  "auth.password_reset",
  "dashboard.view",
  "reviews.view",
  "reviews.sync",
  "reviews.approve",
  "reviews.reject",
  "reviews.delete",
  "settings.view",
  "settings.update",
  "widget.install",
  "widget.customize",
  "subscription.view",
  "subscription.upgrade",
  "subscription.cancel",
  "api.call",
  "admin.access",
  "admin.user_view",
  "admin.store_view",
];

function isActivityAction(value: unknown): value is ActivityAction {
  return typeof value === "string" && validActivityActions.includes(value as ActivityAction);
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

    if (!isActivityAction(action)) {
      return res.status(400).json({ error: "action required" });
    }

    // Track the activity
    await trackActivity({
      userId,
      storeUid,
      action,
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
