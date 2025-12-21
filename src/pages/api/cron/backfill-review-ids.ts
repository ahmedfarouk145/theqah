import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { log } from "@/lib/logger";

/**
 * Cron job to backfill sallaReviewId for reviews that were saved from webhooks
 * without the review ID (due to Salla's indexing delay).
 * 
 * Schedule: Every 10 minutes via vercel.json
 * 
 * Logic:
 * 1. Query reviews where needsSallaId === true
 * 2. For each review, fetch from Salla API by product_id
 * 3. Match review by orderId + customer email/name + rating
 * 4. Update with sallaReviewId and remove needsSallaId flag
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify cron authorization
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = dbAdmin();
    
    log("info", "backfill-review-ids started", { scope: "cron" });

    // Query reviews that need Salla review ID
    const reviewsToBackfill = await db
      .collection("reviews")
      .where("needsSallaId", "==", true)
      .limit(50) // Process 50 reviews per run to avoid timeout
      .get();

    if (reviewsToBackfill.empty) {
      log("info", "No reviews to backfill", { scope: "cron" });
      return res.status(200).json({ 
        success: true, 
        processed: 0,
        message: "No reviews to backfill"
      });
    }

    const results = {
      processed: 0,
      updated: 0,
      failed: 0,
      errors: [] as Array<{ reviewId: string; error: string }>
    };

    // Process each review
    for (const reviewDoc of reviewsToBackfill.docs) {
      results.processed++;
      const review = reviewDoc.data();
      
      try {
        // Get store access token from owners collection
        const storeUid = review.storeUid;
        const ownerDoc = await db
          .collection("owners")
          .doc(storeUid)
          .get();

        if (!ownerDoc.exists) {
          throw new Error(`Store ${storeUid} not found in owners`);
        }

        const ownerData = ownerDoc.data();
        if (!ownerData?.oauth?.access_token) {
          throw new Error(`No access token for store ${storeUid}`);
        }

        // Fetch reviews from Salla API filtered by product
        const productId = review.productId;
        const apiUrl = `https://api.salla.dev/admin/v2/reviews?products[]=${productId}&per_page=100`;
        
        const sallaResponse = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${ownerData.oauth.access_token}`,
            Accept: "application/json"
          }
        });

        if (!sallaResponse.ok) {
          throw new Error(`Salla API error: ${sallaResponse.status}`);
        }

        const sallaData = await sallaResponse.json() as {
          data?: Array<{ id: number | string; order_id: number | string | null }>;
        };
        
        // Find matching review by orderId
        const matchingReview = sallaData.data?.find((r) => {
          return String(r.order_id) === String(review.orderId);
        });

        if (matchingReview) {
          // Update review with Salla review ID
          await db
            .collection("reviews")
            .doc(reviewDoc.id)
            .update({
              sallaReviewId: String(matchingReview.id),
              needsSallaId: false,
              backfilledAt: new Date().toISOString()
            });

          results.updated++;
          
          log("info", `Backfilled review ${reviewDoc.id} with sallaReviewId ${matchingReview.id}`, { 
            scope: "cron",
            reviewId: reviewDoc.id,
            sallaReviewId: matchingReview.id
          });
        } else {
          // Review not found yet (still indexing), leave flag for next run
          log("info", `Review not found in Salla API yet: ${reviewDoc.id}, order ${review.orderId}`, {
            scope: "cron",
            reviewId: reviewDoc.id,
            orderId: review.orderId
          });
        }

      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.errors.push({
          reviewId: reviewDoc.id,
          error: errorMessage
        });

        log("error", `Failed to backfill review ${reviewDoc.id}`, {
          scope: "cron",
          reviewId: reviewDoc.id,
          error: errorMessage
        });
      }
    }

    log("info", "backfill-review-ids completed", { 
      scope: "cron",
      ...results
    });

    return res.status(200).json({
      success: true,
      ...results
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("error", "backfill-review-ids failed", {
      scope: "cron",
      error: errorMessage
    });

    return res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
}
