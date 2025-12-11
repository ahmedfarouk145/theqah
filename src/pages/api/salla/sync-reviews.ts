// src/pages/api/salla/sync-reviews.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { getOwnerAccessToken } from "@/lib/sallaClient";

export const config = { api: { bodyParser: true } };

/**
 * Sync reviews from Salla Reviews API
 * GET /api/salla/sync-reviews?storeUid=salla:12345&productId=1927638714
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { storeUid, productId, page = "1", perPage = "15" } = req.query;

  if (!storeUid || typeof storeUid !== "string") {
    return res.status(400).json({ error: "storeUid is required" });
  }

  try {
    const db = dbAdmin();
    
    // Get store data
    const storeSnap = await db.collection("stores").doc(storeUid).get();
    if (!storeSnap.exists) {
      return res.status(404).json({ error: "Store not found" });
    }

    const storeData = storeSnap.data();
    const merchantId = storeData?.salla?.merchantId || storeUid.replace("salla:", "");

    // Get access token
    const token = await getOwnerAccessToken(storeUid);
    if (!token) {
      return res.status(401).json({ error: "Failed to get access token" });
    }

    // Build Salla API URL
    const baseUrl = "https://api.salla.dev/admin/v2/reviews";
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });

    if (productId && typeof productId === "string") {
      params.append("product_id", productId);
    }

    const url = `${baseUrl}?${params.toString()}`;

    // Fetch reviews from Salla
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Salla Reviews API] Error ${response.status}:`, errorText);
      return res.status(response.status).json({ 
        error: "Failed to fetch reviews from Salla",
        details: errorText 
      });
    }

    const data = await response.json();
    const reviews = data?.data || [];
    const pagination = data?.pagination || {};

    // Process and save reviews
    const savedReviews = [];
    const batch = db.batch();
    let batchCount = 0;

    for (const sallaReview of reviews) {
      // Check if review already exists
      const reviewId = `salla_${merchantId}_${sallaReview.id}`;
      const existingReview = await db.collection("reviews").doc(reviewId).get();

      if (existingReview.exists) {
        console.log(`[Sync] Review ${reviewId} already exists, skipping`);
        continue;
      }

      // Map Salla review to our schema
      const reviewDoc = {
        reviewId,
        storeUid,
        sallaReviewId: String(sallaReview.id),
        source: "salla_native", // ✨ تاج المصدر
        
        // Product info
        productId: String(sallaReview.product_id || ""),
        productName: sallaReview.product?.name || "",
        
        // Review content
        stars: Number(sallaReview.rating || 0),
        text: sallaReview.comment || "",
        
        // Author info
        author: {
          displayName: sallaReview.customer?.name || "عميل سلة",
          email: sallaReview.customer?.email || "",
          mobile: sallaReview.customer?.mobile || "",
        },
        
        // Metadata
        status: sallaReview.status || "approved", // approved, pending, rejected
        trustedBuyer: false, // Salla reviews are NOT from our system
        publishedAt: sallaReview.created_at 
          ? new Date(sallaReview.created_at).getTime() 
          : Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        
        // Salla-specific fields
        sallaData: {
          isVerified: sallaReview.is_verified || false,
          helpful: sallaReview.helpful || 0,
          notHelpful: sallaReview.not_helpful || 0,
        },
      };

      batch.set(db.collection("reviews").doc(reviewId), reviewDoc);
      savedReviews.push(reviewDoc);
      batchCount++;

      // Commit batch every 500 documents (Firestore limit)
      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
      }
    }

    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
    }

    return res.status(200).json({
      ok: true,
      synced: savedReviews.length,
      total: reviews.length,
      pagination,
      reviews: savedReviews,
    });

  } catch (error: any) {
    console.error("[Sync Reviews Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error.message 
    });
  }
}
