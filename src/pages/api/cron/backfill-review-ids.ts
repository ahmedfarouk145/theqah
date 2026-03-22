import type { NextApiRequest, NextApiResponse } from "next";
import { LIMITS } from "@/config/constants";
import { log } from "@/lib/logger";
import { RepositoryFactory } from "@/server/repositories";
import { handleApiError } from "@/server/core";
import { sallaTokenService } from "@/server/services/salla-token.service";
import { sallaReviewIdLookupService } from "@/server/services/salla-review-id-lookup.service";

export const config = {
  maxDuration: 300,
};

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
    return res.status(401).json({ error: "Invalid cron authorization" });
  }

  try {
    const reviewRepo = RepositoryFactory.getReviewRepository();
    const startedAt = Date.now();

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

    const reviewsByStore = new Map<string, typeof reviewsToBackfill>();
    for (const review of reviewsToBackfill) {
      const existing = reviewsByStore.get(review.storeUid) ?? [];
      existing.push(review);
      reviewsByStore.set(review.storeUid, existing);
    }

    for (const [storeUid, storeReviews] of reviewsByStore.entries()) {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= LIMITS.SALLA_CRON_LOOKUP_TIME_BUDGET_MS) {
        log("warn", "Stopping backfill-review-ids early due to cron time budget", {
          scope: "cron",
          elapsedMs,
          timeBudgetMs: LIMITS.SALLA_CRON_LOOKUP_TIME_BUDGET_MS,
          remainingStores: Array.from(reviewsByStore.keys()).filter((uid) => uid !== storeUid).length + 1,
        });
        break;
      }

      try {
        const accessToken = await sallaTokenService.getValidAccessToken(storeUid);
        if (!accessToken) {
          throw new Error(`No valid access token for store ${storeUid}`);
        }

        const lookupResult = await sallaReviewIdLookupService.findMatchesForStoreReviews({
          accessToken,
          storeUid,
          reviews: storeReviews.map((review) => ({
            reviewId: review.reviewId,
            orderId: review.orderId,
            productId: review.productId,
            stars: review.stars,
            text: review.text,
          })),
        });

        log("info", `Scanned Salla reviews for ${storeUid}`, {
          scope: "cron",
          storeUid,
          pagesScanned: lookupResult.pagesScanned,
          totalPages: lookupResult.totalPages,
          totalRemote: lookupResult.totalRemote,
          reachedMaxPages: lookupResult.reachedMaxPages,
          pendingReviews: storeReviews.length,
          matchedReviews: lookupResult.matches.size,
        });

        for (const review of storeReviews) {
          results.processed++;
          const matchingReview = lookupResult.matches.get(review.reviewId);

          if (!matchingReview) {
            log("info", `Review not found in Salla API after pagination: ${review.reviewId}, order ${review.orderId}`, {
              scope: "cron",
              reviewId: review.reviewId,
              orderId: review.orderId,
              storeUid,
              pagesScanned: lookupResult.pagesScanned,
            });
            continue;
          }

          try {
            await reviewRepo.updateSallaId(review.reviewId, matchingReview.sallaReviewId);
            results.updated++;

            log("info", `Backfilled review ${review.reviewId} with sallaReviewId ${matchingReview.sallaReviewId}`, {
              scope: "cron",
              reviewId: review.reviewId,
              sallaReviewId: matchingReview.sallaReviewId,
              pageFound: matchingReview.pageFound,
            });
          } catch (error) {
            results.failed++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            results.errors.push({
              reviewId: review.reviewId,
              error: errorMessage,
            });

            log("error", `Failed to update review ${review.reviewId} after Salla match`, {
              scope: "cron",
              reviewId: review.reviewId,
              error: errorMessage,
            });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        for (const review of storeReviews) {
          results.processed++;
          results.failed++;
          results.errors.push({
            reviewId: review.reviewId,
            error: errorMessage,
          });

          log("error", `Failed to backfill review ${review.reviewId}`, {
            scope: "cron",
            reviewId: review.reviewId,
            error: errorMessage,
          });
        }
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
