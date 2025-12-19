import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

/**
 * Export reviews collection for debugging
 * GET /api/admin/export-reviews
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = dbAdmin();
    
    const reviewsSnapshot = await db.collection('reviews').get();
    
    const reviews = reviewsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const summary = {
      total: reviews.length,
      withNeedsSallaId: reviews.filter((r) => (r as Record<string, unknown>).needsSallaId).length,
      withSallaReviewId: reviews.filter((r) => (r as Record<string, unknown>).sallaReviewId).length,
      verified: reviews.filter((r) => (r as Record<string, unknown>).verified).length,
      sallaNative: reviews.filter((r) => (r as Record<string, unknown>).source === 'salla_native').length
    };

    return res.status(200).json({
      success: true,
      summary,
      reviews
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
}
