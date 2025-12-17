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
 * Vercel Cron: 0 star/6 star star star (every 6 hours)
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
        // Get subscription info for verification
        const subscription = storeData.subscription || {};
        const subscriptionStart = subscription.startedAt || 0;

        // Get access token
        const token = await getOwnerAccessToken(db, storeUid);
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

        // Save all reviews (unlimited plan - verify only post-subscription)
        const merchantId = storeData?.salla?.merchantId || storeUid.replace("salla:", "");
        const batch = db.batch();
        let saved = 0;
        let verified = 0;

        // ✅ Batch query for existing reviews (optimize reads)
        const reviewIds = reviews.map((r: { id: string | number }) => `salla_${merchantId}_${r.id}`);
        const existingReviewsSnap = await db.collection("reviews")
          .where("__name__", "in", reviewIds.slice(0, 10)) // Firestore limit: 10 per query
          .get();
        
        const existingSet = new Set(existingReviewsSnap.docs.map(d => d.id));

        for (const sallaReview of reviews) {
          const reviewId = `salla_${merchantId}_${sallaReview.id}`;
          
          // Skip if already exists (in-memory check - no read cost)
          if (existingSet.has(reviewId)) {
            continue;
          }

          // Check if review was created after subscription (for verification)
          const reviewDate = sallaReview.created_at 
            ? new Date(sallaReview.created_at).getTime() 
            : 0;
          const isVerified = subscriptionStart > 0 && reviewDate >= subscriptionStart;
          if (isVerified) verified++;

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
            verified: isVerified, // ✨ معتمد فقط إذا جاء بعد الاشتراك
            publishedAt: reviewDate || Date.now(),
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

        // Update sync statistics
        await db.collection("stores").doc(storeUid).update({
          "salla.lastReviewsSyncAt": Date.now(),
          "salla.lastReviewsSyncCount": saved,
          "salla.totalReviewsSynced": (storeData?.salla?.totalReviewsSynced || 0) + saved,
        }).catch((updateError) => {
          console.error(`[Cron] Failed to update store stats for ${storeUid}:`, updateError);
        });

        totalSynced += saved;
        results.push({ 
          storeUid, 
          synced: saved, 
          verified: verified,
          total: reviews.length 
        });

      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Cron] Error syncing ${storeUid}:`, errorMsg);
        totalErrors++;
        results.push({ storeUid, error: errorMsg });
      }
    }

    // Calculate quota usage estimation
    const estimatedReads = storesSnap.size + totalSynced + (storesSnap.size * 2); // stores + batch queries + updates
    const estimatedWrites = totalSynced + storesSnap.size; // reviews + sync stats

    // Log sync result to Firestore for monitoring
    await db.collection("syncLogs").add({
      timestamp: Date.now(),
      source: "vercel-cron",
      totalStores: storesSnap.size,
      totalSynced,
      totalErrors,
      quotaUsage: {
        reads: estimatedReads,
        writes: estimatedWrites
      },
      results: results.slice(0, 10) // Store first 10 for debugging
    }).catch(err => console.error("Failed to log sync:", err));

    return res.status(200).json({
      ok: true,
      totalStores: storesSnap.size,
      totalSynced,
      totalErrors,
      results,
      timestamp: Date.now(),
      quotaEstimate: {
        reads: estimatedReads,
        writes: estimatedWrites,
        note: "Actual usage may vary. Free tier: 50K reads, 20K writes/day"
      }
    });

  } catch (error: unknown) {
    console.error("[Cron Sync Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
