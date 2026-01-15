// src/pages/api/reviews/update-status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { ReviewService } from "@/server/services/review.service";

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

    const reviewService = new ReviewService();
    const result = await reviewService.updateReviewStatus(reviewId, storeUid, status);

    if (!result.ok) {
      const statusCode = result.error === 'review_not_found' ? 404 :
        result.error === 'forbidden' ? 403 : 500;
      return res.status(statusCode).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("[update-status] Error:", error);
    return res.status(500).json({ error: "internal_error" });
  }
}
