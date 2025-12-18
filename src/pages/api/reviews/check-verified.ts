// src/pages/api/reviews/check-verified.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { rateLimitPublic, RateLimitPresets } from "@/server/rate-limit-public";
import { setCorsHeaders } from "@/server/middleware/cors";

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
    return res.status(400).json({ error: "storeId is required" });
  }

  try {
    const db = dbAdmin();
    
    // Build query
    let query = db.collection("reviews")
      .where("storeUid", "==", storeId)
      .where("source", "==", "salla_native")
      .where("verified", "==", true)
      .where("status", "==", "approved");

    // Filter by product if provided
    if (productId && typeof productId === "string") {
      query = query.where("productId", "==", productId);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      return res.status(200).json({
        hasVerified: false,
        count: 0,
        reviews: []
      });
    }

    // Return verified review IDs for logo placement
    // Support both sallaReviewId (new) and orderId+productId (fallback)
    const reviews = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        sallaReviewId: data.sallaReviewId || null,
        orderId: data.orderId || null,
        productId: data.productId || null,
        stars: data.stars,
        verified: data.verified
      };
    });

    return res.status(200).json({
      hasVerified: true,
      count: reviews.length,
      reviews
    });

  } catch (error: unknown) {
    console.error("[Check Verified Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
