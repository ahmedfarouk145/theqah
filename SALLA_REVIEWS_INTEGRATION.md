# Salla Reviews Integration - Implementation Guide

## Overview
تم تنفيذ integration كامل مع Salla Reviews API لجلب المراجعات من Salla ومطابقتها مع المراجعات المخزنة لدينا.

## 🔴 Critical Setup Requirements (MUST DO)

### 1. Enable "Questions & Reviews" Scope in Salla Partners Portal
**Status:** ⚠️ غير مفعّل حالياً

**Steps:**
1. Go to [Salla Partners Portal](https://salla.partners/)
2. Select your app
3. Scroll to **App Scope** section
4. Under **"Questions & Reviews"**:
   - ✅ Check **"Read Only"**
5. Click **"Update the scopes"**

**⚠️ Without this, API calls will fail with 403 Forbidden**

---

### 2. Change Webhook Security Strategy to "Signature"
**Status:** ⚠️ Currently using "Token" (must change)

**Steps:**
1. In the same app settings page
2. Scroll to **"Webhooks/Notifications"** section
3. Under **"Webhook Security Strategy"**:
   - Change from **Token** to **Signature**
4. Save changes

**Why:** Our code uses signature verification (`X-Salla-Signature` header)

---

### 3. Add "review.added" Event
**Status:** ✅ تم إضافته

~~**Steps:**~~
~~1. **FIRST:** Enable "Questions & Reviews" scope (step #1)~~
~~2. Save and wait a few minutes~~
~~3. Go back to **"Webhooks/Notifications"** section~~
~~4. Click **"Show Events"** in **Store Events**~~
~~5. Look for **"Miscellaneous"** tab or section~~
~~6. Find and ✅ enable **"review.added"** event~~
~~7. Save changes~~

**✅ Completed**

**Webhook URL:** `https://theqah.com/api/salla/webhook`

---

## Changes Made

### 1. OAuth Scopes Update
**File:** `src/lib/salla/scopes.ts`

Added `reviews.read` scope to CORE_SCOPES:
```typescript
export type SallaScope = 
  | 'reviews.read';  // ✨ جديد

export const CORE_SCOPES: SallaScope[] = [
  'offline_access',
  'settings.read', 
  'customers.read',
  'orders.read',
  'webhooks.read_write',
  'reviews.read'  // ✨ لقراءة المراجعات من Salla
];
```

**⚠️ Important:** Existing merchants need to re-authorize the app to get the new scope.

---

### 2. Sync Reviews Endpoint
**File:** `src/pages/api/salla/sync-reviews.ts`

New API endpoint to fetch reviews from Salla:

**Endpoint:** `GET /api/salla/sync-reviews`

**Query Parameters:**
- `storeUid` (required): Store identifier (e.g., `salla:12345`)
- `productId` (optional): Filter by product ID
- `page` (optional, default: 1): Page number
- `perPage` (optional, default: 15): Results per page

**Response:**
```json
{
  "ok": true,
  "synced": 10,
  "total": 15,
  "pagination": {...},
  "reviews": [...]
}
```

**Features:**
- ✅ Fetches reviews from Salla API (`/admin/v2/reviews`)
- ✅ Maps Salla review structure to our schema
- ✅ Adds `source: "salla_native"` tag
- ✅ Prevents duplicates (checks existing reviews)
- ✅ Batch writes to Firestore (up to 500/batch)
- ✅ Proper error handling

---

### 3. Cron Job for Auto-Sync
**File:** `src/pages/api/cron/sync-salla-reviews.ts`

Automatic synchronization every 6 hours:

**Endpoint:** `GET /api/cron/sync-salla-reviews`

**Authentication:** Requires `x-vercel-cron-secret` header or `CRON_SECRET` env variable

**Features:**
- ✅ Syncs reviews from all connected Salla stores
- ✅ Unlimited syncing (no quota limits)
- ✅ Syncs all historical reviews
- ✅ Batch processing for performance
- ✅ Prevents duplicates
- ✅ Detailed logging and error reporting

**Response:**
```json
{
  "ok": true,
  "totalStores": 10,
  "totalSynced": 45,
  "totalErrors": 0,
  "results": [
    {
      "storeUid": "salla:12345",
      "synced": 5,
      "verified": 3,
      "total": 15
    }
  ],
  "timestamp": 1702345678000
}
```

---

### 4. Cron Job for Review ID Backfill
**File:** `src/pages/api/cron/backfill-review-ids.ts`

**NEW ✨** - Automatic backfilling of Salla review IDs every 10 minutes:

**Endpoint:** `GET /api/cron/backfill-review-ids`

**Authentication:** Requires `Authorization: Bearer CRON_SECRET` header

**Purpose:** 
Salla's `review.added` webhook doesn't include the review ID in the payload. When a new review is created, we save it immediately with `orderId` + `productId` but without `sallaReviewId`. This cron job fetches the review ID from Salla API once it's indexed (10-20 seconds after creation).

**Features:**
- ✅ Processes reviews with `needsSallaId: true` flag
- ✅ Fetches reviews from Salla API by product ID
- ✅ Matches reviews by `order_id` field
- ✅ Updates Firestore with `sallaReviewId`
- ✅ Removes `needsSallaId` flag after success
- ✅ Batch processing (50 reviews per run)
- ✅ Detailed logging and error handling

**How it works:**
1. Query Firestore for reviews where `needsSallaId === true`
2. For each review, fetch from Salla API: `GET /admin/v2/reviews?products[]={productId}&per_page=100`
3. Find matching review by `order_id`
4. Update review document with `sallaReviewId` and `backfilledAt` timestamp
5. Remove `needsSallaId` flag

**Response:**
```json
{
  "success": true,
  "processed": 15,
  "updated": 12,
  "failed": 0,
  "errors": []
}
```

**Why needed:**
- Salla webhook `review.added` only sends: `order.id`, `product.id`, `rating`, `content`, `customer` BUT NOT `review.id`
- Salla API takes 10+ seconds to index new reviews (race condition)
- Widget needs `sallaReviewId` to match DOM elements with `data-review-id="{id}"`
- Without this, verification badges won't appear on Salla's native reviews

**Schedule:** Every 10 minutes via `vercel.json` crons

---

### 4. Widget Update
**File:** `public/widgets/theqah-widget.js`

Simplified widget that shows verification badge only:

**Old Behavior:**
- Displayed full list of reviews
- Fetched data from API
- Showed filters, stars, images

**New Behavior:**
- Shows single badge with logo
- Text: "تقييمات هذا المتجر تخضع للتدقيق بواسطة مشتري موثق"
- No API calls (faster, lighter)
- Responsive design

---

## Review Schema

Reviews from Salla are stored with this structure:

```typescript
{
  reviewId: "salla_12345_98765",  // Unique ID
  storeUid: "salla:12345",
  sallaReviewId: "98765",
  source: "salla_native",         // ✨ Tag to identify Salla reviews
  
  // Product
  productId: "1927638714",
  productName: "Product Name",
  
  // Content
  stars: 5,
  text: "Great product!",
  
  // Author
  author: {
    displayName: "Customer Name",
    email: "customer@example.com",
    mobile: "+966..."
  },
  
  // Status
  status: "approved",  // approved | pending | rejected
  trustedBuyer: false, // Salla reviews are NOT from our system
  verified: true,      // ✨ true = came after subscription (show logo)
  
  // Timestamps
  publishedAt: 1702345678000,
  createdAt: 1702345678000,
  updatedAt: 1702345678000,
  
  // Salla-specific
  sallaData: {
    isVerified: false,
    helpful: 5,
    notHelpful: 1
  }
}
```

---

## Deployment Steps

### 1. Environment Variables
No new environment variables needed. Uses existing:
- `SALLA_CLIENT_ID`
- `SALLA_CLIENT_SECRET`
- `CRON_SECRET` (optional, for cron job security)

### 2. Hybrid Sync Strategy

**🎯 Best Approach:** Webhook (Real-time) + GitHub Actions (Daily backup)

#### A. Real-time Webhook (Immediate)
- Salla sends webhook when new review is created
- Handler in `src/pages/api/salla/webhook.ts` processes `review.created` event
- Calls `syncSingleReview()` to fetch and save review

#### B. Daily Backup Sync (GitHub Actions - FREE)
- Runs once daily at 3 AM UTC
- Catches any missed reviews from webhook
- Syncs historical reviews
- Free 2,000 minutes/month on GitHub

**Setup:**
1. GitHub Actions file already created: `.github/workflows/sync-salla-reviews.yml`
2. Add secret in GitHub: `Settings` → `Secrets` → `CRON_SECRET`
3. Enable Actions in repo settings

**Alternative (Vercel Pro only):**
```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/sync-salla-reviews",
    "schedule": "0 3 * * *"
  }]
}
```

### 3. Re-authorization Flow
Existing merchants need to reconnect:

1. Add banner to dashboard:
   ```
   "🔄 إعادة الربط مطلوبة: قم بإعادة ربط متجرك للحصول على ميزة مزامنة المراجعات من سلة"
   ```

2. Redirect to `/api/salla/connect`

3. After authorization, trigger initial sync:
   ```
   GET /api/salla/sync-reviews?storeUid=salla:12345&perPage=50
   ```

---

## Testing

### Manual Sync Test
```bash
curl "https://theqah.com/api/salla/sync-reviews?storeUid=salla:12345&perPage=10"
```

### Cron Job Test
```bash
curl -H "x-vercel-cron-secret: YOUR_SECRET" \
  "https://theqah.com/api/cron/sync-salla-reviews"
```

### Check Synced Reviews
Query Firestore:
```javascript
db.collection("reviews")
  .where("source", "==", "salla_native")
  .where("storeUid", "==", "salla:12345")
  .get()
```

---

## Review Verification System

✨ **Unlimited Sync with Smart Verification:**

### How it works:
1. **Sync All Reviews:** جلب كل المراجعات من Salla (historical + new)
2. **Verify Post-Subscription Only:** المراجعات اللي جت **بعد** الاشتراك تاخد علامة `verified: true`
3. **Show Logo:** المراجعات المعتمدة (`verified: true`) يظهر جنبها لوجو TheQah

### Verification Logic:
```typescript
const reviewDate = new Date(sallaReview.created_at).getTime();
const subscriptionStart = subscription.startedAt;
const isVerified = subscriptionStart > 0 && reviewDate >= subscriptionStart;
```

### Review Schema:
- `verified: true` → Review came after subscription (show logo ✅)
- `verified: false` → Historical review before subscription (no logo)
- `trustedBuyer: false` → All Salla reviews (not from our invite system)

---

## Widget Display

The widget shows reviews with different badges:

### Badge Logic:
```typescript
if (review.trustedBuyer) {
  // Show "مشتري موثق" badge (from our invite system)
  badge = "verified_buyer";
} else if (review.source === "salla_native" && review.verified) {
  // Show TheQah logo (Salla review verified after subscription)
  badge = "theqah_logo";
} else {
  // No badge (historical Salla review before subscription)
  badge = null;
}
```

### Review Types:
- ✅ **Our System:** `trustedBuyer: true` → "مشتري موثق" badge
- ✅ **Salla (Verified):** `source: "salla_native"` + `verified: true` → TheQah logo
- ⭕ **Salla (Historical):** `source: "salla_native"` + `verified: false` → No badge

---

## Automation Strategy (Hybrid Approach)

We use **Webhook (real-time) + GitHub Actions (backup)** for reliability:

### ✅ Real-time: Salla Webhook
**Event:** `review.added`
**Handler:** `src/pages/api/salla/webhook.ts` (line ~1046)

```typescript
} else if (event === "review.added") {
  const reviewId = (dataRaw as { id?: string | number })?.id;
  if (reviewId && uid) {
    const { syncSingleReview } = await import("@/server/salla/sync-single-review");
    const result = await syncSingleReview(uid, String(reviewId));
    // Logs to Firestore if successful/failed
  }
}
```

**Function:** `src/server/salla/sync-single-review.ts`
- Fetches single review by ID from Salla API
- Applies verification logic
- Prevents duplicates
- ~500ms response time

---

### ✅ Backup: GitHub Actions (Cron)
**File:** `.github/workflows/sync-salla-reviews.yml`
**Schedule:** Daily at 3 AM UTC (recommended: every 6 hours)

```yaml
on:
  schedule:
    - cron: '0 3 * * *'  # Daily at 3 AM UTC
  workflow_dispatch:     # Manual trigger
```

**Endpoint:** `POST /api/cron/sync-salla-reviews`
**Auth:** `x-vercel-cron-secret: CRON_SECRET`

**What it does:**
- Syncs ALL connected stores
- Fetches ALL reviews (pagination)
- Applies verification logic
- Catches missed webhooks

---

### 📊 Why Hybrid?

| Issue | Webhook | Cron | Hybrid |
|-------|---------|------|--------|
| Webhook fails | ❌ Lost | ✅ Caught | ✅ |
| Network timeout | ❌ Lost | ✅ Caught | ✅ |
| Server downtime | ❌ Lost | ✅ Caught | ✅ |
| Real-time sync | ✅ Yes | ❌ Delayed | ✅ |
| Resource usage | ✅ Low | ⚠️ Medium | ⚠️ Medium |

---

## Next Steps

### ⚠️ Critical (Required):
1. ⏳ Enable **"Questions & Reviews"** scope in Salla Partners Portal
2. ⏳ Change webhook security to **"Signature"** (currently using Token)
3. ✅ ~~Add **"review.added"** event in Store Events~~ (Done!)
4. ⏳ Add **CRON_SECRET** to GitHub repository secrets

### 🔄 Deployment:
5. ✅ Code changes ready (webhook handler added)
6. ⏳ Deploy to production
7. ⏳ Test webhook with Salla demo store

### 📊 Post-Launch:
8. ⏳ Add dashboard UI for manual sync trigger
9. ⏳ Add "re-connect" banner for existing merchants
10. ⏳ Update widget to display Salla reviews with badge
11. ⏳ Monitor sync logs in Firestore (`webhooks_salla_known` collection)

---

## API Reference

### Salla Reviews API
**Endpoint:** `GET https://api.salla.dev/admin/v2/reviews`

**Documentation:** https://docs.salla.dev/422684m0

**Parameters:**
- `product_id` - Filter by product
- `page` - Page number
- `per_page` - Results per page (default: 15)
- `status` - Filter by status (approved, pending, rejected)

**Response Structure:**
```json
{
  "status": 200,
  "success": true,
  "data": [
    {
      "id": 123,
      "product_id": 456,
      "rating": 5,
      "comment": "Great product",
      "customer": {
        "name": "Customer Name",
        "email": "email@example.com",
        "mobile": "+966..."
      },
      "status": "approved",
      "is_verified": false,
      "helpful": 5,
      "not_helpful": 1,
      "created_at": "2025-12-12T10:00:00Z",
      "updated_at": "2025-12-12T10:00:00Z"
    }
  ],
  "pagination": {
    "count": 50,
    "total": 150,
    "perPage": 15,
    "currentPage": 1,
    "totalPages": 10
  }
}
```

---

## Troubleshooting

### Issue: 401 Unauthorized
- Check if `reviews.read` scope is granted
- Verify access token is valid
- Merchant may need to re-authorize

### Issue: Reviews not syncing
- Check store connection status (`salla.connected`)
- Verify access token is valid
- Check Firestore write permissions

### Issue: Duplicate reviews
- Check `reviewId` format: `salla_{merchantId}_{sallaReviewId}`
- Verify duplicate check logic in sync endpoint

---

## Performance Considerations

- **Cron frequency:** Every 6 hours (can be adjusted)
- **Batch size:** 50 reviews per store per cron run
- **Firestore limits:** Max 500 writes per batch
- **API rate limits:** Salla may have rate limits (monitor logs)

---

## Security

- ✅ Cron endpoint requires secret header
- ✅ Access tokens refreshed automatically
- ✅ OAuth scopes properly configured
- ✅ No sensitive data in client-side code

---

**Status:** ✅ Implementation Complete
**Version:** 1.0.0
**Date:** December 12, 2025
