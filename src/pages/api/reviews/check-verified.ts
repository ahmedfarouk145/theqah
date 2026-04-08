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

    console.log(`[check-verified] storeId=${storeId} productId=${productIdStr || 'none'} ua=${(req.headers['user-agent'] || '').slice(0, 80)}`);

    const result = await verificationService.getVerifiedReviews(storeId, productIdStr);

    const mapped = result.reviews.map(r => ({
      reviewId: r.reviewId || r.id || null,
      sallaReviewId: r.sallaReviewId || null,
      productId: r.productId || null,
      stars: r.stars,
      verified: r.verified
    }));

    console.log(`[check-verified] storeId=${storeId} productId=${productIdStr || 'none'} → hasVerified=${result.hasVerified} count=${result.count} sallaIds=[${mapped.map(r => r.sallaReviewId).join(',')}]`);

    // Public response: use reviewId for navigation and sallaReviewId for storefront DOM matching
    return res.status(200).json({
      hasVerified: result.hasVerified,
      count: result.count,
      reviews: mapped
    });

  } catch (error) {
    console.error(`[check-verified] ERROR storeId=${storeId} productId=${productId || 'none'}`, error);
    handleApiError(res, error);
  }
}
