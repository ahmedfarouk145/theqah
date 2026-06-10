import type { NextApiRequest, NextApiResponse } from "next";
import { LIMITS } from "@/config/constants";
import { log } from "@/lib/logger";
import { RepositoryFactory } from "@/server/repositories";
import { handleApiError } from "@/server/core";
import { sallaTokenService } from "@/server/services/salla-token.service";
import { sallaReviewIdLookupService } from "@/server/services/salla-review-id-lookup.service";
import { pickUniqueMatch } from "@/server/services/salla-review-matcher";

// Single store scan can take ~0.85s/page; nglr7 (~287 pages) ≈ 245s. Allow
// headroom so one large store finishes in a single invocation.
export const config = {
  maxDuration: 600,
};

const MAX_BACKFILL_ATTEMPTS = 5;
// Pages we are willing to scan for one store in a single run. Beyond this the
// candidate set would be incomplete and disambiguation unsafe — such a store
// needs cursor-based resumable paging (no store reaches this today).
const BACKFILL_PAGE_CAP = 320;

/**
 * Cron: backfill `sallaReviewId` for reviews saved from webhooks without it.
 *
 * Design (rewritten 2026-05): Salla's reviews API ignores all filters and its
 * items carry no product field, so we scan each store's list ONCE per run and
 * match every pending review from that single pass. Matching is STRICT
 * (`pickUniqueMatch`) — when one order has several product reviews that can't be
 * told apart (e.g. multiple empty-text, same-rating reviews), we record an
 * attempt and move on rather than guess a wrong-product id. Every outcome —
 * match, no-match, no-token, error, too-large — writes a breadcrumb to the
 * review (or its attempt counter), so failures are visible and bounded instead
 * of looping invisibly forever.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Invalid cron authorization" });
  }

  try {
    const reviewRepo = RepositoryFactory.getReviewRepository();
    const startedAt = Date.now();
    log("info", "backfill-review-ids started", { scope: "cron" });

    const reviewsToBackfill = await reviewRepo.findNeedingSallaId(50);
    if (reviewsToBackfill.length === 0) {
      log("info", "No reviews to backfill", { scope: "cron" });
      return res.status(200).json({ success: true, processed: 0, message: "No reviews to backfill" });
    }

    const results = {
      processed: 0,
      updated: 0,
      gaveUp: 0,
      noToken: 0,
      skippedTooLarge: 0,
      failed: 0,
      errors: [] as Array<{ reviewId: string; error: string }>,
    };

    // Group the batch by store so each store is scanned exactly once.
    const byStore = new Map<string, typeof reviewsToBackfill>();
    for (const review of reviewsToBackfill) {
      const arr = byStore.get(review.storeUid) ?? [];
      arr.push(review);
      byStore.set(review.storeUid, arr);
    }

    for (const [storeUid, storeReviews] of byStore.entries()) {
      // Budget check BETWEEN stores (a single store's scan runs to completion).
      if (Date.now() - startedAt >= LIMITS.SALLA_CRON_LOOKUP_TIME_BUDGET_MS) {
        log("warn", "Stopping backfill early (time budget)", {
          scope: "cron",
          elapsedMs: Date.now() - startedAt,
          remainingStores: Array.from(byStore.keys()).filter((u) => u !== storeUid).length + 1,
        });
        break;
      }

      try {
        const accessToken = await sallaTokenService.getValidAccessToken(storeUid);
        if (!accessToken) {
          // Record an attempt on each review so a token problem is visible and bounded.
          for (const review of storeReviews) {
            const { gaveUp } = await reviewRepo.incrementBackfillAttempt(review.reviewId, MAX_BACKFILL_ATTEMPTS);
            results.noToken++;
            if (gaveUp) results.gaveUp++;
          }
          log("error", `No valid access token for ${storeUid}`, { scope: "cron", storeUid, affected: storeReviews.length });
          continue;
        }

        const targetOrderIds = new Set(storeReviews.map((r) => String(r.orderId)));
        const scan = await sallaReviewIdLookupService.collectCandidatesForOrders({
          accessToken,
          targetOrderIds,
          maxPages: BACKFILL_PAGE_CAP,
        });

        if (scan.reachedCap) {
          // Candidate sets are incomplete — matching could pick the wrong
          // product's review. Skip (no breadcrumb churn) and flag for cursoring.
          results.skippedTooLarge += storeReviews.length;
          log("warn", "Store too large for single-pass backfill — needs cursor paging", {
            scope: "cron", storeUid, totalPages: scan.totalPages, cap: BACKFILL_PAGE_CAP,
          });
          continue;
        }

        log("info", `Scanned ${storeUid}`, {
          scope: "cron", storeUid, pagesScanned: scan.pagesScanned, totalPages: scan.totalPages,
          pendingReviews: storeReviews.length, ordersWithCandidates: scan.candidatesByOrder.size,
        });

        for (const review of storeReviews) {
          results.processed++;
          const candidates = scan.candidatesByOrder.get(String(review.orderId)) ?? [];
          const matchId = pickUniqueMatch(
            { stars: review.stars, text: review.text },
            candidates,
          );

          if (matchId) {
            await reviewRepo.updateSallaId(review.reviewId, matchId);
            results.updated++;
            log("info", `Backfilled ${review.reviewId} -> sallaReviewId ${matchId}`, {
              scope: "cron", reviewId: review.reviewId, sallaReviewId: matchId,
            });
          } else {
            const { gaveUp, attempts } = await reviewRepo.incrementBackfillAttempt(review.reviewId, MAX_BACKFILL_ATTEMPTS);
            if (gaveUp) results.gaveUp++;
            log(gaveUp ? "warn" : "info",
              gaveUp ? `Gave up on ${review.reviewId} after ${attempts} passes (absent or ambiguous in Salla)`
                     : `No unique match for ${review.reviewId} this pass`,
              { scope: "cron", reviewId: review.reviewId, orderId: review.orderId, storeUid, candidates: candidates.length, attempts });
          }
        }
      } catch (error) {
        // Store-level failure: record a breadcrumb on every review (the old cron
        // swallowed this silently, leaving reviews stuck with no trace forever).
        const errorMessage = error instanceof Error ? error.message : String(error);
        for (const review of storeReviews) {
          results.processed++;
          results.failed++;
          results.errors.push({ reviewId: review.reviewId, error: errorMessage });
          await reviewRepo.incrementBackfillAttempt(review.reviewId, MAX_BACKFILL_ATTEMPTS).catch(() => {});
        }
        log("error", `Failed to backfill store ${storeUid}`, { scope: "cron", storeUid, error: errorMessage });
      }
    }

    log("info", "backfill-review-ids completed", { scope: "cron", ...results });
    return res.status(200).json({ success: true, ...results });
  } catch (error) {
    handleApiError(res, error);
  }
}
