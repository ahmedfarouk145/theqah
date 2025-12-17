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
    if (!storeData) {
      return res.status(404).json({ error: "Store data not found" });
    }
    
    const merchantId = storeData?.salla?.merchantId || storeUid.replace("salla:", "");

    // Get access token
    const token = await getOwnerAccessToken(db, storeUid);
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

    // Get subscription info for verification
    const subscription = storeData.subscription || {};
    const subscriptionStart = subscription.startedAt || 0;

    // ✅ Batch query for existing reviews (optimize reads)
    const reviewIds = reviews.map((r: { id: string | number }) => String(r.id));
    const existingReviewsSnap = await db.collection("reviews")
      .where("storeUid", "==", storeUid)
      .where("sallaReviewId", "in", reviewIds.slice(0, 10)) // Firestore limit: 10 per query
      .get();
    
    const existingSet = new Set(existingReviewsSnap.docs.map(d => d.data().sallaReviewId));

    // Process and save reviews (unlimited sync, verify only post-subscription)
    const savedReviews = [];
    const batch = db.batch();
    let batchCount = 0;

    for (const sallaReview of reviews) {
      const reviewId = `salla_${merchantId}_${sallaReview.id}`;
      
      // Skip if already exists (in-memory check - no read cost)
      if (existingSet.has(String(sallaReview.id))) {
        console.log(`[Sync] Review ${reviewId} already exists, skipping`);
        continue;
      }

      // Check if review was created after subscription (for verification)
      const reviewDate = sallaReview.created_at 
        ? new Date(sallaReview.created_at).getTime() 
        : 0;
      const isVerified = subscriptionStart > 0 && reviewDate >= subscriptionStart;

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
        status: sallaReview.status || "approved",
        trustedBuyer: false, // Salla reviews are not from our invite system
        verified: isVerified, // ✨ معتمد فقط إذا جاء بعد الاشتراك
        publishedAt: reviewDate || Date.now(),
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

    // Update sync statistics
    if (savedReviews.length > 0) {
      await db.collection("stores").doc(storeUid).update({
        "salla.lastReviewsSyncAt": Date.now(),
        "salla.lastReviewsSyncCount": savedReviews.length,
        "salla.totalReviewsSynced": (storeData?.salla?.totalReviewsSynced || 0) + savedReviews.length,
      }).catch(() => {}); // Silent fail
    }

    // Calculate quota usage
    const quotaReads = existingReviewsSnap.size + 1; // batch query + store doc
    const quotaWrites = savedReviews.length + (savedReviews.length > 0 ? 1 : 0); // reviews + stats update

    return res.status(200).json({
      ok: true,
      synced: savedReviews.length,
      total: reviews.length,
      pagination,
      reviews: savedReviews,
      quotaUsage: {
        reads: quotaReads,
        writes: quotaWrites
      }
    });

  } catch (error: unknown) {
    console.error("[Sync Reviews Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
