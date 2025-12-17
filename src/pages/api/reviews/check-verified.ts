// src/pages/api/reviews/check-verified.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export const config = { api: { bodyParser: true } };

/**
 * Check if a product/store has verified reviews
 * GET /api/reviews/check-verified?storeId=salla:12345&productId=123
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
    const reviews = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        sallaReviewId: data.sallaReviewId,
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
