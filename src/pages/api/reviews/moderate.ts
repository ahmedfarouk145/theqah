// src/pages/api/reviews/moderate.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { ReviewService } from "@/server/services/review.service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const reviewService = new ReviewService();

  if (req.method === "POST") {
    const { reviewId } = (req.body || {}) as { reviewId?: string };
    if (!reviewId) {
      return res.status(400).json({ ok: false, error: "reviewId_required" });
    }

    const result = await reviewService.moderateSingleReview(reviewId);

    if (!result.ok && result.error === 'not_found') {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    return res.json(result);
  }

  if (req.method === "GET") {
    const result = await reviewService.moderatePendingBatch(20);
    return res.json(result);
  }

  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
