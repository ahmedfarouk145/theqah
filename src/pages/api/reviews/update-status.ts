// src/pages/api/reviews/update-status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { getAuth } from "firebase-admin/auth";

type RequestBody = {
  reviewId: string;
  status: "approved" | "rejected";
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const token = authHeader.substring(7);
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);
    const storeUid = decodedToken.uid;

    if (!storeUid) {
      return res.status(401).json({ error: "invalid_token" });
    }

    const body = req.body as RequestBody;
    const { reviewId, status } = body;

    if (!reviewId || !status) {
      return res.status(400).json({ error: "missing_fields" });
    }

    if (status !== "approved" && status !== "rejected") {
      return res.status(400).json({ error: "invalid_status" });
    }

    const db = dbAdmin();
    const reviewRef = db.collection("reviews").doc(reviewId);
    const reviewSnap = await reviewRef.get();

    if (!reviewSnap.exists) {
      return res.status(404).json({ error: "review_not_found" });
    }

    const reviewData = reviewSnap.data();

    // Verify the review belongs to this store
    if (reviewData?.storeUid !== storeUid) {
      return res.status(403).json({ error: "forbidden" });
    }

    // Update the review status
    const now = Date.now();
    const updates: Record<string, unknown> = {
      status,
      updatedAt: now,
    };

    if (status === "approved") {
      updates.published = true;
      updates.publishedAt = now;
    } else {
      updates.published = false;
      updates.publishedAt = null;
    }

    await reviewRef.set(updates, { merge: true });

    console.log(`[update-status] Review ${reviewId} status updated to ${status} by store ${storeUid}`);

    return res.status(200).json({
      ok: true,
      reviewId,
      status,
    });
  } catch (error) {
    console.error("[update-status] Error:", error);
    return res.status(500).json({ error: "internal_error" });
  }
}
