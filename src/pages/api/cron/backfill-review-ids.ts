import type { NextApiRequest, NextApiResponse } from "next";
import { log } from "@/lib/logger";
import { RepositoryFactory } from "@/server/repositories";
import { handleApiError, UnauthorizedError } from "@/server/core";

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
    throw new UnauthorizedError("Invalid cron authorization");
  }

  try {
    const reviewRepo = RepositoryFactory.getReviewRepository();
    const ownerRepo = RepositoryFactory.getOwnerRepository();

    log("info", "backfill-review-ids started", { scope: "cron" });

    // Query reviews that need Salla review ID using repository
    const reviewsToBackfill = await reviewRepo.findNeedingSallaId(50);

    if (reviewsToBackfill.length === 0) {
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
    for (const review of reviewsToBackfill) {
      results.processed++;

      try {
        // Get store access token using repository
        const storeUid = review.storeUid;
        const accessToken = await ownerRepo.getAccessToken(storeUid);

        if (!accessToken) {
          throw new Error(`No access token for store ${storeUid}`);
        }

        // Fetch ALL reviews from Salla API (no product filter support)
        const apiUrl = `https://api.salla.dev/admin/v2/reviews?per_page=100`;

        const sallaResponse = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
          }
        });

        if (!sallaResponse.ok) {
          throw new Error(`Salla API error: ${sallaResponse.status}`);
        }

        const sallaData = await sallaResponse.json() as {
          data?: Array<{
            id: number | string;
            order_id: number | string | null;
            type?: string;
          }>;
        };

        // Find matching review by orderId (filter client-side)
        // Only match product reviews (type: 'rating'), not testimonials
        const matchingReview = sallaData.data?.find((r) => {
          const isProductReview = !r.type || r.type === 'rating';
          return isProductReview && String(r.order_id) === String(review.orderId);
        });

        if (matchingReview) {
          // Update review with Salla review ID using repository
          await reviewRepo.updateSallaId(review.reviewId, String(matchingReview.id));

          results.updated++;

          log("info", `Backfilled review ${review.reviewId} with sallaReviewId ${matchingReview.id}`, {
            scope: "cron",
            reviewId: review.reviewId,
            sallaReviewId: matchingReview.id
          });
        } else {
          // Review not found yet (still indexing), leave flag for next run
          log("info", `Review not found in Salla API yet: ${review.reviewId}, order ${review.orderId}`, {
            scope: "cron",
            reviewId: review.reviewId,
            orderId: review.orderId
          });
        }

      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.errors.push({
          reviewId: review.reviewId,
          error: errorMessage
        });

        log("error", `Failed to backfill review ${review.reviewId}`, {
          scope: "cron",
          reviewId: review.reviewId,
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
    handleApiError(res, error);
  }
}
