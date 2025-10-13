# Feature Implementation Guide

This document describes the newly implemented features for safe production deployment.

## 🎯 Overview

Four major features have been implemented with safety measures and feature flags:

1. **Review Approval Workflow** - Merchant approval system for pending reviews
2. **Short Link Enhancements** - Owner tracking for short links
3. **Load Testing Infrastructure** - k6 scripts for performance testing
4. **E2E Testing** - Playwright tests for critical workflows

---

## 1. Review Approval Workflow

### What's New

- Reviews are now created with `status: 'pending'` by default
- Merchants receive notifications when reviews need approval
- New API endpoints for approving/rejecting reviews
- Pending reviews are hidden from public view until approved

### Architecture

```
Review Submission → status='pending' → Trigger (onCreate) → outbox_jobs → Email Notification
                                                           ↓
                                          Merchant Dashboard → Approve/Reject → status='approved'/'rejected'
                                                           ↓
                                          Public View (only approved reviews)
```

### Files Added/Modified

- `src/server/triggers/review-created.ts` - Trigger function for new reviews
- `src/pages/api/reviews/update-status.ts` - API endpoint for status updates
- `src/pages/api/reviews/index.ts` - Enhanced list endpoint with status filter
- `src/pages/api/reviews/submit.ts` - Added trigger call
- `src/features/reviews/PendingReviewsTab.tsx` - UI component for pending reviews
- `firestore.rules` - Updated to filter public reviews by status

### API Endpoints

#### GET `/api/reviews?status=pending`
Fetch reviews filtered by status (requires authentication)

**Query Parameters:**
- `status` (optional): `pending`, `approved`, `rejected`, or `published`

**Response:**
```json
{
  "reviews": [
    {
      "id": "review123",
      "stars": 5,
      "text": "Great product!",
      "status": "pending",
      "createdAt": 1234567890
    }
  ]
}
```

#### POST `/api/reviews/update-status`
Update review status (requires authentication)

**Request Body:**
```json
{
  "reviewId": "review123",
  "status": "approved" // or "rejected"
}
```

**Response:**
```json
{
  "ok": true,
  "reviewId": "review123",
  "status": "approved"
}
```

### Firestore Rules

Reviews are now filtered by status:
- **Public read**: Only reviews with `status: 'approved'`
- **Merchant read**: All reviews for their store
- **Admin read**: All reviews

### Outbox Jobs

When a review is created with `pending` status, a job is enqueued:

```typescript
{
  type: "merchant_review_approval_needed",
  reviewId: "review123",
  storeUid: "store456",
  merchantEmail: "merchant@example.com",
  // Email HTML template included
}
```

The outbox worker processes these jobs and sends email notifications.

---

## 2. Short Link Enhancements

### What's New

- Added `ownerStoreId` field to short links
- Enhanced security rules for short link access
- Updated function signature to accept owner information

### Files Modified

- `src/server/short-links.ts` - Added `ownerStoreId` parameter
- `firestore.rules` - Updated short_links rules

### Usage

```typescript
import { createShortLink } from '@/server/short-links';

// Create a short link with owner information
const shortUrl = await createShortLink(
  'https://example.com/target-page',
  'store-uid-123'  // ownerStoreId (optional)
);

// Returns: "https://yourapp.com/r/abc12345"
```

### Firestore Rules

Short links collection (`short_links`):
- Read/Write: Admin only
- Server-side operations use Admin SDK

---

## 3. Load Testing Infrastructure (k6)

### What's New

Three k6 test scripts for performance testing:
1. Redirect endpoint testing
2. Review creation load testing
3. Outbox jobs processing simulation

### Files Added

- `tools/loadtest/k6/redirect-test.js` - Short link redirect performance
- `tools/loadtest/k6/review-create-test.js` - Review creation load test
- `tools/loadtest/k6/outbox-jobs-test.js` - Job processing simulation

### Running Tests

```bash
# Test short link redirects
npm run load:k6

# Test review creation
npm run load:k6:reviews

# Test outbox job processing (mock)
npm run load:k6:outbox

# With custom parameters
BASE_URL=http://staging.example.com npm run load:k6
```

### Test Configuration

Each test has predefined stages:
- Ramp-up period (30s)
- Sustained load period (1-2 min)
- Ramp-down period (30s)

Thresholds:
- `http_req_duration p(95) < 500ms` (redirects)
- `http_req_duration p(95) < 2000ms` (reviews)
- `error_rate < 10-20%`

### ⚠️ Important Notes

- **DO NOT** run load tests on production
- Use Firebase Emulator or Staging environment only
- Monitor resource usage during tests
- Adjust VU (virtual user) counts based on your infrastructure

---

## 4. E2E Testing (Playwright)

### What's New

End-to-end tests for critical workflows:
1. Review approval workflow
2. Short link redirect functionality

### Files Added

- `playwright.config.ts` - Playwright configuration
- `tests/e2e/review-approval.spec.ts` - Review approval E2E test
- `tests/e2e/shortlink-redirect.spec.ts` - Short link redirect E2E test

### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode (interactive)
npm run test:e2e:ui

# With specific environment
BASE_URL=http://localhost:3000 npm run test:e2e
```

### Prerequisites

1. Install Playwright browsers:
```bash
npx playwright install chromium
```

2. Set up test environment variables:
```bash
export TEST_STORE_EMAIL="test@example.com"
export TEST_STORE_PASSWORD="testpass123"
export NEXT_PUBLIC_FLAG_DASHBOARD_V2="true"  # To test Dashboard V2 features
```

3. Ensure development server is running:
```bash
npm run dev
```

### Test Scenarios

#### Review Approval Test
1. Merchant logs in
2. Navigates to Pending Reviews tab
3. Approves a pending review
4. Verifies review is removed from pending list

#### Short Link Redirect Test
1. Creates a short link (or uses existing)
2. Visits `/r/{code}`
3. Verifies 302 redirect or 404 if not found
4. Tests hit counter increment

---

## 5. Feature Flags

### What's New

Feature flag system to control new features:
- `DASHBOARD_V2` - Controls pending reviews UI

### Files Added

- `src/features/flags/useFlag.ts` - Feature flag hook and utilities

### Usage

```typescript
import { useFlag } from '@/features/flags/useFlag';

function MyComponent() {
  const dashboardV2Enabled = useFlag('DASHBOARD_V2');
  
  if (dashboardV2Enabled) {
    return <NewFeatureComponent />;
  }
  
  return <OldFeatureComponent />;
}
```

### Configuration

Flags can be controlled via environment variables:

```bash
# .env.local
NEXT_PUBLIC_FLAG_DASHBOARD_V2=true  # Enable Dashboard V2
```

Default values (in `useFlag.ts`):
- `DASHBOARD_V2`: `false` (OFF by default)

### Extending

To add new flags:

```typescript
// In src/features/flags/useFlag.ts
const FLAGS = {
  DASHBOARD_V2: false,
  MY_NEW_FEATURE: false,  // Add here
} as const;
```

---

## 6. Dashboard Integration

### What's New

- Pending Reviews tab added to Dashboard (behind `DASHBOARD_V2` flag)
- Conditional rendering based on feature flag
- New tab appears in blue color to distinguish it

### Files Modified

- `src/pages/dashboard.tsx` - Added pending reviews tab integration

### UI Changes

When `DASHBOARD_V2` is enabled:
- New tab "التقييمات المعلقة" appears
- Clicking shows pending reviews requiring approval
- Each review has Approve/Reject buttons
- Real-time updates after status changes

---

## Security & Safety

### Firestore Security Rules

All collections have proper security rules:
- `reviews`: Public can only read approved reviews; merchants can read their own
- `short_links`: Server/admin only
- `outbox_jobs`: Server/admin only
- `outbox_dlq`: Server/admin only

### Feature Flags

All new UI features are behind feature flags:
- Default: OFF
- Must be explicitly enabled
- Can be toggled without code deployment

### Rate Limiting

Outbox worker respects rate limits defined in `rate-limit.ts`

### Error Handling

- All API endpoints have proper error handling
- Failed jobs are retried with exponential backoff
- Dead letter queue for failed jobs after 5 attempts

---

## Deployment Checklist

Before deploying to production:

### Pre-deployment
- [ ] Verify all feature flags are OFF by default
- [ ] Run `npm run lint` - must pass
- [ ] Run `npm run build` - must succeed
- [ ] Review Firestore rules changes
- [ ] Test on staging environment
- [ ] Run load tests on staging (not production!)

### Post-deployment
- [ ] Verify Firebase rules are deployed
- [ ] Monitor error logs for any issues
- [ ] Enable feature flags gradually
- [ ] Monitor email notification delivery
- [ ] Check outbox worker is processing jobs

### Testing Checklist
- [ ] Create a test review and verify it's pending
- [ ] Check merchant receives email notification
- [ ] Approve a review from dashboard
- [ ] Verify approved review is publicly visible
- [ ] Test short link creation and redirection
- [ ] Verify hit counter increments

---

## Environment Variables

Required environment variables:

```bash
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
# ... other Firebase configs

# App
NEXT_PUBLIC_BASE_URL=https://yourapp.com
APP_BASE_URL=https://yourapp.com

# Feature Flags
NEXT_PUBLIC_FLAG_DASHBOARD_V2=false  # OFF by default
```

---

## Troubleshooting

### Reviews not creating notifications
1. Check if trigger is being called in submit.ts
2. Verify outbox_jobs collection has new jobs
3. Check outbox worker logs
4. Verify email configuration

### Pending reviews not showing in dashboard
1. Verify `DASHBOARD_V2` flag is enabled
2. Check authentication token is valid
3. Verify `/api/reviews?status=pending` returns data
4. Check browser console for errors

### Short links not redirecting
1. Verify link exists in `short_links` collection
2. Check `/r/[id].tsx` page is working
3. Verify target URL is valid
4. Check hit counter is incrementing

### Load tests failing
1. Ensure you're not running on production
2. Check Firebase Emulator is running (if testing locally)
3. Verify BASE_URL is correct
4. Adjust VU counts if infrastructure can't handle load

---

## Future Enhancements

Potential improvements for future iterations:

1. **Review Expiration**: Implement `expiresAt` field for auto-reminders
2. **Batch Actions**: Bulk approve/reject for merchants
3. **Review Analytics**: Dashboard widget showing pending count
4. **Notification Preferences**: Let merchants choose notification channels
5. **Short Link Analytics**: Dashboard for link performance
6. **Remote Config**: Move feature flags to Firebase Remote Config

---

## Support

For questions or issues:
1. Check this documentation first
2. Review error logs in Cloud Logging
3. Check Firestore collections for data integrity
4. Consult the repository issues

---

## License & Credits

Implemented as part of the Theqah project.
All features follow the existing codebase patterns and security practices.
