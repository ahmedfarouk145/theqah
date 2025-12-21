import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/server/firebase-admin';

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

  if (!reviewDocId || !merchantId || !orderId) {
    console.error('[FETCH_REVIEW_ID] Missing params:', { reviewDocId, merchantId, orderId });
    return res.status(400).json({ 
      error: 'Missing required fields: reviewDocId, merchantId, orderId' 
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
  const merchantIdStr = String(merchantId);
  const orderIdStr = String(orderId);
  
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

      console.log(`[PROCESS] Attempt ${attempt + 1}: Fetching merchant ${merchantIdStr}`);
      
      // Fetch merchant's access token from owners collection
      const storeUid = `salla:${merchantIdStr}`;
      const ownerDoc = await db.collection('owners').doc(storeUid).get();
      if (!ownerDoc.exists) {
        throw new Error(`Store ${storeUid} not found in owners`);
      }

      const ownerData = ownerDoc.data();
      const accessToken = ownerData?.oauth?.access_token;
      if (!accessToken) {
        throw new Error(`No access token for store ${storeUid}`);
      }

      // Fetch reviews from Salla API
      const response = await fetch(
        'https://api.salla.dev/admin/v2/reviews?per_page=100',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Salla API error: ${response.status}`);
      }

      const data = await response.json();
      const reviews = data.data || [];

      // Find review by order_id (string comparison)
      // Only match product reviews (type: 'rating'), not testimonials
      const matchingReview = reviews.find(
        (r: { order_id: string; type?: string }) => {
          const isProductReview = !r.type || r.type === 'rating';
          return isProductReview && String(r.order_id) === orderIdStr;
        }
      );

      if (!matchingReview) {
        throw new Error(`Review not found for order ${orderIdStr} (may not be indexed yet)`);
      }

      console.log(`[PROCESS] Found matching review, updating Firestore doc: ${reviewDocId}`);
      
      // Success! Update Firestore with sallaReviewId
      await db.collection('reviews').doc(reviewDocId).update({
        sallaReviewId: matchingReview.id,
        needsSallaId: false,
        fetchedAt: new Date().toISOString(),
        fetchAttempts: attempt + 1,
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
