import type { NextApiRequest, NextApiResponse } from "next";
import { ReviewService, type SubmitReviewInput } from "@/server/services/review.service";
import { rateLimitPublic, RateLimitPresets } from "@/server/rate-limit-public";
import { handleApiError } from "@/server/core/error-handler";

type ReviewBody = {
  orderId?: string;
  stars?: number;
  text?: string;
  images?: string[];
  tokenId?: string;
  platform?: "salla" | "zid" | "manual" | "web";
  authorName?: string | null;
  authorShowName?: boolean;
};

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isImagesArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((u) => typeof u === "string" && u.length > 0);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  // C6: Rate limit write endpoint - 20 requests per 5 minutes per IP
  const limited = await rateLimitPublic(req, res, {
    ...RateLimitPresets.WRITE_STRICT,
    identifier: "reviews-submit",
    message: "Too many review submissions. Please wait a few minutes.",
  });
  if (limited) return;

  try {
    const body: ReviewBody =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { orderId, stars, text, images, tokenId, platform, authorName, authorShowName } = body;

    // Validate required fields
    if (!isNonEmptyString(orderId)) return res.status(400).json({ error: "missing_orderId" });
    const s = Number(stars);
    if (!Number.isFinite(s) || s < 1 || s > 5) return res.status(400).json({ error: "invalid_stars" });
    if (images !== undefined && !isImagesArray(images)) return res.status(400).json({ error: "images_must_be_array" });

    // Build input for service
    const input: SubmitReviewInput = {
      orderId,
      stars: s,
      text: isNonEmptyString(text) ? text : undefined,
      images: isImagesArray(images) ? images : undefined,
      tokenId: isNonEmptyString(tokenId) ? tokenId : undefined,
      platform: platform || "web",
      authorName,
      authorShowName,
    };

    // Call service
    const reviewService = new ReviewService();
    const result = await reviewService.submitReview(input);

    if (!result.ok) {
      // Map error codes to HTTP status codes
      const statusMap: Record<string, number> = {
        'TOKEN_NOT_FOUND': 400,
        'TOKEN_ALREADY_USED': 409,
        'TOKEN_EXPIRED': 410,
        'TOKEN_VOIDED': 410,
        'TOKEN_ORDER_MISMATCH': 400,
        'DUPLICATE_REVIEW': 409,
        'INVALID_STARS': 400,
        'INVALID_TOKEN': 400,
      };
      const status = statusMap[result.code || ''] || 500;
      return res.status(status).json({ error: result.code?.toLowerCase() || 'error' });
    }

    return res.status(201).json({
      ok: true,
      id: result.data!.reviewId,
      published: result.data!.published,
      moderation: result.data!.moderation,
    });
  } catch (e: unknown) {
    // C5: Centralized error handling
    handleApiError(res, e);
  }
}

