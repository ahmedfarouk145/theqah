# Problem: Salla Reviews Not Found in API - Need Investigation

## Context
We're integrating Salla reviews into our platform. When a review is created via Salla webhook (`review.added`), we save it to Firestore with `needsSallaId: true` flag, then a cron job tries to fetch the `sallaReviewId` from Salla API.

## Current Issue
The cron job successfully queries Salla API (authentication works), but returns **0 matching reviews** for all stored order IDs. 

**Latest Cron Logs (2025-12-21 16:00 UTC):**
```
Review not found in Salla API yet: salla_982747175_order_225136883_product_1927638714, order 225136883
Review not found in Salla API yet: salla_982747175_order_1289968575_product_1927638714, order 1289968575
Review not found in Salla API yet: salla_982747175_order_1553897648_product_1927638714, order 1553897648
Review not found in Salla API yet: salla_982747175_order_662847033_product_1927638714, order 662847033
Review not found in Salla API yet: salla_982747175_order_712846334_product_1927638714, order 712846334
Review not found in Salla API yet: salla_982747175_order_785141541_product_1927638714, order 785141541

Result: processed=6, updated=0, failed=0, errors=[]
```

## What We've Tried

### 1. ✅ Fixed OAuth Token Location
- **Problem:** Code was looking in wrong Firestore collection (`salla_tokens`)
- **Fix:** Updated to use `owners.oauth.access_token` where tokens are actually stored
- **Commit:** `0a1faab`
- **Result:** Token retrieval now works, no more "Store not found" errors

### 2. ✅ Fixed Order ID Extraction from Webhook
- **Problem:** Webhook was saving internal `id` instead of visible order number
- **Discovery:** Webhook payload has:
  - `id: 1571170460` (internal ID - WRONG)
  - `reference_id: 225134137` (visible order number - CORRECT ✓)
- **Fix:** Updated webhook to use `order.reference_id` instead of `order.id`
- **Commit:** `32b8735`
- **Result:** New reviews should now save correct order IDs

### 3. ✅ Removed Unsupported Product Filter
- **Problem:** Code was using `?products[]=${productId}` filter
- **Discovery:** Salla API documentation shows NO support for product filtering
- **Fix:** Changed to fetch all reviews: `GET /admin/v2/reviews?per_page=100`
- **Commit:** `d2ec5c0`
- **Result:** API queries now work but still find no matching reviews

### 4. ✅ Added Client-Side Filtering
- **Added:** Filter by `type='rating'` (product reviews only, not testimonials)
- **Added:** String comparison for `order_id` matching

## Current Implementation

### Cron Job Code (`src/pages/api/cron/backfill-review-ids.ts`)
```typescript
// Get access token from owners collection
const ownerDoc = await db.collection("owners").doc(storeUid).get();
const ownerData = ownerDoc.data();
const accessToken = ownerData?.oauth?.access_token;

// Fetch ALL reviews from Salla API (no product filter support)
const apiUrl = `https://api.salla.dev/admin/v2/reviews?per_page=100`;
const sallaResponse = await fetch(apiUrl, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json"
  }
});

const sallaData = await sallaResponse.json();

// Find matching review by order_id (filter client-side)
// Only match product reviews (type: 'rating'), not testimonials
const matchingReview = sallaData.data?.find((r) => {
  const isProductReview = !r.type || r.type === 'rating';
  return isProductReview && String(r.order_id) === String(review.orderId);
});

if (matchingReview) {
  // Update Firestore with sallaReviewId
  await db.collection("reviews").doc(reviewDoc.id).update({
    sallaReviewId: String(matchingReview.id),
    needsSallaId: false,
    backfilledAt: new Date().toISOString()
  });
} else {
  console.log(`Review not found in Salla API yet: ${reviewDoc.id}, order ${review.orderId}`);
}
```

### Webhook Handler (`src/pages/api/salla/webhook.ts`)
```typescript
// Extract order data from review.added webhook
const reviewData = dataRaw as Record<string, unknown>;
const product = reviewData.product as Record<string, unknown> | undefined;
const order = reviewData.order as Record<string, unknown> | undefined;

// Use reference_id (visible order number) instead of id (internal ID)
const orderId = order?.reference_id || order?.id;
const productId = product?.id;

// Save to Firestore
const docId = `salla_${merchantId}_order_${orderId}_product_${productId}`;
await db.collection("reviews").doc(docId).set({
  reviewId: docId,
  storeUid,
  orderId: String(orderId),
  productId: String(productId),
  // ... other fields
  needsSallaId: true, // Flag for background processing
});
```

## Critical Discovery: Data Mismatch

### Reviews in Salla Admin Dashboard
Merchant confirmed these reviews exist:
- Order #225113730 (1 hour ago) ✅
- Order #224890908 (1 day ago) ✅
- Order #224885269 (1 day ago) ✅
- Order #224881566 (1 day ago) ✅

### Reviews in Our Firestore
```
Total reviews: 6
With needsSallaId: 5
With sallaReviewId: 0

Order IDs in Firestore:
- 1289968575 ❌
- 1553897648 ❌
- 225136883 ❌ (new, from recent test)
- 662847033 ❌
- 712846334 ❌
- 785141541 ❌
```

**Problem:** The order numbers DON'T MATCH! Our Firestore has completely different order IDs than what's shown in Salla admin.

## Key Questions

### 1. Are `review.added` Webhooks Being Sent?
- ✅ We see `order.created` webhooks in logs (example: order 225134137 at 13:19 UTC)
- ❌ We DON'T see `review.added` webhooks in logs for any of the reviews visible in Salla admin
- **Question:** Is Salla actually sending `review.added` webhooks? Or do we need to enable them?

### 2. What's the Source of Old Review Data?
The reviews in Firestore (orders 1289968575, 1553897648, etc.) don't match any reviews in Salla admin:
- Are these from test webhooks?
- Are these old reviews that were deleted from Salla?
- Were these created before we fixed the order ID extraction?

### 3. Webhook Configuration
**Need to verify in Salla Partners Portal:**
- Is `review.added` event enabled in webhook settings?
- What's the configured webhook URL?
- Are there any failed webhook deliveries shown?
- Settings URL: `https://s.salla.sa/settings/webhooks`

### 4. API Response Structure
**Need to see actual API response to debug:**
- What does `GET /admin/v2/reviews` actually return?
- Does `order_id` field exist in the response?
- Is it the `reference_id` or internal `id`?
- Are the reviews even present in the API?

## Diagnostic Steps Needed

### 1. Create Test Script to Dump API Response
```javascript
// scripts/test-salla-api.mjs
const ownerDoc = await db.collection('owners').doc('salla:982747175').get();
const accessToken = ownerDoc.data()?.oauth?.access_token;

const response = await fetch('https://api.salla.dev/admin/v2/reviews?per_page=100', {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json'
  }
});

const data = await response.json();
console.log('Total reviews from API:', data.data?.length || 0);
console.log('Sample review structure:', JSON.stringify(data.data[0], null, 2));
console.log('\nAll order_ids in API:', data.data.map(r => r.order_id));
```

### 2. Check Webhook Logs
Search Vercel logs for:
- Pattern: `review.added` 
- Pattern: `"event":"review.added"`
- Time range: Last 48 hours
- Expected: Should see webhooks when reviews are created in Salla admin

### 3. Verify Webhook Settings in Salla
- Go to: `https://s.salla.sa/settings/webhooks`
- Check: Is `review.added` enabled?
- Check: Webhook URL matches our deployment
- Check: Any failed deliveries?

### 4. Test with Fresh Review
Create a NEW review in Salla admin now:
1. Place a new order
2. Add a review to that order
3. Check Vercel logs for `review.added` webhook within 30 seconds
4. Run export script: `node scripts/export-reviews.mjs`
5. Check if new review appears with correct order ID

## Technical Details

### Store Information
- **Merchant ID:** 982747175
- **Store UID:** salla:982747175
- **OAuth Scope:** Includes `reviews.read`
- **Platform:** Vercel Pro, Next.js API routes
- **Salla API Endpoint:** `https://api.salla.dev/admin/v2/reviews`

### Firestore Collections Structure
```
owners/salla:982747175/
  oauth.access_token: "ory_at_u4iYn5ojzm0oTzf8ap58Dd_KRH2M9k63f2N5MZb1YGc..."
  oauth.refresh_token: "ory_rt_..."
  oauth.expires: 1767296944

reviews/salla_982747175_order_225136883_product_1927638714/
  orderId: "225136883"
  productId: "1927638714"
  needsSallaId: true
  sallaReviewId: undefined ❌
```

### Files to Investigate
- `src/pages/api/salla/webhook.ts` (lines 1060-1140) - review.added handler
- `src/pages/api/cron/backfill-review-ids.ts` (lines 50-120) - matching logic
- `src/pages/api/jobs/fetch-review-id.ts` (lines 70-125) - background job
- `scripts/export-reviews.mjs` - diagnostic script

### Recent Commits
- `0a1faab` - Fix: use owners collection with oauth.access_token for token lookup
- `32b8735` - Fix: use order reference_id instead of internal id for Salla API compatibility
- `d2ec5c0` - Fix: fetch all reviews from Salla API (no products filter support) and match client-side

## Expected Behavior
1. Salla sends `review.added` webhook when customer submits review
2. Webhook handler saves review to Firestore with `needsSallaId: true`
3. Background job (immediate) or cron (hourly) fetches reviews from Salla API
4. Matches review by `order_id` field
5. Updates Firestore with `sallaReviewId` and sets `needsSallaId: false`

## Actual Behavior
1. ❓ Unknown if `review.added` webhooks are being sent
2. ✅ Webhook handler works (when triggered)
3. ✅ Cron job runs successfully
4. ❌ No reviews match - all return "not found"
5. ❌ 0 reviews get `sallaReviewId` populated

## Request for Antigravity
Please help identify the root cause:
1. **Primary suspicion:** `review.added` webhooks are not being sent by Salla - need to verify webhook configuration
2. **Secondary issue:** Old review data in Firestore has wrong order IDs - may need cleanup
3. **Verification needed:** Actual structure of Salla API response for `/admin/v2/reviews`

Should we:
- Create diagnostic script to dump actual API response?
- Clear old Firestore reviews and test with fresh data?
- Contact Salla support about webhook configuration?
- Check if reviews need to be "published" before appearing in API?
