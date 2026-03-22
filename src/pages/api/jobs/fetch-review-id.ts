import type { NextApiRequest, NextApiResponse } from 'next';
import { LIMITS } from '@/config/constants';
import { getDb } from '@/server/firebase-admin';
import type { Review } from '@/server/core/types';
import { sallaTokenService } from '@/server/services/salla-token.service';
import { sallaReviewIdLookupService } from '@/server/services/salla-review-id-lookup.service';

// Allow longer execution time for retries (Pro plan: 300s, Hobby: 10s)
export const config = {
  maxDuration: 300,
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Security: Only allow POST requests with CRON_SECRET
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Debug: Log received body
  console.log('[FETCH_REVIEW_ID] Received body:', JSON.stringify(req.body));

  const { reviewDocId, merchantId, orderId } = req.body;

  console.log('[FETCH_REVIEW_ID] Parsed params:', { reviewDocId, merchantId, orderId });

  if (!reviewDocId) {
    console.error('[FETCH_REVIEW_ID] Missing params:', { reviewDocId, merchantId, orderId });
    return res.status(400).json({
      error: 'Missing required field: reviewDocId'
    });
  }

  // Fire-and-forget: Return 202 immediately
  res.status(202).json({
    message: 'Job accepted, processing in background',
    reviewDocId
  });

  // Continue processing in background
  try {
    await processReviewIdFetch(reviewDocId, merchantId, orderId);
  } catch (error) {
    console.error('Background job failed:', error);
    // Error is logged but not returned to client (already responded)
  }
}

async function processReviewIdFetch(
  reviewDocId: string,
  merchantId: string | number,
  orderId: string | number
) {
  console.log('[PROCESS] Starting with params:', { reviewDocId, merchantId, orderId });

  // Convert to strings for consistency
  const merchantIdStr = merchantId ? String(merchantId) : '';
  const orderIdStr = orderId ? String(orderId) : '';

  const db = getDb();
  const retryDelays = [5000, 10000, 15000]; // 5s, 10s, 15s
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    try {
      // Wait before retry (skip on first attempt)
      if (attempt > 0) {
        await sleep(retryDelays[attempt - 1]);
        console.log(`Retry attempt ${attempt + 1} for review ${reviewDocId}`);
      }

      const reviewDoc = await db.collection('reviews').doc(reviewDocId).get();
      if (!reviewDoc.exists) {
        throw new Error(`Review ${reviewDocId} not found`);
      }

      const reviewData = reviewDoc.data() as Partial<Review> | undefined;
      const storeUid = typeof reviewData?.storeUid === 'string' && reviewData.storeUid
        ? reviewData.storeUid
        : (merchantIdStr ? `salla:${merchantIdStr}` : '');
      const resolvedOrderId = typeof reviewData?.orderId === 'string' && reviewData.orderId
        ? reviewData.orderId
        : orderIdStr;

      if (!storeUid || !resolvedOrderId) {
        throw new Error(`Missing review lookup context for ${reviewDocId}`);
      }

      console.log(`[PROCESS] Attempt ${attempt + 1}: Fetching store ${storeUid}`);

      const accessToken = await sallaTokenService.getValidAccessToken(storeUid);
      if (!accessToken) {
        throw new Error(`No access token for store ${storeUid}`);
      }

      const lookupResult = await sallaReviewIdLookupService.findMatchesForStoreReviews({
        accessToken,
        storeUid,
        reviews: [{
          reviewId: reviewDocId,
          orderId: resolvedOrderId,
          productId: reviewData?.productId,
          stars: reviewData?.stars,
          text: reviewData?.text,
        }],
        // Fresh webhook reviews should surface near the first pages.
        // Deep backlog scans are handled by the cron path.
        maxPages: LIMITS.RECENT_SALLA_REVIEW_LOOKUP_PAGES,
      });
      const matchingReview = lookupResult.matches.get(reviewDocId);

      if (!matchingReview) {
        console.log(
          `[PROCESS] Review ${reviewDocId} not found within ${lookupResult.pagesScanned} pages; leaving for cron backfill`
        );

        if (attempt === retryDelays.length - 1) {
          await db.collection('reviews').doc(reviewDocId).update({
            fetchFailed: false,
            fetchError: null,
            fetchAttempts: attempt + 1,
            lastFetchAttempt: new Date().toISOString(),
          });
          console.log(`[PROCESS] Deferred deep pagination to cron for ${reviewDocId}`);
          return;
        }

        continue;
      }

      console.log(`[PROCESS] Found matching review, updating Firestore doc: ${reviewDocId}`);

      // Success! Update Firestore with sallaReviewId
      await db.collection('reviews').doc(reviewDocId).update({
        sallaReviewId: matchingReview.sallaReviewId,
        needsSallaId: false,
        verified: true,
        backfilledAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        fetchAttempts: attempt + 1,
        fetchFailed: false,
        fetchError: null,
      });

      console.log(`✅ Successfully fetched review ID for ${reviewDocId} on attempt ${attempt + 1}`);
      return; // Success, exit function

    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt + 1} failed:`, error);
      console.error(`[PROCESS] Error details - reviewDocId: "${reviewDocId}", type: ${typeof reviewDocId}`);

      // If this is the last attempt, mark as failed
      if (attempt === retryDelays.length - 1) {
        console.log(`[PROCESS] Final attempt failed, marking doc as failed: ${reviewDocId}`);
        await db.collection('reviews').doc(reviewDocId).update({
          fetchFailed: true,
          fetchError: lastError.message,
          fetchAttempts: attempt + 1,
          lastFetchAttempt: new Date().toISOString(),
        });
        console.error(`❌ All attempts failed for ${reviewDocId}`);
      }
    }
  }
}
