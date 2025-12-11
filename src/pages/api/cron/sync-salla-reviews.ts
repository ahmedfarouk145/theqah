// src/pages/api/cron/sync-salla-reviews.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { getOwnerAccessToken } from "@/lib/sallaClient";

export const config = { 
  api: { bodyParser: true },
  maxDuration: 300 // 5 minutes for Vercel Pro
};

/**
 * Cron job to sync reviews from all Salla stores
 * Vercel Cron: 0 */6 * * * (every 6 hours)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify cron secret
  const cronSecret = req.headers["x-vercel-cron-secret"] || req.headers["authorization"];
  const expectedSecret = process.env.CRON_SECRET || process.env.SALLA_WEBHOOK_SECRET;
  
  if (cronSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = dbAdmin();
    
    // Get all Salla stores
    const storesSnap = await db.collection("stores")
      .where("provider", "==", "salla")
      .where("salla.connected", "==", true)
      .get();

    const results = [];
    let totalSynced = 0;
    let totalErrors = 0;

    for (const storeDoc of storesSnap.docs) {
      const storeUid = storeDoc.id;
      const storeData = storeDoc.data();

      try {
        // Check subscription
        const subscription = storeData.subscription || {};
        if (!subscription.startedAt) {
          console.log(`[Cron] Store ${storeUid} has no active subscription, skipping`);
          continue;
        }

        // Get access token
        const token = await getOwnerAccessToken(storeUid);
        if (!token) {
          console.error(`[Cron] Failed to get token for ${storeUid}`);
          totalErrors++;
          continue;
        }

        // Fetch reviews from Salla (first page only for cron)
        const response = await fetch(
          "https://api.salla.dev/admin/v2/reviews?per_page=50",
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          console.error(`[Cron] Salla API error for ${storeUid}:`, response.status);
          totalErrors++;
          continue;
        }

        const data = await response.json();
        const reviews = data?.data || [];

        // Filter reviews by subscription start date
        const subscriptionStart = subscription.startedAt;
        const filteredReviews = reviews.filter((r: any) => {
          const reviewDate = r.created_at ? new Date(r.created_at).getTime() : 0;
          return reviewDate >= subscriptionStart;
        });

        // Check quota
        const merchantId = storeData?.salla?.merchantId || storeUid.replace("salla:", "");
        const existingCount = await db.collection("reviews")
          .where("storeUid", "==", storeUid)
          .where("source", "==", "salla_native")
          .count()
          .get();

        const currentCount = existingCount.data().count;
        const limit = subscription.limit || 120;
        const available = Math.max(0, limit - currentCount);

        if (available === 0) {
          console.log(`[Cron] Store ${storeUid} reached quota limit`);
          results.push({ storeUid, synced: 0, reason: "quota_exhausted" });
          continue;
        }

        // Save reviews (up to quota)
        const reviewsToSave = filteredReviews.slice(0, available);
        const batch = db.batch();
        let saved = 0;

        for (const sallaReview of reviewsToSave) {
          const reviewId = `salla_${merchantId}_${sallaReview.id}`;
          const existingReview = await db.collection("reviews").doc(reviewId).get();

          if (existingReview.exists) {
            continue;
          }

          const reviewDoc = {
            reviewId,
            storeUid,
            sallaReviewId: String(sallaReview.id),
            source: "salla_native",
            productId: String(sallaReview.product_id || ""),
            productName: sallaReview.product?.name || "",
            stars: Number(sallaReview.rating || 0),
            text: sallaReview.comment || "",
            author: {
              displayName: sallaReview.customer?.name || "عميل سلة",
              email: sallaReview.customer?.email || "",
              mobile: sallaReview.customer?.mobile || "",
            },
            status: sallaReview.status || "approved",
            trustedBuyer: false,
            publishedAt: sallaReview.created_at 
              ? new Date(sallaReview.created_at).getTime() 
              : Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            sallaData: {
              isVerified: sallaReview.is_verified || false,
              helpful: sallaReview.helpful || 0,
              notHelpful: sallaReview.not_helpful || 0,
            },
          };

          batch.set(db.collection("reviews").doc(reviewId), reviewDoc);
          saved++;
        }

        if (saved > 0) {
          await batch.commit();
        }

        totalSynced += saved;
        results.push({ storeUid, synced: saved, available, filtered: filteredReviews.length });

      } catch (error: any) {
        console.error(`[Cron] Error syncing ${storeUid}:`, error.message);
        totalErrors++;
        results.push({ storeUid, error: error.message });
      }
    }

    return res.status(200).json({
      ok: true,
      totalStores: storesSnap.size,
      totalSynced,
      totalErrors,
      results,
      timestamp: Date.now(),
    });

  } catch (error: any) {
    console.error("[Cron Sync Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error.message 
    });
  }
}
