// src/pages/api/reviews/check-verified.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { rateLimitPublic, RateLimitPresets } from "@/server/rate-limit-public";
import { setCorsHeaders } from "@/server/middleware/cors";
import { VerificationService } from "@/server/services";
import { handleApiError, ValidationError } from "@/server/core";

export const config = { api: { bodyParser: true } };

/**
 * Check if a product/store has verified reviews
 * GET /api/reviews/check-verified?storeId=salla:12345&productId=123
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers for widget access from Salla stores
  setCorsHeaders(req, res, {
    origin: true, // Allow all origins (public endpoint)
    methods: ["GET", "OPTIONS"],
    credentials: false
  });

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Rate limiting - 100 requests per 15 minutes per IP
  const limited = await rateLimitPublic(req, res, {
    ...RateLimitPresets.PUBLIC_MODERATE,
    identifier: "check-verified"
  });
  if (limited) return; // 429 response already sent

  const { storeId, productId } = req.query;

  if (!storeId || typeof storeId !== "string") {
    throw new ValidationError("storeId is required", "storeId");
  }

  try {
    const verificationService = new VerificationService();
    const productIdStr = productId && typeof productId === "string" ? productId : undefined;

    const result = await verificationService.getVerifiedReviews(storeId, productIdStr);

    // Map to existing response format for backward compatibility
    return res.status(200).json({
      hasVerified: result.hasVerified,
      count: result.count,
      reviews: result.reviews.map(r => ({
        sallaReviewId: r.sallaReviewId || null,
        orderId: r.orderId || null,
        productId: r.productId || null,
        stars: r.stars,
        verified: r.verified
      }))
    });

  } catch (error) {
    handleApiError(res, error);
  }
}
