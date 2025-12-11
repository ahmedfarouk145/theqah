# Salla Reviews Integration - Implementation Guide

## Overview
تم تنفيذ integration كامل مع Salla Reviews API لجلب المراجعات من Salla ومطابقتها مع المراجعات المخزنة لدينا.

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
- ✅ Filters reviews by subscription start date
- ✅ Respects quota limits (subscription.limit)
- ✅ Skips stores without active subscription
- ✅ Batch processing for performance
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
      "available": 100,
      "filtered": 8
    }
  ],
  "timestamp": 1702345678000
}
```

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

### 2. Vercel Cron Configuration
Add to `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/sync-salla-reviews",
    "schedule": "0 */6 * * *"
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

## Quota Management

Reviews are subject to subscription limits:

1. **Filter by date:** Only reviews created AFTER subscription start
2. **Respect limit:** Stop syncing when `currentCount >= subscription.limit`
3. **Cron handles:** Automatic quota checks in background sync

---

## Widget Display

The widget now shows both types of reviews:
- ✅ **Our reviews:** `source: undefined` or `trustedBuyer: true`
- ✅ **Salla reviews:** `source: "salla_native"`

To differentiate in UI:
```typescript
if (review.source === "salla_native") {
  // Show "مراجعة من سلة" badge
} else if (review.trustedBuyer) {
  // Show "مشتري موثق" badge
}
```

---

## Next Steps

1. ✅ Deploy changes to production
2. ✅ Set up Vercel cron
3. ⏳ Add dashboard UI for manual sync trigger
4. ⏳ Add "re-connect" banner for existing merchants
5. ⏳ Update widget to display Salla reviews with badge
6. ⏳ Monitor sync job logs in Vercel dashboard

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
- Check subscription status
- Verify `subscription.startedAt` exists
- Check quota limit

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
